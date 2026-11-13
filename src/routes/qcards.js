// 질문 카드 (FR-QC-01~12 · docs/04_API_SPEC.md 5절)
import { requireRole } from '../middleware/session.js';
import { normalizeCard, checkCard } from '../domain/qcard.js';
import * as Q from '../repo/qcards.js';
import { ok, E, intParam } from '../lib/http.js';
import { isoNow } from '../lib/clock.js';

const STATUSES = ['registered', 'selected', 'asked', 'followup'];

const mine = (c, deps) => {
  const o = { id: c.id, session: c.session, status: c.status, ver: c.ver, format: c.format, situation: c.situation, constraint: c.constraint, ask: c.ask, sentence: c.sentence, seconds: c.seconds, createdAt: c.createdAt, updatedAt: c.updatedAt };
  for (const d of deps.hooks.qcardItem) d(o, c, deps);
  return o;
};

/** CSV 한 칸 — 쉼표·따옴표·줄바꿈 처리 + 수식 주입 방지 */
export function csvCell(v) {
  let s = String(v ?? '');
  if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function qcardRoutes(api, deps) {
  const { db, clock, audit } = deps;
  const closedErr = () => E.closed(deps.settings.cfg.qcards.closedMessage);

  api.get('/qcards/form', requireRole('builder'), (req, res) => {
    const cfg = deps.settings.cfg;
    if (cfg.qcards.closed) return ok(res, { closed: true, message: cfg.qcards.closedMessage });
    const q = cfg.qcards;
    ok(res, {
      closed: false,
      sessions: cfg.sessions.map((s) => ({ code: s.code, title: s.title, date: s.date })),
      me: { challenge: req.user.challenge ?? '', lab: req.user.lab, grp: req.user.grp },
      rules: { template: q.template, free: q.free, readAloudSeconds: q.readAloudSeconds, charsPerSecond: q.charsPerSecond, maxQuestionMarks: q.maxQuestionMarks, formats: q.formats, maxCardsPerPersonPerSession: q.maxCardsPerPersonPerSession },
    });
  });

  api.get('/qcards/mine', requireRole('builder'), (req, res) => {
    ok(res, { items: Q.listMine(db, req.user.id).map((c) => mine(c, deps)) });
  });

  api.post('/qcards', requireRole('builder'), (req, res) => {
    const cfg = deps.settings.cfg;
    if (cfg.qcards.closed) throw closedErr();
    const card = normalizeCard(req.body);
    const r = checkCard(card, cfg, req.user.challenge);
    if (!r.problems.length && Q.countMine(db, req.user.id, card.session) >= cfg.qcards.maxCardsPerPersonPerSession) {
      r.problems.push(`세션당 ${cfg.qcards.maxCardsPerPersonPerSession}장까지 제출할 수 있습니다`);
    }
    if (r.problems.length) throw E.validation(r.problems, '질문 카드를 확인해 주세요');
    const now = isoNow(clock);
    const id = Q.createCard(db, { author: req.user, card, sentence: r.sentence, seconds: r.seconds, now });
    audit(req.user.id, 'qcard_create', `qcard:${id}`);
    ok(res, { id, sentence: r.sentence, seconds: r.seconds }, 201);
  });

  const ownCard = (req) => {
    const c = Q.getCard(db, intParam(req.params.id));
    if (!c) throw E.notFound();
    if (c.authorId !== req.user.id) throw E.forbidden();
    return c;
  };

  api.put('/qcards/:id', requireRole('builder'), (req, res) => {
    const cfg = deps.settings.cfg;
    if (cfg.qcards.closed) throw closedErr();
    const c = ownCard(req);
    if (c.status === 'withdrawn') throw E.validation(['철회한 카드는 고칠 수 없습니다']);
    const card = normalizeCard(req.body);
    const r = checkCard(card, cfg, req.user.challenge);
    if (!r.problems.length && card.session !== c.session && Q.countMine(db, req.user.id, card.session) >= cfg.qcards.maxCardsPerPersonPerSession) {
      r.problems.push(`세션당 ${cfg.qcards.maxCardsPerPersonPerSession}장까지 제출할 수 있습니다`);
    }
    if (r.problems.length) throw E.validation(r.problems, '질문 카드를 확인해 주세요');
    const ver = Number(req.body?.ver);
    const nv = Q.addVersion(db, { id: c.id, ver, card, sentence: r.sentence, seconds: r.seconds, now: isoNow(clock), editor: req.user.id });
    if (nv === null) throw E.conflict();
    audit(req.user.id, 'qcard_edit', `qcard:${c.id}`, `v${nv}`);
    ok(res, { id: c.id, ver: nv, sentence: r.sentence, seconds: r.seconds });
  });

  api.post('/qcards/:id/withdraw', requireRole('builder'), (req, res) => {
    if (deps.settings.cfg.qcards.closed) throw closedErr();
    const c = ownCard(req);
    Q.setStatus(db, c.id, 'withdrawn', isoNow(clock));
    Q.unselect(db, c.id);
    audit(req.user.id, 'qcard_withdraw', `qcard:${c.id}`);
    ok(res, {});
  });

  // ---- 사무국 ---------------------------------------------------------
  const admin = deps.adminRouter;
  const labOrder = () => deps.settings.cfg.labs.map((l) => l.code);
  const adminItem = (c) => {
    const o = {
      id: c.id, author: { id: c.authorId, name: c.authorName, title: c.authorTitle }, session: c.session, lab: c.lab, grp: c.grp,
      status: c.status, selection: c.selection, sentence: c.sentence, seconds: c.seconds, ver: c.ver, createdAt: c.createdAt,
    };
    for (const d of deps.hooks.qcardItem) d(o, c, deps);
    return o;
  };

  admin.get('/qcards', (req, res) => {
    const { session, lab, status } = req.query;
    audit(req.user.id, 'view_operator_screen', 'qcards');
    ok(res, { items: Q.listAll(db, { session, lab, status, labOrder: labOrder() }).map(adminItem), closed: deps.settings.cfg.qcards.closed });
  });

  admin.get('/qcards/export.csv', (req, res) => {
    const cfg = deps.settings.cfg;
    const rows = Q.listAll(db, { labOrder: labOrder() }).filter((c) => c.status !== 'withdrawn');
    const head = ['세션', 'Lab', '그룹', '접수시각', '케이스ID', '성명', '직위', '상태', '선정', '낭독문장'];
    const lines = [head, ...rows.map((c) => [c.session, c.lab, c.grp, c.createdAt, c.authorId, c.authorName, c.authorTitle, c.status, c.selection ?? '', c.sentence])]
      .map((r) => r.map(csvCell).join(','));
    audit(req.user.id, 'export', 'qcards.csv', `${rows.length} rows`);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="qcards-${cfg.cohort.code}.csv"`);
    res.send('\uFEFF' + lines.join('\r\n') + '\r\n');
  });

  admin.get('/qcards/:id/versions', (req, res) => {
    const id = intParam(req.params.id);
    if (!Q.getCard(db, id)) throw E.notFound();
    ok(res, { items: Q.versions(db, id) });
  });

  admin.patch('/qcards/:id', (req, res) => {
    const c = Q.getCard(db, intParam(req.params.id));
    if (!c) throw E.notFound();
    const st = req.body?.status;
    if (!STATUSES.includes(st)) throw E.validation(['상태 값 오류']);
    if (c.status === 'withdrawn') throw E.validation(['철회된 카드입니다']);
    Q.setStatus(db, c.id, st, isoNow(clock));
    audit(req.user.id, 'qcard_status', `qcard:${c.id}`, st);
    ok(res, {});
  });

  admin.post('/qcards/:id/select', (req, res) => {
    const c = Q.getCard(db, intParam(req.params.id));
    if (!c) throw E.notFound();
    const slot = req.body?.slot;
    if (slot === null) { Q.unselect(db, c.id); audit(req.user.id, 'qcard_select', `qcard:${c.id}`, 'none'); return ok(res, {}); }
    if (!deps.settings.cfg.qcards.selectionSlots.includes(slot)) throw E.validation(['선정 칸 값 오류']);
    if (c.status === 'withdrawn') throw E.validation(['철회된 카드입니다']);
    Q.select(db, { card: c, slot, now: isoNow(clock), actor: req.user.id });
    audit(req.user.id, 'qcard_select', `qcard:${c.id}`, slot);
    ok(res, {});
  });

  admin.patch('/settings/qcards', (req, res) => {
    const closed = req.body?.closed;
    if (typeof closed !== 'boolean') throw E.validation(['closed 는 true/false']);
    deps.settings.setQcardsClosed(closed);
    audit(req.user.id, 'setting_change', 'qcards.closed', String(closed));
    ok(res, { closed });
  });

  deps.hooks.stats.push(() => ({
    qcards: Object.fromEntries(db.prepare("SELECT session || '·' || lab AS k, COUNT(*) n FROM qcards WHERE status != 'withdrawn' GROUP BY session, lab ORDER BY session, lab").all().map((x) => [x.k, x.n])),
  }));
}
