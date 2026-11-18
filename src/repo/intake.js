// 질문 접수 저장소 — 본문은 불변, 상태만 바뀐다
import { refOf } from '../domain/intake.js';

const shape = (r) => r && ({
  id: r.id, ref: refOf(r.id), affiliation: r.affiliation, name: r.name, title: r.title, body: r.body, status: r.status, createdAt: r.created_at,
});

/** @returns {{id:number, duplicate:boolean}} */
export function create(db, q, key, now) {
  const dup = db.prepare('SELECT id FROM intake_questions WHERE dedupe_key = ?').get(key);
  if (dup) return { id: dup.id, duplicate: true };
  const r = db.prepare('INSERT INTO intake_questions (affiliation, name, title, body, dedupe_key, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .run(q.affiliation, q.name, q.title, q.body, key, now, now);
  return { id: Number(r.lastInsertRowid), duplicate: false };
}

export const get = (db, id) => shape(db.prepare('SELECT * FROM intake_questions WHERE id = ?').get(id));

/** 접수순 고정 (order='name' 이면 성명순) — 숨김 제외가 기본 */
export function list(db, { affiliation, name, includeHidden = false, order = 'seq' } = {}) {
  const where = [];
  const args = [];
  if (!includeHidden) where.push("status = 'open'");
  if (affiliation) { where.push('affiliation = ?'); args.push(affiliation); }
  if (name) { where.push('name = ?'); args.push(name); }
  const by = order === 'name' ? 'name, created_at, id' : 'created_at, id';
  return db.prepare(`SELECT * FROM intake_questions ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY ${by}`).all(...args).map(shape);
}

/** 건수와 제출자 명단(이름순)만 */
export function summary(db) {
  const rows = db.prepare("SELECT affiliation, name, title, COUNT(*) n FROM intake_questions WHERE status = 'open' GROUP BY affiliation, name, title ORDER BY name, affiliation").all();
  const byAff = db.prepare("SELECT affiliation, COUNT(*) n FROM intake_questions WHERE status = 'open' GROUP BY affiliation ORDER BY affiliation").all();
  return {
    total: rows.reduce((a, r) => a + r.n, 0),
    submitters: rows.map((r) => ({ name: r.name, title: r.title, affiliation: r.affiliation, count: r.n })),
    byAffiliation: byAff.map((r) => ({ affiliation: r.affiliation, count: r.n })),
  };
}

export const setStatus = (db, id, status, now) => db.prepare('UPDATE intake_questions SET status = ?, updated_at = ? WHERE id = ?').run(status, now, id);
