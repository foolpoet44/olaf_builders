// 응답 공통 형식 (docs/04_API_SPEC.md 1절)
export class HttpError extends Error {
  constructor(status, code, message, problems) {
    super(message);
    this.status = status;
    this.code = code;
    this.problems = problems;
  }
}

export const ok = (res, data = {}, status = 200) => res.status(status).json({ ok: true, data });

export const fail = (res, status, code, message, problems) =>
  res.status(status).json({ ok: false, error: { code, message, ...(problems ? { problems } : {}) } });

export const E = {
  validation: (problems, message = '입력을 확인해 주세요') => new HttpError(400, 'validation', message, problems),
  badRequest: (message = '요청 형식이 올바르지 않습니다') => new HttpError(400, 'bad_request', message),
  login: () => new HttpError(401, 'login_required', '로그인이 필요합니다'),
  forbidden: () => new HttpError(403, 'forbidden', '권한이 없습니다'),
  notFound: () => new HttpError(404, 'not_found', '없는 주소입니다'),
  conflict: (message = '다른 곳에서 먼저 바뀌었습니다. 새로고침 후 다시 시도해 주세요') => new HttpError(409, 'conflict', message),
  closed: (message) => new HttpError(410, 'closed', message),
  tooLarge: () => new HttpError(413, 'too_large', '요청이 너무 큽니다'),
  rate: (retryAfter) => Object.assign(new HttpError(429, 'rate_limited', '잠시 후 다시 시도해 주세요'), { retryAfter }),
};

/** async 라우트의 throw 를 에러 미들웨어로 넘긴다 (Express 5 는 기본 지원하지만 명시) */
export const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

/** 정수 경로 파라미터 */
export function intParam(v) {
  const n = Number(v);
  if (!Number.isInteger(n) || n < 1) throw E.notFound();
  return n;
}
