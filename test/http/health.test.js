import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { makeApp, client } from '../helpers.js';

let t;
before(async () => { t = await makeApp(); });
after(() => t.close());

test('FR-SYS-02 /healthz 형식', async () => {
  const r = await client(t.base).get('/healthz');
  assert.equal(r.status, 200);
  assert.deepEqual(r.body, { status: 'ok', app: 'olaf-builders', release: 'test-rel' });
  assert.equal(r.headers.get('cache-control'), 'no-store');
});

test('FR-SYS-03 /readyz 준비 완료', async () => {
  const r = await client(t.base).get('/readyz');
  assert.equal(r.status, 200);
  assert.equal(r.body.status, 'ready');
});

test('보안 머리글 · X-Powered-By 없음', async () => {
  const r = await client(t.base).get('/healthz');
  assert.equal(r.headers.get('x-powered-by'), null);
  assert.equal(r.headers.get('x-frame-options'), 'DENY');
  assert.match(r.headers.get('content-security-policy'), /script-src 'self'/);
});

test('FR-SYS-08 소스·설정·패키지·이탈 경로는 열리지 않는다', async () => {
  const c = client(t.base);
  for (const p of ['/src/server.js', '/config/app.json', '/package.json', '/%2e%2e/package.json', '/..%2fpackage.json', '/.gitignore', '/node_modules/express/package.json']) {
    const r = await c.get(p);
    assert.equal(r.status, 404, p);
  }
});

test('FR-SYS-09 알 수 없는 /api 경로는 404 JSON', async () => {
  const r = await client(t.base).get('/api/nothing');
  assert.equal(r.status, 404);
  assert.equal(r.body.ok, false);
  assert.equal(r.body.error.code, 'not_found');
});

test('정적 파일 제공 · 없는 화면은 404 HTML', async () => {
  const c = client(t.base);
  assert.equal((await c.get('/assets/app.css')).status, 200);
  const r = await c.get('/nope.html');
  assert.equal(r.status, 404);
  assert.match(r.body.toString(), /페이지를 찾을 수 없습니다/);
});

test('FR-SYS-03 DB 가 닫히면 /readyz 503 + 실패 항목 이름만', async () => {
  const t2 = await makeApp();
  t2.db.close();
  const r = await client(t2.base).get('/readyz');
  assert.equal(r.status, 503);
  assert.deepEqual(r.body.checks, ['db']);
  assert.equal(r.body.app, 'olaf-builders');
  await t2.close();
});

test('FR-SYS-05 secrets.json 은 첫 실행 때 만들고 다시 만들지 않는다', async () => {
  const f = `${t.env.configDir}/secrets.json`;
  const first = fs.readFileSync(f, 'utf8');
  const t3 = await makeApp({ dir: t.dir });
  assert.equal(fs.readFileSync(f, 'utf8'), first);
  assert.equal(t3.secretsCreated, false);
  await t3.close();
});

test('큰 JSON 본문은 413', async () => {
  const r = await fetch(`${t.base}/api/x`, { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: t.base }, body: JSON.stringify({ a: 'x'.repeat(70_000) }) });
  assert.equal(r.status, 413);
});
