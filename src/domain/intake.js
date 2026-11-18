// 질문 접수 검사 (docs/18) — 순수 함수. 개인정보 패턴은 기존 privacy 모듈 재사용.
import { createHash } from 'node:crypto';
import { privacyProblems } from './privacy.js';

// 제어 문자 제거 (줄바꿈·탭은 본문에서만 허용)
const clean = (v, multiline) => (typeof v === 'string'
  ? v.replace(multiline ? /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g : /[\u0000-\u001F\u007F]/g, '').trim()
  : null);

export function normalizeIntake(b) {
  return { affiliation: clean(b?.affiliation), name: clean(b?.name), title: clean(b?.title), body: clean(b?.body, true) };
}

/** @returns {string[]} 화면에 그대로 보여도 되는 문장 (입력값을 되풀이하지 않는다) */
export function checkIntake(q, rules, privacy) {
  if ([q.affiliation, q.name, q.title, q.body].some((v) => v === null)) return ['입력 형식이 올바르지 않습니다'];
  const p = [];
  for (const [k, label, max] of [['affiliation', '소속', rules.affiliationMax], ['name', '성명', rules.nameMax], ['title', '직급', rules.titleMax]]) {
    if (!q[k]) p.push(`${label}을(를) 입력해 주세요`);
    else if (q[k].length > max) p.push(`${label}은(는) ${max}자까지입니다`);
  }
  const n = q.body.length;
  if (n < rules.bodyMin) p.push(`질문을 ${rules.bodyMin}자 이상 구체적으로 써 주세요`);
  else if (n > rules.bodyMax) p.push(`질문은 ${rules.bodyMax}자까지입니다`);
  p.push(...privacyProblems([q.affiliation, q.name, q.title, q.body], privacy));
  return p;
}

const norm = (s) => s.normalize('NFC').toLowerCase().replace(/\s+/g, ' ');
export const dedupeKey = (q) => createHash('sha256').update(`${norm(q.name)}|${norm(q.body)}`).digest('hex');
export const refOf = (id) => `Q-${String(id).padStart(4, '0')}`;
