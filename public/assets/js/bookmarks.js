import { requireMe, api, el, $, clear, errorText, fmtTime } from './common.js';

await requireMe(null, 'bookmarks');
async function load() {
  const box = clear($('#list'));
  try {
    const { items } = await api('/api/me/bookmarks');
    if (!items.length) box.append(el('p', { class: 'muted' }, '저장한 글이 없습니다. 글 화면에서 "저장"을 누르세요.'));
    for (const b of items) {
      const rm = el('button', { class: 'link', onclick: async () => { await api(`/api/me/bookmarks/${b.id}`, { method: 'DELETE' }); load(); } }, '빼기');
      box.append(el('div', { class: 'list-item' },
        el('div', { class: 'row' }, b.title ? el('a', { href: `/board.html?p=${b.id}` }, b.title) : el('span', { class: 'muted' }, b.notice), el('span', { class: 'spacer' }), rm),
        el('div', { class: 'muted small' }, b.spaceLabel ?? '', ' · 저장 ', fmtTime(b.savedAt))));
    }
  } catch (e) { box.append(el('div', { class: 'msg err' }, errorText(e))); }
}
load();
