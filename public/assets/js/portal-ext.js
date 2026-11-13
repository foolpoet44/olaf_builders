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

/** P4.6 기능 블록 */
export const extraBlocks = [
  async (me, box) => {
    if (!me.features.reports || me.role !== 'office' || !me.openReports) return;
    box.append(el('div', { class: 'msg', style: 'margin-top:16px' }, el('a', { href: '/admin/reports.html' }, `처리 대기 신고 ${me.openReports}건`)));
  },
  async (me, box) => {
    if (!me.features.events) return;
    const today = new Date().toISOString().slice(0, 10);
    const up = (await api('/api/events')).items.filter((e) => e.date >= today).slice(0, 3);
    if (!up.length) return;
    box.append(el('section', { class: 'card', style: 'margin-top:16px' }, el('h3', {}, '다가오는 일정'),
      ...up.map((e) => el('div', { class: 'list-item' }, el('b', {}, e.date), ' ', e.title)), el('a', { class: 'small', href: '/events.html' }, '전체 일정')));
  },
  async (me, box) => {
    if (!me.features.digest) return;
    const d = await api('/api/feed/recent?days=7');
    if (!d.items.length) return;
    box.append(el('section', { class: 'card', style: 'margin-top:16px' }, el('h3', {}, '이번 주 새 글'),
      ...d.items.slice(0, 5).map((p) => el('div', { class: 'list-item' }, el('a', { href: `/board.html?p=${p.id}` }, p.title), el('span', { class: 'muted small' }, ` ${p.spaceLabel}`))),
      el('a', { class: 'small', href: '/board.html?view=recent' }, '더 보기')));
  },
];
