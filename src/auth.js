// 접속 코드 · 세션 토큰 (docs/03_DATA_MODEL.md 3절 · docs/06_SECURITY.md 2절)
import { createHmac, createHash, randomBytes, randomInt, scryptSync, timingSafeEqual } from 'node:crypto';

// Crockford Base32 (I L O U 제외)
const ALPHA = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

export function newCode() {
  let s = '';
  for (let i = 0; i < 12; i++) s += ALPHA[randomInt(32)];
  return s;
}

export const formatCode = (c) => `${c.slice(0, 4)}-${c.slice(4, 8)}-${c.slice(8, 12)}`;

/** 입력 정규화: 공백·하이픈 제거 · 대문자 · 헷갈리는 글자 보정 (O→0, I/L→1). 형식 밖이면 null */
export function normalizeCode(input) {
  const s = String(input ?? '').toUpperCase().replace(/[\s-]/g, '').replace(/O/g, '0').replace(/[IL]/g, '1');
  if (s.length !== 12 || [...s].some((ch) => !ALPHA.includes(ch))) return null;
  return s;
}

export const codeLookup = (code, key) => createHmac('sha256', Buffer.from(key, 'hex')).update('lookup:' + code.slice(0, 4)).digest('hex').slice(0, 16);

export function hashCode(code, saltHex) {
  return scryptSync(code, Buffer.from(saltHex, 'hex'), 32, { N: 16384, r: 8, p: 1 }).toString('hex');
}

export function verifyCode(code, saltHex, hashHex) {
  const a = Buffer.from(hashCode(code, saltHex), 'hex');
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
