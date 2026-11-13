import { requireMe, api, el, $, clear, errorText } from './common.js';

await requireMe(null, 'directory');
let groups = [];
try { groups = (await api('/api/directory')).groups; } catch (e) { $('#list').append(el('div', { class: 'msg err' }, errorText(e))); }

function render() {
  const q = $('#q').value.trim();
  const box = clear($('#list'));
  for (const g of groups) {
    const people = q ? g.people.filter((p) => p.name.includes(q)) : g.people;
    if (!people.length) continue;
    box.append(el('h3', {}, `${g.label} (${people.length})`), el('div', { class: 'card' }, ...people.map((p) =>
      el('div', { class: 'list-item row' }, el('b', {}, p.name), el('span', { class: 'muted' }, p.title), p.challenge ? el('span', { class: 'chip' }, p.challenge) : ''))));
  }
  if (!box.firstChild) box.append(el('p', { class: 'muted' }, '찾는 사람이 없습니다.'));
}
$('#q').addEventListener('input', render);
render();
