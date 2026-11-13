// FR-AUTH-06 권한 자동 순회 — 앱에 등록된 /api/admin/* 를 전부 뽑아 builder·master·무세션으로 호출
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { makeApp, client } from '../helpers.js';
import { seedPeople } from '../seed.js';

let t, s;
before(async () => { t = await makeApp(); s = seedPeople(t); });
after(() => t.close());

/** deps.adminRouter 의 라우트 목록 [{method, path}] */
function adminRoutes() {
  const out = [];
  for (const layer of t.deps.adminRouter.stack) {
    if (!layer.route) continue;
    for (const m of Object.keys(layer.route.methods)) out.push({ method: m.toUpperCase(), path: '/api/admin' + layer.route.path.replace(/:(\w+)/g, '1') });
  }
  return out;
}

test('사무국 라우트가 1개 이상 등록돼 있다', () => {
  assert.ok(adminRoutes().length >= 4, JSON.stringify(adminRoutes()));
});

test('FR-AUTH-06 모든 /api/admin/* — 무세션 401 · builder 403 · master 403', async () => {
  const builder = await s.login('TEST-001');
  const master = await s.login('MS-01');
  const anon = client(t.base);
  for (const r of adminRoutes()) {
    const call = (c) => (r.method === 'GET' ? c.get(r.path) : r.method === 'POST' ? c.post(r.path, {}) : r.method === 'PUT' ? c.put(r.path, {}) : r.method === 'PATCH' ? c.patch(r.path, {}) : c.del(r.path));
    assert.equal((await call(anon)).status, 401, `anon ${r.method} ${r.path}`);
    assert.equal((await call(builder)).status, 403, `builder ${r.method} ${r.path}`);
    assert.equal((await call(master)).status, 403, `master ${r.method} ${r.path}`);
  }
});
