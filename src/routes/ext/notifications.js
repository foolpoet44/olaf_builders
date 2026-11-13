// FR-EXT-09 앱 안 알림 — 사람·키당 "마지막 확인 시각" 1개만 (ADR-11) · 본인만
import { requireLogin } from '../../middleware/session.js';
import { featureGate } from '../../middleware/feature.js';
import { ok, E } from '../../lib/http.js';
import { isoNow } from '../../lib/clock.js';

export function notifications(api, deps, key) {
  const { db, clock } = deps;

  const lookback = () => new Date(clock.now().getTime() - (deps.settings.cfg.notifications?.defaultLookbackDays ?? 7) * 86400_000).toISOString();

  api.get('/me/notifications', featureGate(key), requireLogin, (req, res) => {
    const u = req.user;
    const seen = Object.fromEntries(db.prepare('SELECT key, at FROM seen WHERE person_id = ?').all(u.id).map((r) => [r.key, r.at]));
    const since = lookback();
    const spaces = deps.board.readable(u).map((s) => {
      const after = seen[`space:${s.id}`] ?? since;
      const n = db.prepare("SELECT COUNT(*) n FROM posts WHERE space_id = ? AND parent_id IS NULL AND status = 'live' AND author_id != ? AND created_at > ?").get(s.id, u.id, after).n;
      return { id: s.id, newPosts: n };
    });
    const mineAfter = seen.mine ?? since;
    const newCommentsOnMine = db.prepare(`SELECT COUNT(*) n FROM posts c JOIN posts p ON p.id = c.parent_id
      WHERE p.author_id = ? AND c.author_id != ? AND c.status = 'live' AND p.status = 'live' AND c.created_at > ?`).get(u.id, u.id, mineAfter).n;
    ok(res, { spaces, newCommentsOnMine });
  });

  api.get('/me/notifications/mine', featureGate(key), requireLogin, (req, res) => {
    // 내 글에 달린 최근 댓글이 있는 글 목록 (글 id·제목·새 댓글 수) — 시각만 보고 열람 이력은 남기지 않는다
    const u = req.user;
    const after = db.prepare("SELECT at FROM seen WHERE person_id = ? AND key = 'mine'").get(u.id)?.at ?? lookback();
    const items = db.prepare(`SELECT p.id, v.title, COUNT(c.id) n, MAX(c.created_at) last FROM posts c
      JOIN posts p ON p.id = c.parent_id JOIN post_versions v ON v.post_id = p.id AND v.ver = p.ver
      WHERE p.author_id = ? AND c.author_id != ? AND c.status = 'live' AND p.status = 'live' AND c.created_at > ?
      GROUP BY p.id ORDER BY last DESC LIMIT 20`).all(u.id, u.id, after).map((r) => ({ postId: r.id, title: r.title, newComments: r.n }));
    ok(res, { items });
  });

  api.post('/me/seen', featureGate(key), requireLogin, (req, res) => {
    const k = req.body?.key;
    if (typeof k !== 'string') throw E.validation(['key 가 필요합니다']);
    if (k !== 'mine') {
      if (!k.startsWith('space:')) throw E.validation(['key 형식 오류']);
      const sp = deps.board.byId(k.slice(6));
      if (!deps.board.canRead(req.user, sp)) throw E.forbidden();
    }
    db.prepare('INSERT INTO seen (person_id, key, at) VALUES (?, ?, ?) ON CONFLICT(person_id, key) DO UPDATE SET at = excluded.at')
      .run(req.user.id, k, isoNow(clock));
    ok(res, {});
  });
}
