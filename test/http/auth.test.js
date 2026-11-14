import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { makeApp, client, logLines } from '../helpers.js';
import { seedPeople } from '../seed.js';

let t, s;
before(async () => { t = await makeApp(); s = seedPeople(t); });
after(() => t.close());

test('FR-AUTH-01 로그인 성공 · 쿠키 속성 (HttpOnly · SameSite=Lax · HTTP 에서는 Secure 없음)', async () => {
  const c = client(t.base);
  const login = s.credentials['TEST-001'];
  const r = await c.post('/api/auth/login', { username: login.username.toUpperCase(), password: login.password });
  assert.equal(r.status, 200);
  assert.equal(r.body.data.role, 'builder');
  const sc = r.headers.get('set-cookie');
  assert.match(sc, /^olaf_session=[A-Za-z0-9_-]{43}; Path=\/; HttpOnly; SameSite=Lax; Max-Age=28800$/);
  const me = await c.get('/api/me');
  assert.equal(me.body.data.id, 'TEST-001');
  assert.deepEqual(me.body.data.menu.map((m) => m.key), ['materials', 'qcards', 'board', 'directory', 'events', 'bookmarks']);
});

test('FR-AUTH-02 사무국 세션은 2시간', async () => {
  const r = await client(t.base).post('/api/auth/login', s.credentials['OP-01']);
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
  const r = await client(t.base).post('/api/auth/login', { username: 'nobody', password: 'wrong' }, { Origin: 'http://evil.example' });
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

test('FR-AUTH-03 틀린 비밀번호 20회까지 401, 21회째 429 · 성공 로그인도 제한 상태에서는 차단', async () => {
  const t2 = await makeApp();
  const s2 = seedPeople(t2);
  const c = client(t2.base);
  for (let i = 0; i < 5; i++) assert.equal((await c.post('/api/auth/login', s2.credentials['TEST-001'])).status, 200);
  for (let i = 0; i < 20; i++) assert.equal((await c.post('/api/auth/login', { username: 'test.001', password: 'Wrong#Password9' })).status, 401, `try ${i}`);
  const r = await c.post('/api/auth/login', s2.credentials['TEST-001']);
  assert.equal(r.status, 429);
  assert.ok(Number(r.headers.get('retry-after')) > 0);
  assert.equal(t2.db.prepare("SELECT COUNT(*) n FROM audit_log WHERE action='login_fail_limited'").get().n, 1);
  t2.clock.advance(11 * 60_000);
  assert.equal((await c.post('/api/auth/login', s2.credentials['TEST-001'])).status, 200);
  await t2.close();
});

test('FR-AUTH-05 비활성화하면 기존 세션이 끊기고 로그인 정보가 삭제된다', async () => {
  const c = await s.login('TEST-004');
  const admin = await s.login('OP-01');
  assert.equal((await admin.post('/api/admin/people/TEST-004/deactivate')).status, 200);
  assert.equal((await c.get('/api/me')).status, 401);
  assert.equal((await client(t.base).post('/api/auth/login', s.credentials['TEST-004'])).status, 401);
});

test('FR-ADM-04 로그인 정보 변경 → 이전 비밀번호 무효 · 평문 비밀번호 미응답 · 감사 기록', async () => {
  const admin = await s.login('OP-01');
  const previous = s.credentials['TEST-003'];
  const next = { username: 'changed.user', password: 'Changed#Password9' };
  const r = await admin.post('/api/admin/people/TEST-003/credentials', next);
  assert.equal(r.status, 200);
  assert.equal(r.body.data.username, next.username);
  assert.ok(!JSON.stringify(r.body).includes(next.password));
  assert.equal((await client(t.base).post('/api/auth/login', previous)).status, 401);
  assert.equal((await client(t.base).post('/api/auth/login', next)).status, 200);
  const people = await admin.get('/api/admin/people');
  assert.ok(!JSON.stringify(people.body).includes(next.password));
  assert.ok(t.db.prepare("SELECT 1 FROM audit_log WHERE action='credentials_set' AND target='TEST-003'").get());
  s.credentials['TEST-003'] = next;
});

test('FR-ADM-07 사람 목록: ID순 · 사용자명과 로그인 날짜 · 비밀번호 없음', async () => {
  const admin = await s.login('OP-01');
  const r = await admin.get('/api/admin/people');
  const ids = r.body.data.items.map((p) => p.id);
  assert.deepEqual(ids, [...ids].sort());
  const p = r.body.data.items.find((x) => x.id === 'TEST-001');
  assert.match(p.lastLoginDay, /^\d{4}-\d{2}-\d{2}$/);
  assert.equal(p.hasCredentials, true);
  assert.equal(p.username, 'test.001');
  assert.ok(!JSON.stringify(r.body).includes('password_hash'));
});

test('NFR-08 로그에 비밀번호·접속 주소가 없다', () => {
  const all = logLines.join('\n');
  for (const c of Object.values(s.credentials)) assert.ok(!all.includes(c.password));
  assert.ok(!all.includes('127.0.0.1'));
});
