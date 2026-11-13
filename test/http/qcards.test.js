import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { makeApp } from '../helpers.js';
import { seedPeople } from '../seed.js';

let t, s, b1, b2, admin, master;
const card = (o = {}) => ({ session: 'DT', format: 'template', situation: '설비 이상 징후 판별', constraint: '고장 이력 데이터가 부족한', ask: '이 현실 이슈를 해결한 사례가 있나?', ...o });

before(async () => {
  t = await makeApp();
  s = seedPeople(t);
  b1 = await s.login('TEST-001');
  b2 = await s.login('TEST-002');
  admin = await s.login('OP-01');
  master = await s.login('MS-01');
});
after(() => t.close());

test('FR-QC-01 작성 폼: 본인 과제·세션·규칙 · builder 만', async () => {
  const r = await b1.get('/api/qcards/form');
  assert.equal(r.status, 200);
  assert.equal(r.body.data.me.challenge, '설비 예지보전');
  assert.deepEqual(r.body.data.sessions.map((x) => x.code), ['DT', 'AA']);
  assert.equal((await master.get('/api/qcards/form')).status, 403);
  assert.equal((await admin.post('/api/qcards', card())).status, 403);
});

test('FR-QC-01 제출: 작성자는 로그인 신원 · 문장·초 응답 · 감사 기록', async () => {
  const r = await b1.post('/api/qcards', { ...card(), writer_name: '다른사람', authorId: 'TEST-002' });
  assert.equal(r.status, 201);
  assert.match(r.body.data.sentence, /^내 과제 「설비 예지보전」에서/);
  const row = t.db.prepare('SELECT author_id, lab, grp FROM qcards WHERE id = ?').get(r.body.data.id);
  assert.deepEqual({ ...row }, { author_id: 'TEST-001', lab: 'PA', grp: 'PA-1' });
  assert.ok(t.db.prepare("SELECT 1 FROM audit_log WHERE action='qcard_create'").get());
});

test('FR-QC-12 검사 실패는 400 problems · 입력값 되풀이 없음', async () => {
  const id7 = '8'.repeat(7);
  const r = await b1.post('/api/qcards', card({ situation: `담당 ${id7} 설비 판별`, ask: '사례가 있나? 또?' }));
  assert.equal(r.status, 400);
  assert.equal(r.body.error.code, 'validation');
  assert.ok(r.body.error.problems.length >= 2);
  assert.ok(!JSON.stringify(r.body).includes(id7));
});

test('FR-QC-06 세션당 1인 3장 · 4번째 400 · 다른 세션은 가능', async () => {
  for (let i = 0; i < 3; i++) assert.equal((await b2.post('/api/qcards', card())).status, 201);
  const r = await b2.post('/api/qcards', card());
  assert.equal(r.status, 400);
  assert.match(r.body.error.problems.join(), /3장까지/);
  assert.equal((await b2.post('/api/qcards', card({ session: 'AA' }))).status, 201);
});

test('FR-QC-07 수정은 새 판 · 판 번호 불일치 409 · 남의 카드 403 · 철회', async () => {
  const id = (await b1.post('/api/qcards', card({ session: 'AA' }))).body.data.id;
  const up = await b1.put(`/api/qcards/${id}`, card({ session: 'AA', ask: '고친 질문으로 사례가 있나?', ver: 1 }));
  assert.equal(up.status, 200);
  assert.equal(up.body.data.ver, 2);
  assert.equal((await b1.put(`/api/qcards/${id}`, card({ session: 'AA', ver: 1 }))).status, 409);
  assert.equal((await b2.put(`/api/qcards/${id}`, card({ session: 'AA', ver: 2 }))).status, 403);
  assert.equal(t.db.prepare('SELECT COUNT(*) n FROM qcard_versions WHERE card_id = ?').get(id).n, 2);
  assert.equal((await b1.post(`/api/qcards/${id}/withdraw`)).status, 200);
  const mine = (await b1.get('/api/qcards/mine')).body.data.items.find((c) => c.id === id);
  assert.equal(mine.status, 'withdrawn');
  assert.equal(mine.ver, 2);
});

test('FR-QC-09 사무국 목록: 세션→Lab(설정 순서)→그룹→접수순 · 작성자 성명·직위', async () => {
  await (await s.login('TEST-003')).post('/api/qcards', card());   // AA-1
  await (await s.login('TEST-004')).post('/api/qcards', card());   // DT-1
  const r = await admin.get('/api/admin/qcards?session=DT');
  const order = r.body.data.items.map((c) => `${c.lab}/${c.grp}`);
  const labRank = { PA: 0, AA: 1, DT: 2 };
  const ranks = r.body.data.items.map((c) => labRank[c.lab]);
  assert.deepEqual(ranks, [...ranks].sort((a, b) => a - b), order.join());
  assert.equal(r.body.data.items[0].author.name, '가나다');
  assert.ok(t.db.prepare("SELECT 1 FROM audit_log WHERE action='view_operator_screen' AND target='qcards'").get());
});

test('FR-QC-10 상태 변경 · Lab당 대표 1개 (다른 카드 선정 시 이전 해제) · 판 이력', async () => {
  const items = (await admin.get('/api/admin/qcards?session=DT&lab=PA')).body.data.items.filter((c) => c.status !== 'withdrawn');
  const [a, b] = items;
  assert.equal((await admin.post(`/api/admin/qcards/${a.id}/select`, { slot: '대표' })).status, 200);
  assert.equal((await admin.post(`/api/admin/qcards/${b.id}/select`, { slot: '대표' })).status, 200);
  const after = (await admin.get('/api/admin/qcards?session=DT&lab=PA')).body.data.items;
  assert.equal(after.find((c) => c.id === a.id).selection, null);
  assert.equal(after.find((c) => c.id === b.id).selection, '대표');
  assert.equal(after.find((c) => c.id === b.id).status, 'selected');
  assert.equal((await admin.patch(`/api/admin/qcards/${a.id}`, { status: 'asked' })).status, 200);
  assert.equal((await admin.patch(`/api/admin/qcards/${a.id}`, { status: 'nope' })).status, 400);
  assert.equal((await admin.get(`/api/admin/qcards/${a.id}/versions`)).body.data.items.length, 1);
});

test('FR-QC-11 CSV: UTF-8 BOM · 열 순서 · 철회 제외 · 수식 주입 방지 · 감사 export', async () => {
  const r = await admin.get('/api/admin/qcards/export.csv');
  assert.equal(r.status, 200);
  assert.match(r.headers.get('content-type'), /text\/csv; charset=utf-8/);
  const text = r.body.toString('utf8');
  assert.ok(text.startsWith('\uFEFF세션,Lab,그룹,접수시각,케이스ID,성명,직위,상태,선정,낭독문장\r\n'));
  assert.ok(!text.includes('withdrawn'));
  assert.ok(t.db.prepare("SELECT 1 FROM audit_log WHERE action='export'").get());
  const { csvCell } = await import('../../src/routes/qcards.js');
  assert.equal(csvCell('=HYPERLINK("x")'), '"\'=HYPERLINK(""x"")"');
});

test('FR-QC-08 마감 스위치: 작성·수정·철회 410 · 폼은 마감 안내 · 설정 파일에 저장 · 다시 열기', async () => {
  assert.equal((await admin.patch('/api/admin/settings/qcards', { closed: true })).status, 200);
  const f = await b1.get('/api/qcards/form');
  assert.deepEqual(Object.keys(f.body.data).sort(), ['closed', 'message']);
  assert.equal((await b1.post('/api/qcards', card())).status, 410);
  const mine = (await b1.get('/api/qcards/mine')).body.data.items[0];
  assert.equal((await b1.put(`/api/qcards/${mine.id}`, card({ ver: mine.ver }))).status, 410);
  assert.equal((await b1.get('/api/me')).body.data.features.qcardsClosed, true);
  assert.equal(JSON.parse(fs.readFileSync(t.env.configFile, 'utf8')).qcards.closed, true);
  await admin.patch('/api/admin/settings/qcards', { closed: false });
  assert.equal((await b1.get('/api/qcards/form')).body.data.closed, false);
});
