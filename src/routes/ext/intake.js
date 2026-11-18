// 질문 접수 (docs/18) — 로그인 없이 제출(공개 · 횟수 제한) · 사무국은 현황·카드 보기·숨김
import { featureGate } from '../../middleware/feature.js';
import { normalizeIntake, checkIntake, dedupeKey, refOf } from '../../domain/intake.js';
import * as I from '../../repo/intake.js';
import { rateCount, rateHit } from '../../repo/people.js';
import { ok, E, intParam } from '../../lib/http.js';
import { isoNow } from '../../lib/clock.js';

export function intake(api, deps, key) {
  const { db, clock, audit } = deps;
  const gate = featureGate(key);
  const rules = () => deps.settings.cfg.intake;

  api.get('/intake/form', gate, (req, res) => {
    const { bodyMin, bodyMax, nameMax, affiliationMax, titleMax } = rules();
    ok(res, { rules: { bodyMin, bodyMax, nameMax, affiliationMax, titleMax } });
  });

  api.post('/intake', gate, (req, res) => {
    const cfg = deps.settings.cfg;
    const { max, windowSec } = cfg.intake.rateLimit;
    const bucket = req.ip || 'unknown';
    const cnt = rateCount(db, 'intake', bucket, windowSec, clock);
    if (cnt.n >= max) throw E.rate(Math.max(1, windowSec - (Math.floor(clock.now().getTime() / 1000) - cnt.first)));
    const q = normalizeIntake(req.body);
    const problems = checkIntake(q, cfg.intake, cfg.privacy);
    if (problems.length) throw E.validation(problems, '입력을 확인해 주세요');
    rateHit(db, 'intake', bucket, clock);
    const r = I.create(db, q, dedupeKey(q), isoNow(clock));
    if (!r.duplicate) audit('ANON', 'intake_create', `intake:${r.id}`);
    ok(res, { id: r.id, ref: refOf(r.id) }, r.duplicate ? 200 : 201);
  });

  // ---- 사무국 ---------------------------------------------------------
  const admin = deps.adminRouter;
  admin.use('/intake', gate);

  admin.get('/intake', (req, res) => {
    const { affiliation, name, hidden } = req.query;
    audit(req.user.id, 'view_operator_screen', 'intake');
    ok(res, {
      summary: I.summary(db),
      items: I.list(db, { affiliation, name, includeHidden: hidden === '1' }),
    });
  });

  admin.patch('/intake/:id', (req, res) => {
    const id = intParam(req.params.id);
    if (!I.get(db, id)) throw E.notFound();
    const st = req.body?.status;
    if (!['open', 'hidden'].includes(st)) throw E.validation(['상태 값 오류']);
    I.setStatus(db, id, st, isoNow(clock));
    audit(req.user.id, 'intake_status', `intake:${id}`, st);
    ok(res, {});
  });
}
