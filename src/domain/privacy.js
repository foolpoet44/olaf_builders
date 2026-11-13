// 개인정보 패턴 검사 (docs/06_SECURITY.md 6절) — 값은 돌려주지 않고 종류 이름만
export const DEFAULT_PATTERNS = {
  employeeIdPattern: '(?<![0-9#\\[])[0-9]{6,7}(?![0-9\\]])',
  emailPattern: '[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\\.[A-Za-z]{2,}',
  phonePattern: '(?<![0-9])01[016789][- .]?[0-9]{3,4}[- .]?[0-9]{4}(?![0-9])',
};

const cache = new WeakMap();
function compiled(privacy = DEFAULT_PATTERNS) {
  let c = cache.get(privacy);
  if (!c) {
    c = {
      employee_id: new RegExp(privacy.employeeIdPattern),
      email: new RegExp(privacy.emailPattern),
      phone: new RegExp(privacy.phonePattern),
    };
    cache.set(privacy, c);
  }
  return c;
}

/** @returns {Array<'employee_id'|'email'|'phone'>} */
export function findPersonalInfo(text, privacy) {
  if (text == null || text === '') return [];
  const s = String(text);
  const c = compiled(privacy);
  return Object.entries(c).filter(([, re]) => re.test(s)).map(([k]) => k);
}

export const PRIVACY_MESSAGES = {
  employee_id: '개인정보: 사번으로 보이는 6~7자리 숫자가 있습니다 — 숫자를 하이픈 등으로 나눠 써 주세요',
  email: '개인정보: 이메일 주소가 있습니다',
  phone: '개인정보: 휴대전화 번호가 있습니다',
};

/** 여러 텍스트를 검사해 화면용 문제 문장 목록을 돌려준다 */
export function privacyProblems(texts, privacy) {
  const kinds = new Set();
  for (const t of texts) for (const k of findPersonalInfo(t, privacy)) kinds.add(k);
  return [...kinds].map((k) => PRIVACY_MESSAGES[k]);
}
