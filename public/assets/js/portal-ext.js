// 포털 확장 블록 — 기능 키가 꺼져 있으면 아무것도 그리지 않는다.
import { api, el } from './common.js';

export async function render(me, box) {
  const f = me.features || {};
  if (f.notifications) {
    try {
      const n = await api('/api/me/notifications');
      const total = n.spaces.reduce((a, s) => a + s.newPosts, 0);
      if (total || n.newCommentsOnMine) {
        const mine = n.newCommentsOnMine ? await api('/api/me/notifications/mine') : { items: [] };
        box.append(el('section', { class: 'card', style: 'margin-top:16px' }, el('h3', {}, '새 소식'),
          total ? el('p', {}, el('a', { href: '/board.html' }, `읽을 수 있는 공간에 새 글 ${total}개`)) : '',
          ...mine.items.map((i) => el('div', { class: 'list-item' }, el('a', { href: `/board.html?p=${i.postId}` }, i.title), el('span', { class: 'muted small' }, ` 새 댓글 ${i.newComments}`))),
          n.newCommentsOnMine ? el('button', { class: 'link', onclick: async (e) => { await api('/api/me/seen', { method: 'POST', body: { key: 'mine' } }); e.target.closest('section').remove(); } }, '모두 확인') : ''));
      }
    } catch { /* 블록 생략 */ }
  }
  for (const r of extraBlocks) await r(me, box).catch(() => {});
}

/** P4.6 기능이 블록을 더하는 자리 */
export const extraBlocks = [];
