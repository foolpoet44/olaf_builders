import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { makeApp, client, logLines } from '../helpers.js';
import { seedPeople } from '../seed.js';

let t, s;
before(async () => { t = await makeApp(); s = seedPeople(t); });
after(() => t.close());

test('FR-AUTH-01 로그인 성공 · 쿠키 속성 (HttpOnly · SameSite=Lax · HTTP 에서는 Secure 없음)', async () => {
  const c = client(t.base);
  const r = await c.post('/api/auth/login', { code: s.codes['TEST-001'].toLowerCase().replace(/-/g, ' ') });
  assert.equal(r.status, 200);
  assert.equal(r.body.data.role, 'builder');
  const sc = r.headers.get('set-cookie');
  assert.match(sc, /^olaf_session=[A-Za-z0-9_-]{43}; Path=\/; HttpOnly; SameSite=Lax; Max-Age=28800$/);
  const me = await c.get('/api/me');
  assert.equal(me.body.data.id, 'TEST-001');
  assert.deepEqual(me.body.data.menu.map((m) => m.key), ['materials', 'qcards', 'board', 'directory', 'events', 'bookmarks']);
});

test('FR-AUTH-02 사무국 세션은 2시간', async () => {
  const r = await client(t.base).post('/api/auth/login', { code: s.codes['OP-01'] });
  assert.match(r.headers.get('set-cookie'), /Max-Age=7200/);
});

test('FR-AUTH-04 로그아웃하면 서버 세션이 지워진다', async () => {
  const c = await s.login('TEST-002');
  const saved = c.cookie;
  assert.equal((await c.post('/api/auth/logout')).status, 200);
  c.cookie = saved;
  assert.equal((await c.get('/api/me')).status, 401);
});

test('FR-AUTH-06 세션 없으면 401', async () => {
  const r = await client(t.base).get('/api/me');
  assert.equal(r.status, 401);
  assert.equal(r.body.error.code, 'login_required');
});

test('세션 만료 후 401', async () => {
  const c = await s.login('TEST-003');
  t.clock.advance(9 * 3600_000);
  assert.equal((await c.get('/api/me')).status, 401);
  t.clock.advance(-9 * 3600_000);
});

test('출처가 다른 쓰기 요청은 403 bad_origin', async () => {
  const r = await client(t.base).post('/api/auth/login', { code: 'x' }, { Origin: 'http://evil.example' });
  assert.equal(r.status, 403);
  assert.equal(r.body.error.code, 'bad_origin');
  const r2 = await fetch(t.base + '/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
  assert.equal(r2.status, 403);
});

test('공개 설정은 로그인 없이 · 사람·비밀 없음', async () => {
  const r = await client(t.base).get('/api/config/public');
  assert.equal(r.status, 200);
  assert.equal(r.body.data.securityLabel, 'LGE Internal Use Only');
  assert.ok(!JSON.stringify(r.body).includes('sessionKey'));
});

test('FR-AUTH-03 틀린 코드 20회까지 401, 21회째 429 · 맞는 코드는 세지 않음', async () => {
  const t2 = await makeApp();
  const s2 = seedPeople(t2);
  const c = client(t2.base);
  for (let i = 0; i < 5; i++) assert.equal((await c.post('/api/auth/login', { code: s2.codes['TEST-001'] })).status, 200);
  for (let i = 0; i < 20; i++) assert.equal((await c.post('/api/auth/login', { code: 'AAAA-BBBB-CCCC' })).status, 401, `try ${i}`);
  const r = await c.post('/api/auth/login', { code: s2.codes['TEST-001'] });
  assert.equal(r.status, 429);
  assert.ok(Number(r.headers.get('retry-after')) > 0);
  assert.equal(t2.db.prepare("SELECT COUNT(*) n FROM audit_log WHERE action='login_fail_limited'").get().n, 1);
  t2.clock.advance(11 * 60_000);
  assert.equal((await c.post('/api/auth/login', { code: s2.codes['TEST-001'] })).status, 200);
  await t2.close();
});

test('FR-AUTH-05 비활성화하면 기존 세션이 다음 요청에서 끊기고 코드도 무효', async () => {
  const c = await s.login('TEST-004');
  const admin = await s.login('OP-01');
  assert.equal((await admin.post('/api/admin/people/TEST-004/deactivate')).status, 200);
  assert.equal((await c.get('/api/me')).status, 401);
  assert.equal((await client(t.base).post('/api/auth/login', { code: s.codes['TEST-004'] })).status, 401);
});

test('FR-ADM-04 코드 재발급 → 옛 코드 무효 · 새 코드 한 번만 · 감사 기록', async () => {
  const admin = await s.login('OP-01');
  const r = await admin.post('/api/admin/people/TEST-003/code');
  assert.equal(r.status, 200);
  assert.match(r.body.data.code, /^[0-9A-Z]{4}-[0-9A-Z]{4}-[0-9A-Z]{4}$/);
  assert.equal((await client(t.base).post('/api/auth/login', { code: s.codes['TEST-003'] })).status, 401);
  assert.equal((await client(t.base).post('/api/auth/login', { code: r.body.data.code })).status, 200);
  const people = await admin.get('/api/admin/people');
  assert.ok(!JSON.stringify(people.body).includes(r.body.data.code));
  assert.ok(t.db.prepare("SELECT 1 FROM audit_log WHERE action='code_issue' AND target='TEST-003'").get());
  s.codes['TEST-003'] = r.body.data.code;
});

test('FR-ADM-07 사람 목록: ID순 · 코드 원문 없음 · 로그인 날짜만', async () => {
  const admin = await s.login('OP-01');
  const r = await admin.get('/api/admin/people');
  const ids = r.body.data.items.map((p) => p.id);
  assert.deepEqual(ids, [...ids].sort());
  const p = r.body.data.items.find((x) => x.id === 'TEST-001');
  assert.match(p.lastLoginDay, /^\d{4}-\d{2}-\d{2}$/);
  assert.equal(p.hasCode, true);
});

test('NFR-08 로그에 코드·접속 주소가 없다', () => {
  const all = logLines.join('\n');
  for (const c of Object.values(s.codes)) assert.ok(!all.includes(c));
  assert.ok(!all.includes('127.0.0.1'));
});
