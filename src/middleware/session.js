// 쿠키 → req.user · 역할 검사 · 쓰기 요청 출처 검사
import { parseCookies } from '../auth.js';
import { sessionUser } from '../repo/people.js';
import { E } from '../lib/http.js';

export const session = (deps) => (req, res, next) => {
  const name = deps.settings.cfg.auth.cookieName;
  req.sessionToken = parseCookies(req.headers.cookie)[name] || null;
  req.user = req.sessionToken ? sessionUser(deps.db, req.sessionToken, deps.clock) : null;
  next();
};

export const requireLogin = (req, res, next) => (req.user ? next() : next(E.login()));

export const requireRole = (...roles) => (req, res, next) => {
  if (!req.user) return next(E.login());
  if (!roles.includes(req.user.role)) return next(E.forbidden());
  next();
};

const WRITE = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

/** 쓰기 요청은 Origin(없으면 Referer)의 호스트가 Host 와 같아야 한다 */
export function originCheck(req, res, next) {
  if (!WRITE.has(req.method)) return next();
  const src = req.headers.origin || req.headers.referer;
  let host = null;
  try { host = src ? new URL(src).host : null; } catch { host = null; }
  const expected = req.headers['x-forwarded-host'] && req.app.get('trust proxy') ? req.headers['x-forwarded-host'] : req.headers.host;
  if (!host || host !== expected) {
    return res.status(403).json({ ok: false, error: { code: 'bad_origin', message: '요청 출처를 확인할 수 없습니다' } });
  }
  next();
}
