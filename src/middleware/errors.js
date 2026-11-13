import { randomUUID } from 'node:crypto';
import { HttpError, fail } from '../lib/http.js';
import { log } from '../lib/log.js';

export function requestId(req, res, next) {
  req.id = randomUUID().slice(0, 8);
  next();
}

export function apiNotFound(req, res) {
  fail(res, 404, 'not_found', '없는 주소입니다');
}

// 4 인자 시그니처가 Express 에러 처리기 표식이다
// eslint-disable-next-line no-unused-vars
export function errorHandler(err, req, res, next) {
  if (err instanceof HttpError) {
    if (err.retryAfter) res.setHeader('Retry-After', String(err.retryAfter));
    return fail(res, err.status, err.code, err.message, err.problems);
  }
  if (err?.type === 'entity.too.large' || err?.status === 413) return fail(res, 413, 'too_large', '요청이 너무 큽니다');
  if (err?.type === 'entity.parse.failed' || err?.status === 400) return fail(res, 400, 'bad_request', '요청 형식이 올바르지 않습니다');
  // 내부 정보는 응답에 넣지 않는다. 로그에도 요청 ID·종류·스택만
  log.error('unhandled', { req: req.id, path: req.route?.path ?? 'n/a', name: err?.name, msg: String(err?.message).slice(0, 200), stack: err?.stack?.split('\n').slice(1, 4).join(' | ') });
  return res.status(500).json({ ok: false, error: { code: 'internal', message: '일시적인 오류입니다', requestId: req.id } });
}
