// 질문 카드 검사 (FR-QC-01~05) — 형식 규칙은 화면과 공용 모듈, 개인정보는 서버에서 추가
import { composeSentence, readSeconds, checkCardShape } from '../../public/assets/js/shared/qcard-rules.js';
import { privacyProblems } from './privacy.js';

export { composeSentence, readSeconds };

/** 요청 본문 → 정규화된 카드 */
export function normalizeCard(body) {
  const s = (v) => (typeof v === 'string' ? v.trim() : v == null ? '' : null);
  const card = {
    session: typeof body?.session === 'string' ? body.session : '',
    format: typeof body?.format === 'string' ? body.format : '',
    situation: s(body?.situation),
    constraint: s(body?.constraint),
    ask: s(body?.ask),
  };
  if (card.format === 'free') { card.situation = card.situation || ''; card.constraint = card.constraint || ''; }
  return card;
}

/**
 * @returns {{problems:string[], sentence?:string, seconds?:number}}
 */
export function checkCard(card, cfg, challenge) {
  const rules = cfg.qcards;
  const problems = [];
  if ([card.situation, card.constraint, card.ask].some((v) => v === null)) return { problems: ['입력 형식이 올바르지 않습니다'] };
  if (!cfg.sessions.some((x) => x.code === card.session)) problems.push('세션을 선택해 주세요');
  problems.push(...checkCardShape(card, rules, challenge));
  problems.push(...privacyProblems([card.situation, card.constraint, card.ask], cfg.privacy));
  if (problems.length) return { problems };
  const sentence = composeSentence(card, rules, challenge);
  return { problems, sentence, seconds: readSeconds(sentence, rules) };
}
