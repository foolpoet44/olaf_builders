// 질문 접수 (docs/18) — 무로그인 제출 · 사무국 현황·카드 · 불변성 · 판정 금지
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { makeApp, client } from '../helpers.js';
import { seedPeople } from '../seed.js';
import { checkIntake, normalizeIntake, dedupeKey } from '../../src/domain/intake.js';

let t, s, anon, admin, builder;
const ok = { affiliation: 'DT-1', name: '홍길동', title: '책임', body: '가상 설비의 시뮬레이션 정합도는 어떤 기준으로 확인하나요?' };
const extra = [];
before(async () => {
  t = await makeApp();
  s = seedPeople(t);
  anon = client(t.base);
  [admin, builder] = await Promise.all([s.login('OP-01'), s.login('TEST-001')]);
});
after(async () => { await t.close(); for (const a of extra) await a.close().catch(() => {}); });

const rules = { bodyMin: 10, bodyMax: 500, nameMax: 20, affiliationMax: 40, titleMax: 20 };
test('단위: 길이 경계·필수·개인정보 거부 · 입력값 미반복', () => {
  const c = (o) => checkIntake(normalizeIntake({ ...ok, ...o }), rules, undefined);
  assert.deepEqual(c({}), []);
  assert.equal(c({ body: 'a'.repeat(9) }).length, 1);
  assert.deepEqual(c({ body: 'a'.repeat(10) }), []);
  assert.deepEqual(c({ body: 'a'.repeat(500) }), []);
  assert.equal(c({ body: 'a'.repeat(501) }).length, 1);
  assert.equal(c({ name: '' }).length, 1);
  assert.equal(c({ name: 'x'.repeat(21) }).length, 1);
  assert.equal(c({ body: '사번 1234567 입니다 알려주세요' }).length, 1);
  assert.equal(c({ body: '메일 a@b.com 으로 부탁드립니다 감사' }).length, 1);
  assert.ok(!c({ body: '메일 a@b.com 으로 부탁드립니다 감사' }).join().includes('a@b.com'));
  assert.equal(checkIntake(normalizeIntake({ ...ok, name: 5 }), rules).length, 1);
  assert.equal(dedupeKey(normalizeIntake(ok)), dedupeKey(normalizeIntake({ ...ok, name: ' 홍길동 ', body: ok.body.toUpperCase() })));
});

test('로그인 없이 제출 201 · 같은 내용 재전송은 200 · 같은 접수번호', async () => {
  const a = await anon.post('/api/intake', ok);
  assert.equal(a.status, 201);
  assert.match(a.body.data.ref, /^Q-\d{4}$/);
  const b = await anon.post('/api/intake', ok);
  assert.equal(b.status, 200);
  assert.equal(b.body.data.ref, a.body.data.ref);
  assert.equal(t.db.prepare('SELECT COUNT(*) n FROM intake_questions').get().n, 1);
});

test('400: 문제 목록 · 저장 안 됨 · 개인정보 칸 자체가 없다', async () => {
  const r = await anon.post('/api/intake', { ...ok, body: '짧음', name: '' });
  assert.equal(r.status, 400);
  assert.ok(r.body.error.problems.length >= 2);
  const cols = t.db.prepare('PRAGMA table_info(intake_questions)').all().map((c) => c.name);
  for (const bad of ['email', 'employee_id', 'phone', 'sabun']) assert.ok(!cols.includes(bad));
  const e = await anon.post('/api/intake', { ...ok, body: '제 번호는 010-1234-5678 입니다 연락주세요' });
  assert.equal(e.status, 400);
});

test('감사 기록 intake_create (행위자 ANON)', () => {
  const r = t.db.prepare("SELECT actor FROM audit_log WHERE action = 'intake_create'").get();
  assert.equal(r.actor, 'ANON');
});

test('사무국만 현황·카드: 비로그인 401 · builder 403', async () => {
  assert.equal((await anon.get('/api/admin/intake')).status, 401);
  assert.equal((await builder.get('/api/admin/intake')).status, 403);
  assert.equal((await builder.patch('/api/admin/intake/1', { status: 'hidden' })).status, 403);
});

test('현황: 건수·이름순 제출자 · 카드는 접수순 · 판정 키 없음', async () => {
  await anon.post('/api/intake', { ...ok, name: '가나다', affiliation: 'PA-1', body: '로봇 안전 인증은 어느 단계에서 확인하나요?' });
  await anon.post('/api/intake', { ...ok, body: '두 번째 질문입니다 근거 데이터는 어디서 얻나요?' });
  const r = await admin.get('/api/admin/intake');
  assert.equal(r.status, 200);
  const { summary, items } = r.body.data;
  assert.equal(summary.total, 3);
  assert.deepEqual(summary.submitters.map((x) => [x.name, x.count]), [['가나다', 1], ['홍길동', 2]]);
  assert.deepEqual(items.map((x) => x.id), [...items.map((x) => x.id)].sort((a, b) => a - b));
  assert.doesNotMatch(JSON.stringify(r.body), /"(rank|score|top|best|recommend)/i);
  const f = (await admin.get('/api/admin/intake?affiliation=PA-1')).body.data.items;
  assert.equal(f.length, 1);
});

test('숨김은 상태 변경 · 목록·건수에서 빠짐 · 본문 UPDATE·DELETE 는 DB 가 거부', async () => {
  const id = (await admin.get('/api/admin/intake')).body.data.items[0].id;
  assert.equal((await admin.patch(`/api/admin/intake/${id}`, { status: 'hidden' })).status, 200);
  assert.equal((await admin.patch(`/api/admin/intake/${id}`, { status: 'x' })).status, 400);
  const r = (await admin.get('/api/admin/intake')).body.data;
  assert.equal(r.summary.total, 2);
  assert.equal((await admin.get('/api/admin/intake?hidden=1')).body.data.items.length, 3);
  assert.throws(() => t.db.prepare("UPDATE intake_questions SET body = 'x' WHERE id = ?").run(id), /immutable/);
  assert.throws(() => t.db.prepare('DELETE FROM intake_questions WHERE id = ?').run(id), /never deleted/);
  assert.ok(t.db.prepare("SELECT 1 FROM audit_log WHERE action = 'intake_status'").get());
});

test('횟수 제한 429 · 기능 끔 404', async () => {
  const a = await makeApp({ cfg: (c) => ({ ...c, intake: { ...c.intake, rateLimit: { max: 2, windowSec: 600 } } }) });
  extra.push(a);
  const c = client(a.base);
  const mk = (n) => ({ ...ok, body: `질문 번호 ${n} 입니다 자세히 알려 주세요` });
  assert.equal((await c.post('/api/intake', mk(1))).status, 201);
  assert.equal((await c.post('/api/intake', mk(2))).status, 201);
  const r = await c.post('/api/intake', mk(3));
  assert.equal(r.status, 429);
  assert.ok(r.headers.get('retry-after'));
  const off = await makeApp({ cfg: (c2) => ({ ...c2, features: { ...c2.features, intake: false } }) });
  extra.push(off);
  const oc = client(off.base);
  assert.equal((await oc.post('/api/intake', ok)).status, 404);
  assert.equal((await oc.get('/api/intake/form')).status, 404);
});
