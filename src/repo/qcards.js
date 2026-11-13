// 질문 카드 저장소 — 본문은 qcard_versions 에 추가만
import { tx } from '../db.js';

export function seedSessions(db, sessions) {
  const up = db.prepare(`INSERT INTO qc_sessions (code, title, date, lead_lab) VALUES (?, ?, ?, ?)
    ON CONFLICT(code) DO UPDATE SET title = excluded.title, date = excluded.date, lead_lab = excluded.lead_lab`);
  for (const s of sessions) up.run(s.code, s.title, s.date ?? null, s.leadLab ?? null);
}

export const countMine = (db, authorId, session) =>
  db.prepare("SELECT COUNT(*) n FROM qcards WHERE author_id = ? AND session = ? AND status != 'withdrawn'").get(authorId, session).n;

const LATEST = `SELECT v.* FROM qcard_versions v WHERE v.card_id = c.id ORDER BY v.ver DESC LIMIT 1`;

function shape(r) {
  return r && {
    id: r.id, session: r.session, lab: r.lab, grp: r.grp, status: r.status, createdAt: r.created_at, updatedAt: r.updated_at,
    authorId: r.author_id, authorName: r.author_name, authorTitle: r.author_title,
    ver: r.ver, format: r.format, situation: r.situation, constraint: r.constraint_, ask: r.ask, sentence: r.sentence, seconds: r.seconds,
    selection: r.slot ?? null,
  };
}

const SELECT = `
  SELECT c.*, p.name AS author_name, p.title AS author_title,
         lv.ver, lv.format, lv.situation, lv.constraint_, lv.ask, lv.sentence, lv.seconds,
         (SELECT s.slot FROM qcard_selections s WHERE s.card_id = c.id AND s.active = 1 LIMIT 1) AS slot
  FROM qcards c
  JOIN people p ON p.id = c.author_id
  JOIN qcard_versions lv ON lv.card_id = c.id AND lv.ver = (SELECT MAX(ver) FROM qcard_versions WHERE card_id = c.id)`;

export const getCard = (db, id) => shape(db.prepare(`${SELECT} WHERE c.id = ?`).get(id));

export function listMine(db, authorId) {
  return db.prepare(`${SELECT} WHERE c.author_id = ? ORDER BY c.created_at DESC, c.id DESC`).all(authorId).map(shape);
}

/** 사무국 목록 — 정렬은 세션 → Lab(설정 순서) → 그룹 → 접수순 고정 */
export function listAll(db, { session, lab, status, labOrder = [] } = {}) {
  const where = [];
  const args = [];
  if (session) { where.push('c.session = ?'); args.push(session); }
  if (lab) { where.push('c.lab = ?'); args.push(lab); }
  if (status) { where.push('c.status = ?'); args.push(status); }
  const rows = db.prepare(`${SELECT} ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY c.session, c.grp, c.created_at, c.id`).all(...args).map(shape);
  const li = (l) => { const i = labOrder.indexOf(l); return i < 0 ? 999 : i; };
  return rows.sort((a, b) => (a.session < b.session ? -1 : a.session > b.session ? 1 : 0) || li(a.lab) - li(b.lab)
    || (a.grp < b.grp ? -1 : a.grp > b.grp ? 1 : 0) || (a.createdAt < b.createdAt ? -1 : a.createdAt > b.createdAt ? 1 : 0) || a.id - b.id);
}

export function versions(db, id) {
  return db.prepare('SELECT * FROM qcard_versions WHERE card_id = ? ORDER BY ver').all(id)
    .map((v) => ({ ver: v.ver, format: v.format, situation: v.situation, constraint: v.constraint_, ask: v.ask, sentence: v.sentence, seconds: v.seconds, createdAt: v.created_at, editorId: v.editor_id }));
}

export function createCard(db, { author, card, sentence, seconds, now }) {
  return tx(db, () => {
    const r = db.prepare('INSERT INTO qcards (author_id, session, lab, grp, status, created_at, updated_at) VALUES (?, ?, ?, ?, \'registered\', ?, ?)')
      .run(author.id, card.session, author.lab, author.grp, now, now);
    const id = Number(r.lastInsertRowid);
    db.prepare('INSERT INTO qcard_versions (card_id, ver, format, situation, constraint_, ask, sentence, seconds, created_at, editor_id) VALUES (?, 1, ?, ?, ?, ?, ?, ?, ?, ?)')
      .run(id, card.format, card.situation || null, card.constraint || null, card.ask, sentence, seconds, now, author.id);
    return id;
  });
}

export function addVersion(db, { id, ver, card, sentence, seconds, now, editor }) {
  return tx(db, () => {
    const cur = db.prepare('SELECT MAX(ver) v FROM qcard_versions WHERE card_id = ?').get(id).v;
    if (cur !== ver) return null;
    db.prepare('INSERT INTO qcard_versions (card_id, ver, format, situation, constraint_, ask, sentence, seconds, created_at, editor_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
      .run(id, cur + 1, card.format, card.situation || null, card.constraint || null, card.ask, sentence, seconds, now, editor);
    db.prepare('UPDATE qcards SET session = ?, updated_at = ? WHERE id = ?').run(card.session, now, id);
    return cur + 1;
  });
}

export const setStatus = (db, id, status, now) => db.prepare('UPDATE qcards SET status = ?, updated_at = ? WHERE id = ?').run(status, now, id);

export function select(db, { card, slot, now, actor }) {
  return tx(db, () => {
    db.prepare('UPDATE qcard_selections SET active = 0 WHERE session = ? AND lab = ? AND slot = ? AND active = 1').run(card.session, card.lab, slot);
    db.prepare('UPDATE qcard_selections SET active = 0 WHERE card_id = ? AND active = 1').run(card.id);
    db.prepare('INSERT INTO qcard_selections (card_id, session, lab, slot, active, created_at, created_by) VALUES (?, ?, ?, ?, 1, ?, ?)')
      .run(card.id, card.session, card.lab, slot, now, actor);
    if (card.status === 'registered') setStatus(db, card.id, 'selected', now);
  });
}

export const unselect = (db, id) => db.prepare('UPDATE qcard_selections SET active = 0 WHERE card_id = ? AND active = 1').run(id);
