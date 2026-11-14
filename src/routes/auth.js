// /api/auth/* · /api/me · /api/config/public (docs/04_API_SPEC.md 3절)
import { normalizeUsername, ipBucket, sessionCookie } from '../auth.js';
import { findByCredentials, createSession, deleteSession, rateCount, rateHit } from '../repo/people.js';
import { ok, E, wrap } from '../lib/http.js';
import { requireLogin } from '../middleware/session.js';

export function menuFor(cfg, role) {
  return (cfg.menus[role] ?? [])
    .filter((k) => cfg.menuItems[k])
    .filter((k) => !['directory', 'events', 'bookmarks', 'surveys'].includes(k) || cfg.features?.[k])
    .map((k) => ({ key: k, ...cfg.menuItems[k] }));
}

const isSecure = (req) => req.secure;

export function authRoutes(api, deps) {
  const { db, clock, secrets } = deps;

  api.post('/auth/login', wrap(async (req, res) => {
    const cfg = deps.settings.cfg;
    const { windowMinutes, maxFailures } = cfg.auth.rateLimit;
    const bucket = ipBucket(req.ip, secrets.sessionKey);
    const win = windowMinutes * 60;
    const cnt = rateCount(db, 'auth', bucket, win, clock);
    if (cnt.n >= maxFailures) {
      const retry = Math.max(1, cnt.first + win - Math.floor(clock.now().getTime() / 1000));
      if (cnt.n === maxFailures) { deps.audit('SYSTEM', 'login_fail_limited', ''); rateHit(db, 'auth', bucket, clock); }
      throw E.rate(retry);
    }
    const username = normalizeUsername(req.body?.username);
    const password = typeof req.body?.password === 'string' ? req.body.password : '';
    const person = username ? findByCredentials(db, username, password) : null;
    if (!person) {
      rateHit(db, 'auth', bucket, clock);
      return res.status(401).json({ ok: false, error: { code: 'bad_credentials', message: '아이디 또는 비밀번호를 확인해 주세요' } });
    }
    const hours = person.role === 'office' ? cfg.auth.officeSessionHours : cfg.auth.sessionHours;
    const s = createSession(db, person, hours, clock);
    res.setHeader('Set-Cookie', sessionCookie(cfg.auth.cookieName, s.token, s.maxAge, isSecure(req)));
    ok(res, { id: person.id, name: person.name, role: person.role, menu: menuFor(cfg, person.role) });
  }));

  api.post('/auth/logout', requireLogin, (req, res) => {
    deleteSession(db, req.sessionToken);
    res.setHeader('Set-Cookie', sessionCookie(deps.settings.cfg.auth.cookieName, '', 0, isSecure(req)));
    ok(res, {});
  });

  api.get('/me', requireLogin, (req, res) => {
    const cfg = deps.settings.cfg;
    const u = req.user;
    const data = {
      id: u.id, name: u.name, title: u.title, role: u.role, lab: u.lab, grp: u.grp,
      menu: menuFor(cfg, u.role),
      features: { qcardsClosed: cfg.qcards.closed, ...deps.settings.features() },
    };
    for (const d of deps.hooks.me) d(data, req, deps);
    ok(res, data);
  });

  api.get('/config/public', (req, res) => {
    const cfg = deps.settings.cfg;
    ok(res, {
      securityLabel: cfg.meta.securityLabel,
      brand: { community: cfg.brand.community, program: cfg.brand.program, messages: cfg.brand.messages },
      cohort: { name: cfg.cohort.name },
      labs: cfg.labs.map((l) => ({ code: l.code, name: l.name, groups: l.groups })),
    });
  });
}
