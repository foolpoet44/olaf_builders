import { requireMe, api, el, $, errorText } from './common.js';

await requireMe(null, 'events');
const KIND = { launch: '출범', lab: 'Lab', session: '세션', review: '리뷰', demo: '데모', other: '기타' };
const today = new Date().toISOString().slice(0, 10);
try {
  const { items } = await api('/api/events');
  const box = $('#list');
  if (!items.length) box.append(el('p', { class: 'muted' }, '등록된 일정이 없습니다.'));
  for (const e of items) {
    box.append(el('div', { class: 'list-item row', style: e.date < today ? 'opacity:.55' : '' },
      el('b', { style: 'min-width:100px' }, e.date), el('span', { class: 'chip' }, KIND[e.kind] ?? e.kind), el('span', {}, e.title), e.note ? el('span', { class: 'muted small' }, e.note) : ''));
  }
} catch (e) { $('#list').append(el('div', { class: 'msg err' }, errorText(e))); }
