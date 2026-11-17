// 아이디·비밀번호 · 세션 토큰
import { createHmac, createHash, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';

export function normalizeUsername(input) {
  const username = String(input ?? '').trim().toLowerCase();
  return /^[a-z][a-z0-9._-]{2,31}$/.test(username) ? username : null;
}

export const STRONG_PASSWORD_POLICY = Object.freeze({ minLength: 10, requireMixedClasses: true });

/** 역할별 비밀번호 규칙 — config.auth.password[role] 이 있으면 그것, 없으면 default, 그것도 없으면 강한 기본값 */
export const passwordPolicyFor = (cfg, role) => cfg?.auth?.password?.[role] ?? cfg?.auth?.password?.default ?? STRONG_PASSWORD_POLICY;

export const passwordProblems = (password, policy = STRONG_PASSWORD_POLICY) => {
  const value = String(password ?? '');
  const problems = [];
  if (value.length < policy.minLength) problems.push(`비밀번호는 ${policy.minLength}자 이상이어야 합니다`);
  if (value.length > 128) problems.push('비밀번호는 128자 이하여야 합니다');
  if (policy.requireMixedClasses && (!/[A-Za-z]/.test(value) || !/[0-9]/.test(value) || !/[^A-Za-z0-9]/.test(value))) {
    problems.push('비밀번호에는 영문, 숫자, 특수문자가 모두 필요합니다');
  }
  return problems;
};

export function hashPassword(password, saltHex) {
  return scryptSync(String(password), Buffer.from(saltHex, 'hex'), 32, { N: 16384, r: 8, p: 1 }).toString('hex');
}

export function verifyPassword(password, saltHex, hashHex) {
  const a = Buffer.from(hashPassword(password, saltHex), 'hex');
  const b = Buffer.from(hashHex, 'hex');
  return a.length === b.length && timingSafeEqual(a, b);
}

export const newSalt = () => randomBytes(16).toString('hex');
export const newToken = () => randomBytes(32).toString('base64url');
export const tokenHash = (t) => createHash('sha256').update(String(t)).digest('hex');
/** 접속 주소 → 횟수 제한 버킷 (원문 저장 안 함) */
export const ipBucket = (ip, key) => createHmac('sha256', Buffer.from(key, 'hex')).update('ip:' + String(ip)).digest('hex').slice(0, 16);

export function parseCookies(header) {
  const out = {};
  for (const part of String(header ?? '').split(';')) {
    const i = part.indexOf('=');
    if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}

export function sessionCookie(name, token, maxAgeSec, secure) {
  return `${name}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAgeSec}${secure ? '; Secure' : ''}`;
}
