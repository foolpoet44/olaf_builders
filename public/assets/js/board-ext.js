// 게시판 확장 — 기능 키가 꺼져 있으면 아무것도 끼우지 않는다.
import { api, el } from './common.js';

export async function init(me, ext) {
  const f = me.features || {};
  const office = me.role === 'office';
  const reload = () => location.reload();
  const call = async (method, path, body) => { try { await api(path, { method, body }); reload(); } catch (e) { alert(e.message); } };

  // FR-EXT-09 공간별 새 글 수 · 공간을 열면 확인 처리
  if (f.notifications) {
    let counts = {};
    try { counts = Object.fromEntries((await api('/api/me/notifications')).spaces.map((s) => [s.id, s.newPosts])); } catch { /* 표시만 생략 */ }
    ext.spaceBadge = (s) => (counts[s.id] ? `새 ${counts[s.id]}` : null);
    ext.afterSpaceOpen.push((sid) => { if (counts[sid]) { counts[sid] = 0; api('/api/me/seen', { method: 'POST', body: { key: `space:${sid}` } }).catch(() => {}); } });
  }

  // FR-EXT-07 해결 표시 · 채택 버튼
  if (f.accept) {
    ext.listItem.push((p) => (p.solved ? [el('span', { class: 'tag-solved' }, '해결')] : []));
    ext.postTop.push((card, post) => { if (post.acceptAnswers && post.acceptedCommentId) card.append(el('span', { class: 'tag-solved' }, '해결됨')); });
    ext.commentActions.push((c, post) => {
      if (!post.acceptAnswers || c.status !== 'live' || post.status !== 'live' || !(post.mine || office)) return [];
      return c.accepted
        ? [el('button', { class: 'link', onclick: () => call('DELETE', `/api/posts/${post.id}/accept`) }, '채택 취소')]
        : [el('button', { class: 'link', onclick: () => call('POST', `/api/posts/${post.id}/accept`, { commentId: c.id }) }, '채택')];
    });
  }

  // FR-EXT-06 공지 고정 (사무국)
  if (f.pin && office) {
    ext.postActions.push((post) => (post.status !== 'live' ? [] : post.pinned
      ? [el('button', { onclick: () => call('DELETE', `/api/admin/posts/${post.id}/pin`) }, '고정 해제')]
      : [el('button', { onclick: () => call('POST', `/api/admin/posts/${post.id}/pin`) }, '상단 고정')]));
  }

  // FR-EXT-08a 질문 카드 답변 글 표시
  if (f.qcardAnswer) {
    ext.postTop.push((card, post) => { if (post.ref?.kind === 'qcard') card.append(el('span', { class: 'chip' }, '질문 카드 후속 답변')); });
  }
}
