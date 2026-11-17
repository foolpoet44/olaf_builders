// 사람 · 로그인 자격증명 · 세션 · 로그인 날짜 · 횟수 제한
import { tx } from '../db.js';
import { isoNow } from '../lib/clock.js';
import { newSalt, hashPassword, verifyPassword, normalizeUsername, passwordProblems, newToken, tokenHash } from '../auth.js';

const rowToPerson = (r) => r && { ...r, assigned: JSON.parse(r.assigned || '[]'), active: r.active === 1 };

export function getPerson(db, id) {
  return rowToPerson(db.prepare('SELECT * FROM people WHERE id = ?').get(id));
}

export function listPeople(db) {
  return db.prepare(`
    SELECT p.*, c.username, (c.person_id IS NOT NULL) AS has_credentials, l.day AS last_login_day
    FROM people p
    LEFT JOIN credentials c ON c.person_id = p.id
    LEFT JOIN last_login l ON l.person_id = p.id
    ORDER BY p.id`).all().map((r) => ({
      ...rowToPerson(r),
      hasCredentials: r.has_credentials === 1,
      username: r.username ?? null,
      lastLoginDay: r.last_login_day ?? null,
    }));
}

export const countOffice = (db) => db.prepare("SELECT COUNT(*) n FROM people WHERE role = 'office'").get().n;

/** 추가 또는 갱신. 반환: 'added' | 'updated' | 'same' */
export function upsertPerson(db, p, now) {
  const cur = db.prepare('SELECT * FROM people WHERE id = ?').get(p.id);
  const assigned = JSON.stringify(p.assigned ?? []);
  if (!cur) {
    db.prepare(`INSERT INTO people (id, role, name, title, lab, grp, assigned, challenge, active, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)`).run(p.id, p.role, p.name, p.title ?? '', p.lab ?? null, p.grp ?? null, assigned, p.challenge ?? null, now, now);
    return 'added';
  }
  const same = cur.role === p.role && cur.name === p.name && cur.title === (p.title ?? '') && cur.lab === (p.lab ?? null)
    && cur.grp === (p.grp ?? null) && cur.assigned === assigned && cur.challenge === (p.challenge ?? null) && cur.active === 1;
  if (same) return 'same';
  db.prepare(`UPDATE people SET role=?, name=?, title=?, lab=?, grp=?, assigned=?, challenge=?, active=1, updated_at=? WHERE id=?`)
    .run(p.role, p.name, p.title ?? '', p.lab ?? null, p.grp ?? null, assigned, p.challenge ?? null, now, p.id);
  return cur.role !== p.role ? 'role_changed' : 'updated';
}

export class CredentialError extends Error {
  constructor(problems) {
    super(problems[0] ?? '로그인 정보를 확인해 주세요');
    this.problems = problems;
  }
}

/** 사용자명·비밀번호 설정. 기존 세션은 모두 종료한다. */
export function setCredentials(db, { personId, username, password, actor, clock, policy }) {
  const normalized = normalizeUsername(username);
  const problems = [];
  if (!normalized) problems.push('아이디는 영문자로 시작하는 3~32자의 영문 소문자, 숫자, 점, 밑줄, 하이픈만 사용할 수 있습니다');
  problems.push(...passwordProblems(password, policy));
  if (problems.length) throw new CredentialError(problems);
  const owner = db.prepare('SELECT person_id FROM credentials WHERE username = ? COLLATE NOCASE').get(normalized);
  if (owner && owner.person_id !== personId) throw new CredentialError(['이미 사용 중인 아이디입니다']);
  return tx(db, () => {
    const now = isoNow(clock);
    const salt = newSalt();
    db.prepare(`INSERT INTO credentials (person_id, username, password_hash, salt, created_at, updated_at, updated_by)
      VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(person_id) DO UPDATE SET
        username=excluded.username, password_hash=excluded.password_hash, salt=excluded.salt,
        updated_at=excluded.updated_at, updated_by=excluded.updated_by`)
      .run(personId, normalized, hashPassword(password, salt), salt, now, now, actor);
    db.prepare('DELETE FROM sessions WHERE person_id = ?').run(personId);
    return normalized;
  });
}

export function clearCredentials(db, personId) {
  return tx(db, () => {
    const changes = db.prepare('DELETE FROM credentials WHERE person_id = ?').run(personId).changes;
    db.prepare('DELETE FROM sessions WHERE person_id = ?').run(personId);
    return changes;
  });
}

export function deactivate(db, personId, now) {
  return tx(db, () => {
    db.prepare('UPDATE people SET active = 0, updated_at = ? WHERE id = ?').run(now, personId);
    db.prepare('DELETE FROM credentials WHERE person_id = ?').run(personId);
    db.prepare('DELETE FROM sessions WHERE person_id = ?').run(personId);
    // 확장 기능의 개인 데이터 정리 (표가 있을 때만)
    for (const t of ['seen']) {
      if (db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(t)) db.prepare(`DELETE FROM ${t} WHERE person_id = ?`).run(personId);
    }
  });
}

/** 아이디·비밀번호 확인 → 사람. 실패 null */
export function findByCredentials(db, username, password) {
  const normalized = normalizeUsername(username);
  if (!normalized || typeof password !== 'string') return null;
  const row = db.prepare('SELECT * FROM credentials WHERE username = ? COLLATE NOCASE').get(normalized);
  if (!row || !verifyPassword(password, row.salt, row.password_hash)) return null;
  const p = getPerson(db, row.person_id);
  return p && p.active ? p : null;
}

export function createSession(db, person, hours, clock) {
  const token = newToken();
  const now = clock.now();
  const exp = new Date(now.getTime() + hours * 3600_000);
  db.prepare('INSERT INTO sessions (token_hash, person_id, role, created_at, expires_at) VALUES (?, ?, ?, ?, ?)')
    .run(tokenHash(token), person.id, person.role, isoNow(clock), exp.toISOString());
  const day = now.toISOString().slice(0, 10);
  db.prepare('INSERT INTO last_login (person_id, day) VALUES (?, ?) ON CONFLICT(person_id) DO UPDATE SET day = excluded.day').run(person.id, day);
  return { token, maxAge: hours * 3600 };
}

/** 쿠키 토큰 → 사람 (만료·비활성·역할 변경 시 null) */
export function sessionUser(db, token, clock) {
  if (!token) return null;
  const s = db.prepare('SELECT * FROM sessions WHERE token_hash = ?').get(tokenHash(token));
  if (!s) return null;
  if (new Date(s.expires_at) <= clock.now()) { db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(s.token_hash); return null; }
  const p = getPerson(db, s.person_id);
  if (!p || !p.active || p.role !== s.role) return null;
  return p;
}

export const deleteSession = (db, token) => db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(tokenHash(token));
export const sweepSessions = (db, clock) => db.prepare('DELETE FROM sessions WHERE expires_at <= ?').run(clock.now().toISOString()).changes;

// ---- 횟수 제한 ----------------------------------------------------------
export function rateCount(db, scope, bucket, windowSec, clock) {
  const since = Math.floor(clock.now().getTime() / 1000) - windowSec;
  db.prepare('DELETE FROM rate_hits WHERE scope = ? AND at < ?').run(scope, since);
  return db.prepare('SELECT COUNT(*) n, MIN(at) first FROM rate_hits WHERE scope = ? AND bucket = ? AND at >= ?').get(scope, bucket, since);
}

export function rateHit(db, scope, bucket, clock) {
  db.prepare('INSERT INTO rate_hits (scope, bucket, at) VALUES (?, ?, ?)').run(scope, bucket, Math.floor(clock.now().getTime() / 1000));
}
