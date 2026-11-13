// FR-EXT-08a 질문 카드 → Master Q&A 답변 글 (카드당 1개 · 질문자 성명 없음 · 카드 상태 followup)
import { featureGate } from '../../middleware/feature.js';
import { checkPost } from '../../domain/board.js';
import { createPost } from '../../repo/posts.js';
import { getCard, setStatus } from '../../repo/qcards.js';
import { ok, E, intParam } from '../../lib/http.js';
import { isoNow } from '../../lib/clock.js';
import { tx } from '../../db.js';

export function qcardAnswer(api, deps, key) {
  const { db, clock, audit, hooks } = deps;
  const on = () => deps.settings.feature(key);
  const answerOf = (cardId) => db.prepare("SELECT id FROM posts WHERE ref_kind = 'qcard' AND ref_id = ? AND parent_id IS NULL").get(cardId)?.id ?? null;

  deps.adminRouter.post('/qcards/:id/answer-post', featureGate(key), (req, res) => {
    const cfg = deps.settings.cfg;
    const card = getCard(db, intParam(req.params.id));
    if (!card) throw E.notFound();
    if (card.status === 'withdrawn') throw E.validation(['철회된 카드입니다']);
    if (answerOf(card.id)) throw E.conflict('이 카드에는 이미 답변 글이 있습니다');
    const spaceId = cfg.qcardAnswer?.space ?? 'master_qa';
    if (!deps.board.byId(spaceId)) throw E.validation(['답변 공간이 설정에 없습니다']);
    const title = typeof req.body?.title === 'string' && req.body.title.trim() ? req.body.title : `[후속 답변] 세션 ${card.session} 질문`;
    const asker = cfg.qcardAnswer?.showAsker ? ` (${card.authorName})` : '';
    const body = `【질문】 ${card.sentence}${asker}\n\n${typeof req.body?.body === 'string' ? req.body.body : ''}`;
    const r = checkPost({ title, body }, cfg);
    if (typeof req.body?.body !== 'string' || !req.body.body.trim()) r.problems.push('답변을 써 주세요');
    if (r.problems.length) throw E.validation(r.problems, '답변 글을 확인해 주세요');
    const now = isoNow(clock);
    const postId = tx(db, () => {
      const id = createPost(db, { spaceId, author: req.user.id, title: r.title, body: r.body, now, extra: { ref_kind: 'qcard', ref_id: card.id } });
      if (['registered', 'selected', 'asked'].includes(card.status)) setStatus(db, card.id, 'followup', now);
      audit(req.user.id, 'qcard_answer', `qcard:${card.id}`, `post:${id}`);
      return id;
    });
    ok(res, { postId }, 201);
  });

  hooks.qcardItem.push((o, c) => { if (on()) o.answerPostId = answerOf(c.id); });
  hooks.postDetail.push((post, comments, row) => { if (on() && row.ref_kind === 'qcard') post.ref = { kind: 'qcard', id: row.ref_id }; });
}
