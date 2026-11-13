import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadConfig } from '../../src/config.js';
import { checkCard, composeSentence, readSeconds, normalizeCard } from '../../src/domain/qcard.js';

const cfg = loadConfig({});
const R = cfg.qcards;
const CH = '설비 예지보전';
const tpl = (o = {}) => normalizeCard({ session: 'DT', format: 'template', situation: '설비 이상 징후 판별', constraint: '고장 이력 데이터가 부족한', ask: '이 현실 이슈를 해결한 사례가 있나?', ...o });
const free = (ask) => normalizeCard({ session: 'DT', format: 'free', ask });

test('고정 예제 (docs/09 2절): 문장 · 공백 제외 40자 · 8초', () => {
  const s = composeSentence({ format: 'free', ask: '현장 데이터가 부족할 때 시뮬레이션으로 보완한 사례가 있나?' }, R, CH);
  assert.equal(s, '내 과제 「설비 예지보전」 관련 — 현장 데이터가 부족할 때 시뮬레이션으로 보완한 사례가 있나?');
  assert.equal(s.replace(/\s/g, '').length, 40);
  assert.equal(readSeconds(s, R), 8);
});

test('template 문장 조립', () => {
  assert.equal(composeSentence(tpl(), R, CH), '내 과제 「설비 예지보전」에서 설비 이상 징후 판별하려는데, 현재 고장 이력 데이터가 부족한 제약이 있다. 이 현실 이슈를 해결한 사례가 있나?');
});

test('FR-QC-02 정상 카드 통과', () => {
  const r = checkCard(tpl(), cfg, CH);
  assert.deepEqual(r.problems, []);
  assert.ok(r.seconds > 0);
});

test('FR-QC-02 글자 수: template 최소·최대 · free 최소 · free 에 template 칸 금지', () => {
  assert.match(checkCard(tpl({ situation: '짧음' }), cfg, CH).problems.join(), /하려는 일을\(를\) 5자 이상/);
  assert.match(checkCard(tpl({ ask: 'x'.repeat(201) }), cfg, CH).problems.join(), /200자까지/);
  assert.match(checkCard(free('짧은 질문?'), cfg, CH).problems.join(), /15자 이상/);
  assert.match(checkCard(normalizeCard({ session: 'DT', format: 'free', ask: '충분히 긴 자유 질문입니다 사례가 있나요?', situation: '하려는 일 적음' }), cfg, CH).problems.join(), /쓰지 않습니다/);
});

test('FR-QC-03 물음표 2개 거부 · ？ 와 ? 합산', () => {
  assert.match(checkCard(tpl({ ask: '사례가 있나? 방법은?' }), cfg, CH).problems.join(), /물음표는 1개까지/);
  assert.match(checkCard(tpl({ constraint: '데이터가 없는？', ask: '사례가 있나?' }), cfg, CH).problems.join(), /물음표/);
});

test('FR-QC-04 경계: 공백 제외 200자 = 40초 통과 · 201자 = 41초 거부', () => {
  const lead = R.free.lead.replaceAll('{challenge}', CH);
  const leadLen = lead.replace(/\s/g, '').length;
  const ask200 = '가'.repeat(200 - leadLen);
  const r1 = checkCard(free(ask200), cfg, CH);
  assert.deepEqual(r1.problems, []);
  assert.equal(r1.seconds, 40);
  const r2 = checkCard(free(ask200 + '가'), cfg, CH);
  assert.match(r2.problems.join(), /40초 이내: 지금 약 41초/);
});

test('FR-QC-05 개인정보: 사번 6·7자리 · 이메일 · 휴대전화 거부 · 입력값을 되풀이하지 않음', () => {
  const id7 = '9'.repeat(7);
  const p = checkCard(tpl({ situation: `담당 ${id7} 설비 판별` }), cfg, CH).problems.join();
  assert.match(p, /사번/);
  assert.ok(!p.includes(id7));
  assert.match(checkCard(tpl({ situation: '담당 ' + '3'.repeat(6) + ' 설비 판별' }), cfg, CH).problems.join(), /사번/);
  assert.match(checkCard(tpl({ constraint: 'x@example.com 에게 받은' }), cfg, CH).problems.join(), /이메일/);
  assert.match(checkCard(tpl({ constraint: '010-1234-5678 로 연락하는' }), cfg, CH).problems.join(), /휴대전화/);
  assert.deepEqual(checkCard(tpl({ constraint: '색상 #171717 기준이 없는' }), cfg, CH).problems, []);
});

test('세션 코드가 없으면 거부 · 알 수 없는 방식 거부', () => {
  assert.match(checkCard(tpl({ session: 'ZZ' }), cfg, CH).problems.join(), /세션/);
  assert.match(checkCard(tpl({ format: 'poem' }), cfg, CH).problems.join(), /방식/);
});
