// /api/admin/* 공통 (docs/04_API_SPEC.md 7절)
import { Router } from 'express';
import { requireRole } from '../middleware/session.js';
import { listPeople, getPerson, issueCode, deactivate } from '../repo/people.js';
import { listAudit } from '../repo/audit.js';
import { formatCode } from '../auth.js';
import { ok, E, wrap } from '../lib/http.js';
import { isoNow } from '../lib/clock.js';

export function adminRoutes(api, deps) {
  const { db, clock, audit } = deps;
  const r = Router();
  r.use(requireRole('office'));

  r.get('/people', (req, res) => {
    audit(req.user.id, 'view_operator_screen', 'people');
    const items = listPeople(db).map((p) => ({
      id: p.id, role: p.role, name: p.name, title: p.title, lab: p.lab, grp: p.grp, active: p.active,
      hasCode: p.hasCode, lastLoginDay: p.lastLoginDay,
    }));
    ok(res, { items });
  });

  r.post('/people/:id/code', wrap(async (req, res) => {
    const p = getPerson(db, req.params.id);
    if (!p) throw E.notFound();
    if (!p.active) throw E.validation(['비활성 사용자입니다']);
    const code = issueCode(db, { personId: p.id, actor: req.user.id, key: deps.secrets.sessionKey, clock });
    audit(req.user.id, 'code_issue', p.id);
    const data = { personId: p.id, code: formatCode(code) };
    for (const d of deps.hooks.codeIssue) d(data, p, deps);
    ok(res, data);
  }));

  r.post('/people/:id/deactivate', (req, res) => {
    const p = getPerson(db, req.params.id);
    if (!p) throw E.notFound();
    if (p.id === req.user.id) throw E.validation(['자기 자신은 비활성화할 수 없습니다']);
    deactivate(db, p.id, isoNow(clock));
    audit(req.user.id, 'person_deactivate', p.id);
    ok(res, {});
  });

  r.get('/audit', (req, res) => {
    const page = Math.max(1, Number(req.query.page) || 1);
    audit(req.user.id, 'view_operator_screen', 'audit');
    ok(res, listAudit(db, { page }));
  });

  r.get('/stats', (req, res) => {
    const people = Object.fromEntries(db.prepare('SELECT role, COUNT(*) n FROM people WHERE active = 1 GROUP BY role').all().map((x) => [x.role, x.n]));
    const data = { people };
    for (const p of deps.hooks.stats) Object.assign(data, p(deps));
    ok(res, data);
  });

  api.use('/admin', r);
  deps.adminRouter = r;
}
