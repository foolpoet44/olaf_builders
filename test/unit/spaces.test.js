// FR-BRD-02·03 can() 판정표 — 역할 × 공간 종류 × read/write × labLoungeCrossLabRead × master scope
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadConfig, deepMerge } from '../../src/config.js';
import { buildSpaces, can } from '../../src/domain/spaces.js';

const base = loadConfig({});
const cfgWith = (over) => deepMerge(structuredClone(base), over);

const builderPA1 = { id: 'TEST-001', role: 'builder', lab: 'PA', grp: 'PA-1', active: true };
const builderAA1 = { id: 'TEST-003', role: 'builder', lab: 'AA', grp: 'AA-1', active: true };
const office = { id: 'OP-01', role: 'office', active: true };
const masterPA = { id: 'MS-01', role: 'master', assigned: ['PA'], active: true };
const masterGrp = { id: 'MS-02', role: 'master', assigned: ['AA-1'], active: true };

const sp = (cfg, id) => buildSpaces(cfg).find((s) => s.id === id);

test('공간 펼치기: notice 1 · Lab 라운지 3 · 그룹 보드 7 · master_qa · build_review · material_qa(기능 켜짐)', () => {
  const ids = buildSpaces(base).map((s) => s.id);
  assert.deepEqual(ids, ['notice', 'lab_lounge/PA', 'lab_lounge/AA', 'lab_lounge/DT', 'group_board/PA-1', 'group_board/PA-2', 'group_board/PA-3',
    'group_board/AA-1', 'group_board/AA-2', 'group_board/DT-1', 'group_board/DT-2', 'master_qa', 'build_review', 'material_qa']);
  const off = buildSpaces(cfgWith({ features: { materialThreads: false } })).map((s) => s.id);
  assert.ok(!off.includes('material_qa'));
});

test('판정표 (labLoungeCrossLabRead=true · master scope=lab)', () => {
  const T = [
    // [사람, 공간, read, write]
    [builderPA1, 'notice', true, false],
    [builderPA1, 'lab_lounge/PA', true, true],
    [builderPA1, 'lab_lounge/AA', true, false],
    [builderPA1, 'group_board/PA-1', true, true],
    [builderPA1, 'group_board/PA-2', false, false],
    [builderPA1, 'group_board/AA-1', false, false],
    [builderPA1, 'master_qa', true, true],
    [builderPA1, 'build_review', true, true],
    [builderAA1, 'group_board/AA-1', true, true],
    [masterPA, 'notice', true, false],
    [masterPA, 'lab_lounge/PA', true, true],
    [masterPA, 'lab_lounge/DT', true, false],
    [masterPA, 'group_board/PA-3', true, true],
    [masterPA, 'group_board/DT-1', false, false],
    [office, 'notice', true, true],
    [office, 'group_board/DT-2', true, true],
  ];
  for (const [p, id, r, w] of T) {
    assert.equal(can(p, 'read', sp(base, id), base), r, `${p.id} read ${id}`);
    assert.equal(can(p, 'write', sp(base, id), base), w, `${p.id} write ${id}`);
  }
});

test('labLoungeCrossLabRead=false 면 다른 Lab 라운지 읽기 불가', () => {
  const c = cfgWith({ visibility: { labLoungeCrossLabRead: false } });
  assert.equal(can(builderPA1, 'read', sp(c, 'lab_lounge/AA'), c), false);
  assert.equal(can(builderPA1, 'read', sp(c, 'lab_lounge/PA'), c), true);
  assert.equal(can(masterPA, 'read', sp(c, 'lab_lounge/DT'), c), false);
});

test('master scope=group: 담당 그룹 보드 · 그 그룹의 Lab 라운지만', () => {
  const c = cfgWith({ roles: { master: { scope: 'group' } } });
  assert.equal(can(masterGrp, 'write', sp(c, 'group_board/AA-1'), c), true);
  assert.equal(can(masterGrp, 'write', sp(c, 'group_board/AA-2'), c), false);
  assert.equal(can(masterGrp, 'write', sp(c, 'lab_lounge/AA'), c), true);
  assert.equal(can(masterGrp, 'write', sp(c, 'lab_lounge/PA'), c), false);
});

test('master scope=all: 전 공간 (operator 쓰기 규칙은 제외)', () => {
  const c = cfgWith({ roles: { master: { scope: 'all' } } });
  assert.equal(can(masterGrp, 'write', sp(c, 'group_board/DT-2'), c), true);
  assert.equal(can(masterGrp, 'write', sp(c, 'notice'), c), false);
});

test('기본 거부: 알 수 없는 역할·비활성·없는 공간·잘못된 동작', () => {
  assert.equal(can({ role: 'viewer' }, 'read', sp(base, 'notice'), base), false);
  assert.equal(can({ ...builderPA1, active: false }, 'read', sp(base, 'notice'), base), false);
  assert.equal(can(builderPA1, 'read', undefined, base), false);
  assert.equal(can(builderPA1, 'delete', sp(base, 'notice'), base), false);
});
