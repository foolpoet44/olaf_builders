// 테스트 공용 — 임시 폴더 + 메모리 DB 로 앱을 띄운다. 가짜 데이터만.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { resolveEnv } from '../src/config.js';
import { bootstrap } from '../src/bootstrap.js';
import { fixedClock } from '../src/lib/clock.js';
import { setLogSink } from '../src/lib/log.js';

export const logLines = [];
setLogSink({ out: (l) => logLines.push(l), err: (l) => logLines.push(l) });

export function tmpDir(prefix = 'olaf-test-') {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

export function testEnv(dir = tmpDir(), extra = {}) {
  return resolveEnv({
    NODE_ENV: 'production',
    APP_DATA_DIR: path.join(dir, 'data'),
    APP_UPLOAD_DIR: path.join(dir, 'uploads'),
    APP_CONFIG_FILE: path.join(dir, 'config', 'app-settings.json'),
    APP_RELEASE: 'test-rel',
    ...extra,
  });
}

/**
 * @param {object} [o]
 * @param {(cfg:object)=>object} [o.cfg]  설정 바꾸기
 * @param {string} [o.dbFile]
 * @param {object} [o.settingsFile]  덮어쓰기 파일 내용
 */
export async function makeApp(o = {}) {
  const dir = o.dir ?? tmpDir();
  const env = testEnv(dir, o.env);
  if (o.settingsFile) {
    fs.mkdirSync(env.configDir, { recursive: true });
    fs.writeFileSync(env.configFile, JSON.stringify(o.settingsFile));
  }
  const clock = o.clock ?? fixedClock('2026-11-20T01:00:00Z');
  const ctx = bootstrap(env, { dbFile: o.dbFile ?? ':memory:', cfgOverride: o.cfg, clock });
  const server = await new Promise((resolve) => { const s = ctx.app.listen(0, '127.0.0.1', () => resolve(s)); });
  const base = `http://127.0.0.1:${server.address().port}`;
  const close = () => new Promise((r) => { server.close(() => { try { ctx.deps.db.close(); } catch { /**/ } r(); }); server.closeAllConnections?.(); });
  return { ...ctx, env, dir, base, close, clock, db: ctx.deps.db };
}

/** fetch 래퍼 — 쿠키를 들고 다니는 클라이언트 */
export function client(base) {
  let cookie = '';
  const call = async (method, p, body, headers = {}) => {
    const h = { Origin: base, ...headers };
    if (cookie) h.Cookie = cookie;
    let payload;
    if (body instanceof Uint8Array || Buffer.isBuffer(body)) { payload = body; h['Content-Type'] ??= 'application/zip'; }
    else if (body !== undefined) { payload = JSON.stringify(body); h['Content-Type'] = 'application/json'; }
    const r = await fetch(base + p, { method, headers: h, body: payload, redirect: 'manual' });
    const sc = r.headers.get('set-cookie');
    if (sc) cookie = sc.split(';')[0].endsWith('=') ? '' : sc.split(';')[0];
    const ct = r.headers.get('content-type') || '';
    const data = ct.includes('json') ? await r.json() : Buffer.from(await r.arrayBuffer());
    return { status: r.status, body: data, headers: r.headers };
  };
  return {
    get: (p, h) => call('GET', p, undefined, h),
    post: (p, b, h) => call('POST', p, b ?? {}, h),
    put: (p, b, h) => call('PUT', p, b ?? {}, h),
    patch: (p, b, h) => call('PATCH', p, b ?? {}, h),
    del: (p, h) => call('DELETE', p, undefined, h),
    get cookie() { return cookie; },
    set cookie(v) { cookie = v; },
  };
}
