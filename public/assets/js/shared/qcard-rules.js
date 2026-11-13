// 질문 카드 규칙 — 화면과 서버가 같은 파일을 쓴다 (docs/09_TESTING.md 2절).
// public/ 아래이므로 비밀·DB 접근·사람 정보를 넣지 않는다. 순수 함수만.

/** 낭독 문장 조립 */
export function composeSentence(card, rules, challenge) {
  const ch = challenge ?? '';
  const ask = String(card.ask ?? '').trim();
  if (card.format === 'free') return `${rules.free.lead.replaceAll('{challenge}', ch)} ${ask}`;
  const lead = rules.template.lead
    .replaceAll('{challenge}', ch)
    .replaceAll('{situation}', String(card.situation ?? '').trim())
    .replaceAll('{constraint}', String(card.constraint ?? '').trim());
  return `${lead} ${ask}`;
}

/** 낭독 시간(초) — 공백을 뺀 글자 수 ÷ 초당 글자 수, 올림 */
export function readSeconds(sentence, rules) {
  const chars = String(sentence).replace(/\s/g, '').length;
  return Math.ceil(chars / rules.charsPerSecond);
}

const len = (v) => String(v ?? '').trim().length;

/**
 * 형식 검사 (개인정보 검사는 서버가 추가로 한다).
 * @returns {string[]} 화면에 그대로 보여도 되는 문장 (입력값을 되풀이하지 않는다)
 */
export function checkCardShape(card, rules, challenge) {
  const p = [];
  if (!rules.formats.allowed.includes(card.format)) { p.push('질문 방식: 허용되지 않은 방식입니다'); return p; }
  if (card.format === 'free') {
    const n = len(card.ask);
    if (n < rules.free.minChars) p.push(`자유 질문을 ${rules.free.minChars}자 이상 구체적으로 써 주세요`);
    else if (n > rules.free.maxChars) p.push(`자유 질문은 ${rules.free.maxChars}자까지입니다`);
    if (len(card.situation) || len(card.constraint)) p.push('자유 질문에는 하려는 일·현재 제약 칸을 쓰지 않습니다 — 질문 칸 하나에 써 주세요');
  } else {
    for (const [f, label] of [['situation', '하려는 일'], ['constraint', '현재 제약'], ['ask', '확인할 기준·질문']]) {
      const n = len(card[f]);
      if (n < rules.template.minChars[f]) p.push(`${label}을(를) ${rules.template.minChars[f]}자 이상 구체적으로 써 주세요`);
      else if (n > rules.template.maxChars[f]) p.push(`${label}은(는) ${rules.template.maxChars[f]}자까지입니다`);
    }
  }
  const all = [card.situation, card.constraint, card.ask].map((x) => String(x ?? '')).join(' ');
  const marks = (all.match(/[?？]/g) || []).length;
  if (marks > rules.maxQuestionMarks) p.push('1카드 1질문: 물음표는 1개까지입니다 — 질문을 나눠 카드를 따로 만들어 주세요');
  if (!p.length) {
    const sec = readSeconds(composeSentence(card, rules, challenge), rules);
    if (sec > rules.readAloudSeconds) p.push(`${rules.readAloudSeconds}초 이내: 지금 약 ${sec}초 — 줄여 주세요`);
  }
  return p;
}
