import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadConfig } from '../../src/config.js';
import { parseWrappedCsv, parseLegacyQcardsCsv, parseLegacyAuditCsv } from '../../src/domain/legacy.js';

const cfg = loadConfig({});
const wrap = (lines) => lines.map((line) => `"${line.replaceAll('"', '""')}"`).join('\n');

test('래핑된 CSV를 원래 열 구조로 복원한다', () => {
  assert.deepEqual(parseWrappedCsv(wrap(['a,b', '1,"two"'])), [['a', 'b'], ['1', 'two']]);
});

test('질문 카드 CSV에서 작성자와 카드를 정규화한다', () => {
  const value = JSON.stringify({ card: {
    card_uid: 'c-1', session: 'DT', case_id: 'T-PA-1-01', writer_name: '테스트', writer_title: '책임',
    question_format: 'template', situation: '현장 상황입니다', constraint: '데이터가 부족합니다', ask: '해결 방법이 있나요?',
    written_at: '2026-10-21T00:00:00Z',
  } });
  const parsed = parseLegacyQcardsCsv(wrap(['#,Value', `0,"${value.replaceAll('"', '""')}"`]), cfg);
  assert.deepEqual(parsed.problems, []);
  assert.equal(parsed.people[0].grp, 'PA-1');
  assert.equal(parsed.cards[0].sourceId, 'c-1');
  assert.match(parsed.cards[0].sentence, /해결 방법/);
});

test('감사 CSV를 정규화한다', () => {
  const parsed = parseLegacyAuditCsv(wrap(['id,at,actor_id,action,target,result,source_hash', '1,2026-10-21T00:00:00Z,OP-01,migrate,v1,ok,NULL']));
  assert.deepEqual(parsed.problems, []);
  assert.equal(parsed.entries[0].action, 'migrate');
});
