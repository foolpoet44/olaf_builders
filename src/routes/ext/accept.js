// FR-EXT-07 답변 채택·해결 표시 — acceptAnswers 공간만 · 작성자·사무국 · 집계·통계 없음
import { requireLogin } from '../../middleware/session.js';
import { featureGate } from '../../middleware/feature.js';
import { ok, E, intParam } from '../../lib/http.js';

export function accept(api, deps, key) {
  const { db, audit, hooks } = deps;
  const on = () => deps.settings.feature(key);

  const target = (req) => {
    const [row, space] = deps.board.readablePost(req.user, intParam(req.params.id));
    if (row.parent_id != null) throw E.notFound();
    if (!space.acceptAnswers) throw E.validation(['이 공간에서는 답변 채택을 쓰지 않습니다']);
    if (row.author_id !== req.user.id && req.user.role !== 'office') throw E.forbidden();
    if (row.status !== 'live') throw E.validation(['삭제·숨김된 글입니다']);
    return row;
  };

  api.post('/posts/:id/accept', featureGate(key), requireLogin, (req, res) => {
    const row = target(req);
    const cid = Number(req.body?.commentId);
    const c = Number.isInteger(cid) ? db.prepare('SELECT * FROM posts WHERE id = ?').get(cid) : null;
    if (!c || c.parent_id !== row.id || c.status !== 'live') throw E.validation(['이 글의 댓글을 골라 주세요']);
    db.prepare('UPDATE posts SET accepted_comment_id = ? WHERE id = ?').run(c.id, row.id);
    audit(req.user.id, 'post_accept', `post:${row.id}`, `comment:${c.id}`);
    ok(res, {});
  });

  api.delete('/posts/:id/accept', featureGate(key), requireLogin, (req, res) => {
    const row = target(req);
    db.prepare('UPDATE posts SET accepted_comment_id = NULL WHERE id = ?').run(row.id);
    audit(req.user.id, 'post_unaccept', `post:${row.id}`);
    ok(res, {});
  });

  // 채택 댓글이 삭제·숨김되면 채택 표시는 자동으로 무시
  const solvedId = (row) => {
    if (!row.accepted_comment_id) return null;
    const c = db.prepare("SELECT id FROM posts WHERE id = ? AND status = 'live'").get(row.accepted_comment_id);
    return c ? c.id : null;
  };
  hooks.postListItem.push((o, row) => { if (on() && deps.board.byId(row.space_id)?.acceptAnswers) o.solved = solvedId(row) !== null; });
  hooks.postDetail.push((post, comments, row) => {
    if (!on()) return;
    const sp = deps.board.byId(row.space_id);
    if (!sp?.acceptAnswers) return;
    const id = solvedId(row);
    post.acceptAnswers = true;
    post.acceptedCommentId = id;
    post.canAccept = post.status === 'live' && (post.mine || false);
    for (const c of comments) c.accepted = c.id === id;
    // 채택 댓글을 맨 위로
    comments.sort((a, b) => (b.accepted ? 1 : 0) - (a.accepted ? 1 : 0));
  });
}
