import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { openContext, run } from '../../tools/admin.js';
import { tmpDir, testEnv } from '../helpers.js';
import { findByCode } from '../../src/repo/people.js';
import { normalizeCode } from '../../src/auth.js';
import { fixedClock } from '../../src/lib/clock.js';

const roster = new URL('../fixtures/roster_ok.csv', import.meta.url);

function ctx() {
  const dir = tmpDir();
  const c = openContext(testEnv(dir), { clock: fixedClock('2026-11-20T01:00:00Z') });
  const lines = [];
  return { c, dir, lines, sh: (...a) => run(c, a, (l) => lines.push(l)) };
}

test('FR-ADM-01 bootstrap 은 사무국이 없을 때만 · 코드는 출력에 한 번', () => {
  const { c, lines, sh } = ctx();
  assert.equal(sh('bootstrap', 'OP-01', '--name', '운영자'), 0);
  const code = lines[1].trim();
  assert.ok(findByCode(c.db, normalizeCode(code), c.secrets.sessionKey));
  assert.equal(sh('bootstrap', 'OP-09'), 1);
  assert.equal(c.db.prepare("SELECT COUNT(*) n FROM access_codes").get().n, 1);
  c.db.close();
});

test('FR-ADM-02 import-roster --dry-run 은 저장하지 않는다 · 실제 실행은 저장 · 감사 기록', () => {
  const { c, lines, sh } = ctx();
  sh('bootstrap', 'OP-01');
  assert.equal(sh('import-roster', roster.pathname.replace(/^\/([A-Za-z]:)/, '$1'), '--actor', 'OP-01', '--dry-run'), 0);
  assert.match(lines.at(-1), /\[시험\] 6명 — 추가 6/);
  assert.equal(c.db.prepare('SELECT COUNT(*) n FROM people').get().n, 1);
  assert.equal(sh('import-roster', roster.pathname.replace(/^\/([A-Za-z]:)/, '$1'), '--actor', 'OP-01'), 0);
  assert.equal(c.db.prepare('SELECT COUNT(*) n FROM people').get().n, 7);
  assert.ok(lines.some((l) => l.includes('버린 열: email')));
  assert.ok(c.db.prepare("SELECT 1 FROM audit_log WHERE action='roster_import' AND actor='OP-01'").get());
  c.db.close();
});

test('FR-ADM-02 오류가 하나라도 있으면 아무것도 저장하지 않는다', () => {
  const { c, dir, lines, sh } = ctx();
  sh('bootstrap', 'OP-01');
  const f = path.join(dir, 'bad.csv');
  fs.writeFileSync(f, 'person_id,role,name,title,lab,group\nTEST-001,builder,가,책임,PA,PA-1\nTEST-002,builder,나,책임,ZZ,PA-1\n');
  assert.equal(sh('import-roster', f, '--actor', 'OP-01'), 1);
  assert.match(lines.join('\n'), /\[멈춤\]/);
  assert.equal(c.db.prepare('SELECT COUNT(*) n FROM people').get().n, 1);
  c.db.close();
});

test('FR-ADM-08 쓰기 명령은 활성 사무국 --actor 필요', () => {
  const { c, sh } = ctx();
  sh('bootstrap', 'OP-01');
  assert.equal(sh('issue', 'OP-01'), 2);
  assert.equal(sh('issue', 'OP-01', '--actor', 'TEST-001'), 2);
  assert.equal(sh('issue', 'OP-01', '--actor', 'OP-01'), 0);
  c.db.close();
});

test('FR-ADM-05 issue-all: 결과 파일 · 덮어쓰기 거부 · 감사 1줄', () => {
  const { c, dir, sh } = ctx();
  sh('bootstrap', 'OP-01');
  sh('import-roster', roster.pathname.replace(/^\/([A-Za-z]:)/, '$1'), '--actor', 'OP-01');
  const out = path.join(dir, 'codes.csv');
  assert.equal(sh('issue-all', '--role', 'builder', '--out', out, '--actor', 'OP-01'), 0);
  const rows = fs.readFileSync(out, 'utf8').trim().split(/\r?\n/);
  assert.equal(rows.length, 5);
  assert.equal(sh('issue-all', '--role', 'builder', '--out', out, '--actor', 'OP-01'), 2);
  assert.equal(c.db.prepare("SELECT COUNT(*) n FROM audit_log WHERE target='issue-all builder'").get().n, 1);
  c.db.close();
});

test('FR-ADM-06 revoke · deactivate · list', () => {
  const { c, lines, sh } = ctx();
  sh('bootstrap', 'OP-01');
  sh('import-roster', roster.pathname.replace(/^\/([A-Za-z]:)/, '$1'), '--actor', 'OP-01');
  sh('issue', 'TEST-001', '--actor', 'OP-01');
  assert.equal(sh('revoke', 'TEST-001', '--actor', 'OP-01'), 0);
  assert.equal(sh('deactivate', 'TEST-002', '--actor', 'OP-01'), 0);
  assert.equal(sh('deactivate', 'OP-01', '--actor', 'OP-01'), 2);
  lines.length = 0;
  sh('list');
  assert.match(lines.find((l) => l.startsWith('TEST-002')), /\tN\t/);
  c.db.close();
});
