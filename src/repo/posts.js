// 글·댓글 저장소 — 본문은 post_versions 에 추가만 · 삭제는 status
import { tx } from '../db.js';

export function seedSpaces(db, spaces) {
  const up = db.prepare(`INSERT INTO spaces (id, code, label, lab, grp, read_rule, write_rule, sort) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET label = excluded.label, read_rule = excluded.read_rule, write_rule = excluded.write_rule, sort = excluded.sort`);
  for (const s of spaces) up.run(s.id, s.code, s.label, s.lab, s.grp, s.read, s.write, s.sort);
}

const BASE = `
  SELECT p.*, a.name AS author_name, a.title AS author_title, v.title, v.body,
         (SELECT COUNT(*) FROM posts c WHERE c.parent_id = p.id AND c.status = 'live') AS comment_count
  FROM posts p
  JOIN people a ON a.id = p.author_id
  JOIN post_versions v ON v.post_id = p.id AND v.ver = p.ver`;

export const getPost = (db, id) => db.prepare(`${BASE} WHERE p.id = ?`).get(id);

/**
 * 목록 (글만). 정렬은 최신순 고정 — 사람·활동량 정렬 없음.
 * @param {object} o
 * @param {string[]} o.spaceIds   읽을 수 있는 공간 (여러 개면 통합)
 * @param {boolean} o.includeHidden
 * @param {string} [o.q]
 * @param {number[]} [o.excludeIds]
 * @param {string} [o.extraWhere] 확장 필터 (자리표시자는 o.extraArgs)
 */
export function listPosts(db, { spaceIds, includeHidden, q, page = 1, pageSize = 20, extraWhere, extraArgs = [], excludeIds = [] }) {
  if (!spaceIds.length) return { items: [], total: 0, page, pageSize };
  const where = [`p.parent_id IS NULL`, `p.space_id IN (${spaceIds.map(() => '?').join(',')})`];
  const args = [...spaceIds];
  if (!includeHidden) where.push(`p.status != 'hidden'`);
  if (q) {
    where.push(`(v.title LIKE ? ESCAPE '\\' OR v.body LIKE ? ESCAPE '\\') AND p.status = 'live'`);
    const like = `%${q.replace(/[\\%_]/g, (m) => '\\' + m)}%`;
    args.push(like, like);
  }
  if (excludeIds.length) { where.push(`p.id NOT IN (${excludeIds.map(() => '?').join(',')})`); args.push(...excludeIds); }
  if (extraWhere) { where.push(extraWhere); args.push(...extraArgs); }
  const w = where.join(' AND ');
  const total = db.prepare(`SELECT COUNT(*) n FROM posts p JOIN post_versions v ON v.post_id = p.id AND v.ver = p.ver WHERE ${w}`).get(...args).n;
  const items = db.prepare(`${BASE} WHERE ${w} ORDER BY p.created_at DESC, p.id DESC LIMIT ? OFFSET ?`).all(...args, pageSize, (page - 1) * pageSize);
  return { items, total, page, pageSize };
}

export const listComments = (db, postId) => db.prepare(`${BASE} WHERE p.parent_id = ? ORDER BY p.created_at, p.id`).all(postId);

export function countBySpace(db, spaceIds) {
  if (!spaceIds.length) return {};
  return Object.fromEntries(db.prepare(`SELECT space_id, COUNT(*) n FROM posts WHERE parent_id IS NULL AND status = 'live' AND space_id IN (${spaceIds.map(() => '?').join(',')}) GROUP BY space_id`)
    .all(...spaceIds).map((r) => [r.space_id, r.n]));
}

/** @returns {number} 새 글 id */
export function createPost(db, { spaceId, parentId = null, author, title, body, now, extra = {} }) {
  return tx(db, () => {
    const cols = ['space_id', 'parent_id', 'author_id', 'status', 'created_at', 'updated_at', 'ver', ...Object.keys(extra)];
    const vals = [spaceId, parentId, author, 'live', now, now, 1, ...Object.values(extra)];
    const r = db.prepare(`INSERT INTO posts (${cols.join(', ')}) VALUES (${cols.map(() => '?').join(', ')})`).run(...vals);
    const id = Number(r.lastInsertRowid);
    db.prepare('INSERT INTO post_versions (post_id, ver, title, body, created_at, editor_id) VALUES (?, 1, ?, ?, ?, ?)').run(id, title, body, now, author);
    return id;
  });
}

/** 새 판. 판 번호가 다르면 null */
export function editPost(db, { id, ver, title, body, now, editor }) {
  return tx(db, () => {
    const cur = db.prepare('SELECT ver FROM posts WHERE id = ?').get(id);
    if (!cur || cur.ver !== ver) return null;
    db.prepare('INSERT INTO post_versions (post_id, ver, title, body, created_at, editor_id) VALUES (?, ?, ?, ?, ?, ?)').run(id, ver + 1, title, body, now, editor);
    db.prepare('UPDATE posts SET ver = ?, updated_at = ? WHERE id = ?').run(ver + 1, now, id);
    return ver + 1;
  });
}

export const setStatus = (db, id, status, reason, now) =>
  db.prepare('UPDATE posts SET status = ?, hide_reason = ?, updated_at = ? WHERE id = ?').run(status, reason ?? null, now, id);

export const hidePost = (db, id, reason, now) => setStatus(db, id, 'hidden', reason, now);

export function postVersions(db, id) {
  return db.prepare('SELECT ver, title, body, created_at, editor_id FROM post_versions WHERE post_id = ? ORDER BY ver').all(id)
    .map((v) => ({ ver: v.ver, title: v.title, body: v.body, createdAt: v.created_at, editorId: v.editor_id }));
}
