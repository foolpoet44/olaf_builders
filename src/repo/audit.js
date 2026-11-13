// 감사 기록 (추가만 · 트리거가 수정·삭제를 막는다)
import { isoNow } from '../lib/clock.js';

export function makeAudit(db, clock) {
  const ins = db.prepare('INSERT INTO audit_log (at, actor, action, target, result) VALUES (?, ?, ?, ?, ?)');
  return (actor, action, target = '', result = 'ok') => {
    ins.run(isoNow(clock), String(actor), action, String(target), result);
  };
}

export function listAudit(db, { page = 1, pageSize = 50 } = {}) {
  const total = db.prepare('SELECT COUNT(*) n FROM audit_log').get().n;
  const items = db.prepare('SELECT id, at, actor, action, target, result FROM audit_log ORDER BY id DESC LIMIT ? OFFSET ?')
    .all(pageSize, (page - 1) * pageSize);
  return { items, page, pageSize, total };
}
