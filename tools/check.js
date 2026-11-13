#!/usr/bin/env node
// 점검: /healthz · /readyz · DB 무결성 (deploy/check.ps1 이 부른다)
//   node tools/check.js [--url http://127.0.0.1:8091] [--integrity] [--db <파일>]
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

const args = process.argv.slice(2);
const opt = (name) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : undefined; };
const url = opt('--url') ?? `http://127.0.0.1:${process.env.PORT || 8091}`;
let failed = 0;
const line = (okv, msg) => { console.log(`${okv ? 'PASS' : 'FAIL'} ${msg}`); if (!okv) failed++; };

async function get(p) {
  const ctl = AbortSignal.timeout(5000);
  const r = await fetch(url + p, { signal: ctl });
  return { status: r.status, body: await r.json().catch(() => null) };
}

if (!args.includes('--integrity-only')) {
  try {
    const h = await get('/healthz');
    line(h.status === 200 && h.body?.status === 'ok', `healthz ${h.status} app=${h.body?.app} release=${h.body?.release}`);
    const r = await get('/readyz');
    line(r.status === 200 && r.body?.status === 'ready', `readyz ${r.status}${r.body?.checks ? ' checks=' + r.body.checks.join(',') : ''}`);
  } catch (e) {
    line(false, `요청 실패: ${e.cause?.code ?? e.name}`);
  }
}
if (args.includes('--integrity') || args.includes('--integrity-only')) {
  const file = opt('--db') ?? path.join(process.env.APP_DATA_DIR ?? '.local/data', 'olaf.db');
  try {
    const db = new DatabaseSync(file, { readOnly: true });
    const res = db.prepare('PRAGMA integrity_check').get().integrity_check;
    const v = db.prepare('PRAGMA user_version').get().user_version;
    db.close();
    line(res === 'ok', `integrity_check=${res} user_version=${v}`);
  } catch (e) {
    line(false, `DB 열기 실패: ${e.code ?? e.message}`);
  }
}
process.exitCode = failed ? 1 : 0;
