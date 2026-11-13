// 교육 자료 메타 (쪽 이미지는 파일로 — uploads\materials\<folder>\pNNN.webp)
export function listMaterials(db, { all = false } = {}) {
  const rows = all
    ? db.prepare('SELECT * FROM materials ORDER BY id DESC').all()
    : db.prepare("SELECT * FROM materials WHERE status = 'published' ORDER BY COALESCE(session, ''), id").all();
  return rows;
}

export const getMaterial = (db, id) => db.prepare('SELECT * FROM materials WHERE id = ?').get(id);

export function insertMaterial(db, m) {
  const r = db.prepare(`INSERT INTO materials (title, lecturer, session, pages, folder, status, sha256, created_at, created_by, updated_at)
    VALUES (?, ?, ?, ?, ?, 'draft', ?, ?, ?, ?)`).run(m.title, m.lecturer ?? '', m.session ?? null, m.pages, m.folder, m.sha256, m.now, m.actor, m.now);
  return Number(r.lastInsertRowid);
}

export function updateMaterial(db, id, fields, now) {
  const cur = getMaterial(db, id);
  const next = { ...cur, ...fields };
  db.prepare('UPDATE materials SET title=?, lecturer=?, session=?, status=?, updated_at=? WHERE id=?')
    .run(next.title, next.lecturer, next.session, next.status, now, id);
  return getMaterial(db, id);
}

export const addView = (db, id) => db.prepare('UPDATE materials SET views = views + 1 WHERE id = ?').run(id);
