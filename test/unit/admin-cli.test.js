import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { openContext, run } from '../../tools/admin.js';
import { tmpDir, testEnv } from '../helpers.js';
import { findByCredentials } from '../../src/repo/people.js';
import { fixedClock } from '../../src/lib/clock.js';

const roster = new URL('../fixtures/roster_ok.csv', import.meta.url);
const adminPassword = 'Admin#Password9';

function ctx() {
  const dir = tmpDir();
  const c = openContext(testEnv(dir), { clock: fixedClock('2026-11-20T01:00:00Z') });
  const lines = [];
  const call = (password, ...args) => run(c, args, (line) => lines.push(line), () => password);
  const sh = (...args) => call(adminPassword, ...args);
  return { c, dir, lines, sh, call };
}

const bootstrap = (sh) => sh('bootstrap', 'OP-01', '--name', '운영자', '--username', 'admin.local', '--password-stdin');

test('FR-ADM-01 bootstrap 은 사무국이 없을 때만 · 아이디/비밀번호 해시 저장', () => {
  const { c, lines, sh } = ctx();
  assert.equal(bootstrap(sh), 0);
  assert.ok(findByCredentials(c.db, 'ADMIN.LOCAL', adminPassword));
  assert.ok(!lines.join('\n').includes(adminPassword));
  assert.equal(sh('bootstrap', 'OP-09'), 1);
  const row = c.db.prepare('SELECT username, password_hash FROM credentials').get();
  assert.equal(row.username, 'admin.local');
  assert.notEqual(row.password_hash, adminPassword);
  c.db.close();
});

test('FR-ADM-02 import-roster --dry-run 은 저장하지 않는다 · 실제 실행은 저장 · 감사 기록', () => {
  const { c, lines, sh } = ctx();
  bootstrap(sh);
  assert.equal(sh('import-roster', roster.pathname.replace(/^\/([A-Za-z]:)/, '$1'), '--actor', 'OP-01', '--dry-run'), 0);
  assert.match(lines.at(-1), /\[시험\] 6명 — 추가 6/);
  assert.equal(c.db.prepare('SELECT COUNT(*) n FROM people').get().n, 1);
  assert.equal(sh('import-roster', roster.pathname.replace(/^\/([A-Za-z]:)/, '$1'), '--actor', 'OP-01'), 0);
  assert.equal(c.db.prepare('SELECT COUNT(*) n FROM people').get().n, 7);
  assert.ok(lines.some((line) => line.includes('버린 열: email')));
  assert.ok(c.db.prepare("SELECT 1 FROM audit_log WHERE action='roster_import' AND actor='OP-01'").get());
  c.db.close();
});

test('FR-ADM-02 오류가 하나라도 있으면 아무것도 저장하지 않는다', () => {
  const { c, dir, lines, sh } = ctx();
  bootstrap(sh);
  const file = path.join(dir, 'bad.csv');
  fs.writeFileSync(file, 'person_id,role,name,title,lab,group\nTEST-001,builder,가,책임,PA,PA-1\nTEST-002,builder,나,책임,ZZ,PA-1\n');
  assert.equal(sh('import-roster', file, '--actor', 'OP-01'), 1);
  assert.match(lines.join('\n'), /\[멈춤\]/);
  assert.equal(c.db.prepare('SELECT COUNT(*) n FROM people').get().n, 1);
  c.db.close();
});

test('FR-ADM-08 쓰기 명령은 활성 사무국 --actor 필요', () => {
  const { c, sh } = ctx();
  bootstrap(sh);
  assert.equal(sh('set-credentials', 'OP-01', '--username', 'admin.local', '--password-stdin'), 2);
  assert.equal(sh('set-credentials', 'OP-01', '--username', 'admin.local', '--password-stdin', '--actor', 'TEST-001'), 2);
  assert.equal(sh('set-credentials', 'OP-01', '--username', 'admin.local', '--password-stdin', '--actor', 'OP-01'), 0);
  c.db.close();
});

test('FR-ADM-04 set-credentials 는 정책 검사 · 중복 아이디 거부 · 평문 미출력', () => {
  const { c, lines, sh, call } = ctx();
  bootstrap(sh);
  sh('import-roster', roster.pathname.replace(/^\/([A-Za-z]:)/, '$1'), '--actor', 'OP-01');
  assert.equal(call('short', 'set-credentials', 'TEST-001', '--username', 'builder.one', '--password-stdin', '--actor', 'OP-01'), 2);
  assert.equal(sh('set-credentials', 'TEST-001', '--username', 'admin.local', '--password-stdin', '--actor', 'OP-01'), 2);
  assert.equal(sh('set-credentials', 'TEST-001', '--username', 'builder.one', '--password-stdin', '--actor', 'OP-01'), 0);
  assert.ok(findByCredentials(c.db, 'builder.one', adminPassword));
  assert.ok(!lines.join('\n').includes(adminPassword));
  c.db.close();
});

test('FR-ADM-06 deactivate 는 로그인 정보·세션 삭제 · list 는 아이디만 표시', () => {
  const { c, lines, sh } = ctx();
  bootstrap(sh);
  sh('import-roster', roster.pathname.replace(/^\/([A-Za-z]:)/, '$1'), '--actor', 'OP-01');
  sh('set-credentials', 'TEST-002', '--username', 'builder.two', '--password-stdin', '--actor', 'OP-01');
  assert.equal(sh('deactivate', 'TEST-002', '--actor', 'OP-01'), 0);
  assert.equal(sh('deactivate', 'OP-01', '--actor', 'OP-01'), 2);
  assert.equal(c.db.prepare('SELECT COUNT(*) n FROM credentials WHERE person_id = ?').get('TEST-002').n, 0);
  lines.length = 0;
  sh('list');
  assert.match(lines.find((line) => line.startsWith('TEST-002')), /\tN\t-\t/);
  c.db.close();
});

test('B12 참여자는 완화된 비밀번호 규칙(6자 이상) · 사무국은 강한 규칙 유지', () => {
  const { c, sh, call } = ctx();
  bootstrap(sh);
  sh('import-roster', roster.pathname.replace(/^\/([A-Za-z]:)/, '$1'), '--actor', 'OP-01');
  assert.equal(call('123456', 'set-credentials', 'TEST-001', '--username', 'builder.one', '--password-stdin', '--actor', 'OP-01'), 0);
  assert.ok(findByCredentials(c.db, 'builder.one', '123456'));
  assert.equal(call('12345', 'set-credentials', 'TEST-002', '--username', 'builder.two', '--password-stdin', '--actor', 'OP-01'), 2);
  assert.equal(call('123456', 'set-credentials', 'OP-01', '--username', 'admin.local', '--password-stdin', '--actor', 'OP-01'), 2);
  c.db.close();
});

test('B12 import-credentials: 시험은 저장 안 함 · 오류 하나면 전부 취소 · 비밀번호 미출력 · 감사 기록', () => {
  const { c, dir, lines, sh } = ctx();
  bootstrap(sh);
  sh('import-roster', roster.pathname.replace(/^\/([A-Za-z]:)/, '$1'), '--actor', 'OP-01');
  const file = path.join(dir, 'cred.csv');
  fs.writeFileSync(file, '﻿person_id,username,password\nTEST-001,gildong.hong,654321\nTEST-002,sunsin.lee,765432\n');
  assert.equal(sh('import-credentials', file, '--actor', 'OP-01', '--dry-run'), 0);
  assert.equal(c.db.prepare('SELECT COUNT(*) n FROM credentials').get().n, 1);   // 사무국만
  fs.writeFileSync(file, 'person_id,username,password\nTEST-001,gildong.hong,654321\nTEST-002,gildong.hong,765432\n');
  assert.equal(sh('import-credentials', file, '--actor', 'OP-01'), 1);
  assert.equal(c.db.prepare('SELECT COUNT(*) n FROM credentials').get().n, 1);
  fs.writeFileSync(file, 'person_id,username,password\nTEST-001,gildong.hong,654321\nTEST-002,sunsin.lee,765432\n');
  assert.equal(sh('import-credentials', file, '--actor', 'OP-01'), 0);
  assert.ok(findByCredentials(c.db, 'gildong.hong', '654321'));
  assert.ok(findByCredentials(c.db, 'sunsin.lee', '765432'));
  assert.ok(!lines.join('\n').match(/654321|765432/));
  assert.ok(c.db.prepare("SELECT 1 FROM audit_log WHERE action='credentials_import'").get());
  c.db.close();
});
