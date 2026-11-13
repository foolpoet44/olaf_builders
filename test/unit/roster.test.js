import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { loadConfig } from '../../src/config.js';
import { parseRosterCsv, parseCsv } from '../../src/domain/roster.js';
import { findPersonalInfo } from '../../src/domain/privacy.js';

const cfg = loadConfig({});
const ok = fs.readFileSync(new URL('../fixtures/roster_ok.csv', import.meta.url), 'utf8');
const HDR = 'person_id,role,name,title,lab,group';

test('FR-ADM-03 BOM 있는 UTF-8 명단 읽기 · 이메일 열은 버림', () => {
  const r = parseRosterCsv(ok, cfg);
  assert.deepEqual(r.problems, []);
  assert.deepEqual(r.dropped, ['email']);
  assert.equal(r.people.length, 6);
  assert.equal(r.people[3].challenge, '라인 시뮬레이터, 1단계');
  assert.deepEqual(r.people[4].assigned, ['PA', 'AA-1']);
  assert.ok(r.people.every((p) => !('email' in p)));
});

test('FR-ADM-03 사번 열은 버리고 계속', () => {
  const r = parseRosterCsv(`${HDR},사번\nTEST-001,builder,가나다,책임,PA,PA-1,${'1'.repeat(6)}\n`, cfg);
  assert.deepEqual(r.problems, []);
  assert.deepEqual(r.dropped, ['사번']);
});

test('FR-ADM-03 진단 값 열(gap) 이 있으면 전체 거부', () => {
  const r = parseRosterCsv(`${HDR},gap\nTEST-001,builder,가나다,책임,PA,PA-1,2\n`, cfg);
  assert.equal(r.people.length, 0);
  assert.match(r.problems[0], /진단 값 열/);
});

test('FR-ADM-03 값에 사번 패턴이 있으면 거부', () => {
  const r = parseRosterCsv(`${HDR}\nTEST-001,builder,가나다,책임${'7'.repeat(7)},PA,PA-1\n`, cfg);
  assert.ok(r.problems.some((p) => /사번/.test(p)));
});

test('FR-ADM-03 모르는 Lab · 그 Lab 의 그룹이 아님 · 중복 ID · ID 형식', () => {
  const r = parseRosterCsv(`${HDR}\nTEST-001,builder,가,책임,XX,PA-1\nTEST-002,builder,나,책임,PA,AA-1\nTEST-002,builder,다,책임,PA,PA-1\nOP1,office,라,,,\n`, cfg);
  const all = r.problems.join('\n');
  assert.match(all, /2행: 알 수 없는 Lab/);
  assert.match(all, /3행: 그 Lab 의 그룹이 아닙니다/);
  assert.match(all, /4행: 중복 ID/);
  assert.match(all, /5행: office ID 형식/);
});

test('필수 열 없음 · 알 수 없는 열', () => {
  const r = parseRosterCsv('person_id,role,name,phone\n', cfg);
  assert.match(r.problems.join(), /알 수 없는 열: phone/);
  assert.match(r.problems.join(), /필수 열이 없습니다/);
});

test('CSV 따옴표 · CRLF', () => {
  assert.deepEqual(parseCsv('a,"b ""q"", c"\r\n1,2\r\n'), [['a', 'b "q", c'], ['1', '2']]);
});

test('FR-QC-05 개인정보 패턴: 사번 6·7자리 · 색상코드·8자리 날짜 통과 · 이메일 · 휴대전화', () => {
  assert.deepEqual(findPersonalInfo('번호 ' + '1'.repeat(7)), ['employee_id']);
  assert.deepEqual(findPersonalInfo('가' + '2'.repeat(6)), ['employee_id']);
  assert.deepEqual(findPersonalInfo('#171717 · 20261020'), []);
  assert.deepEqual(findPersonalInfo('x@example.com'), ['email']);
  assert.deepEqual(findPersonalInfo('010-1234-5678'), ['phone']);
});
