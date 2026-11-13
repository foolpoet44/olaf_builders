// FR-EXT-06 공지 고정 — 사무국만 · 글·live 만 · 공간당 상한
import { featureGate } from '../../middleware/feature.js';
import { ok, E, intParam } from '../../lib/http.js';
import { isoNow } from '../../lib/clock.js';

export function pin(api, deps, key) {
  const { db, clock, audit, hooks } = deps;
  const on = () => deps.settings.feature(key);
  const admin = deps.adminRouter;

  admin.post('/posts/:id/pin', featureGate(key), (req, res) => {
    const row = db.prepare('SELECT * FROM posts WHERE id = ?').get(intParam(req.params.id));
    if (!row) throw E.notFound();
    if (row.parent_id != null) throw E.validation(['댓글은 고정할 수 없습니다']);
    if (row.status !== 'live') throw E.validation(['삭제·숨김된 글은 고정할 수 없습니다']);
    if (row.pinned_at) return ok(res, {});
    const max = deps.settings.cfg.posts.maxPinnedPerSpace ?? 3;
    const n = db.prepare("SELECT COUNT(*) n FROM posts WHERE space_id = ? AND pinned_at IS NOT NULL AND status = 'live'").get(row.space_id).n;
    if (n >= max) throw E.conflict(`공간당 ${max}개까지 고정할 수 있습니다 — 다른 고정을 먼저 해제하세요`);
    db.prepare('UPDATE posts SET pinned_at = ? WHERE id = ?').run(isoNow(clock), row.id);
    audit(req.user.id, 'post_pin', `post:${row.id}`);
    ok(res, {});
  });

  admin.delete('/posts/:id/pin', featureGate(key), (req, res) => {
    const row = db.prepare('SELECT id FROM posts WHERE id = ?').get(intParam(req.params.id));
    if (!row) throw E.notFound();
    db.prepare('UPDATE posts SET pinned_at = NULL WHERE id = ?').run(row.id);
    audit(req.user.id, 'post_unpin', `post:${row.id}`);
    ok(res, {});
  });

  // 목록: 고정 글은 pinned 배열로 따로 · items 에서 제외 (첫 페이지·검색 없을 때만)
  hooks.postsList.push((filter, extra, { req, space }) => {
    if (!on()) return;
    const page = Math.max(1, Number(req.query.page) || 1);
    const pinnedRows = db.prepare(`SELECT p.id FROM posts p WHERE p.space_id = ? AND p.parent_id IS NULL AND p.pinned_at IS NOT NULL AND p.status = 'live' ORDER BY p.pinned_at DESC`).all(space.id);
    const ids = pinnedRows.map((r) => r.id);
    filter.excludeIds.push(...ids);
    if (page === 1 && !req.query.q && !req.query.tag) {
      extra.pinned = ids.map((id) => {
        const r = deps.board.readablePost(req.user, id)[0];
        const o = deps.board.item(r, req.user);
        delete o.body;
        o.pinned = true;
        for (const d of hooks.postListItem) d(o, r, req, deps);
        return o;
      });
    } else extra.pinned = [];
  });
  hooks.postDetail.push((post, comments, row) => { if (on()) post.pinned = !!row.pinned_at; });
}
