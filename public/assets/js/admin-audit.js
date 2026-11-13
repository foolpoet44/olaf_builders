import { requireMe, api, el, $, clear, fmtTime } from './common.js';

await requireMe(['office'], 'admin');
let page = 1;
let pages = 1;

async function load() {
  const d = await api(`/api/admin/audit?page=${page}`);
  pages = Math.max(1, Math.ceil(d.total / d.pageSize));
  const body = clear($('#rows'));
  for (const a of d.items) body.append(el('tr', {}, el('td', {}, a.id), el('td', {}, fmtTime(a.at)), el('td', {}, a.actor), el('td', {}, a.action), el('td', {}, a.target), el('td', {}, a.result)));
  $('#pg').textContent = `${page} / ${pages}`;
}
$('#prev').addEventListener('click', () => { if (page > 1) { page--; load(); } });
$('#next').addEventListener('click', () => { if (page < pages) { page++; load(); } });
load();
