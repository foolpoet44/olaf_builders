import { requireMe, api, el, $, clear, errorText, fmtTime } from './common.js';

await requireMe(['office'], 'admin');
const R = { confidential: '기밀', personal_info: '개인정보', evaluative: '평가성', other: '기타' };
const O = { hidden: '숨김 유지', kept: '그대로 둠' };

async function resolve(id, outcome) {
  try { await api(`/api/admin/reports/${id}/resolve`, { method: 'POST', body: { outcome } }); } catch (e) { alert(errorText(e)); }
  load();
}

async function load() {
  const tb = clear($('#rows'));
  try {
    const d = await api(`/api/admin/reports?open=${$('#open').checked ? 1 : 0}`);
    if (!d.items.length) tb.append(el('tr', {}, el('td', { colspan: 7, class: 'muted' }, '신고가 없습니다.')));
    for (const r of d.items) {
      const link = `/board.html?p=${r.post.parentId ?? r.post.id}`;
      tb.append(el('tr', {},
        el('td', {}, fmtTime(r.createdAt)),
        el('td', {}, el('a', { href: link, target: '_blank' }, r.post.title ?? `댓글 #${r.post.id}`)),
        el('td', {}, R[r.reason] ?? r.reason, r.autoHidden ? el('div', { class: 'small muted' }, '자동 숨김') : ''),
        el('td', { class: 'pre small' }, r.note ?? ''),
        el('td', {}, `${r.reporter.name} (${r.reporter.id})`),
        el('td', {}, r.outcome ? `${O[r.outcome]} · ${fmtTime(r.resolvedAt)}` : '대기'),
        el('td', {}, r.outcome ? '' : el('div', { class: 'row' },
          el('button', { onclick: () => resolve(r.id, 'hidden') }, '숨김'), el('button', { onclick: () => resolve(r.id, 'kept') }, '그대로')))));
    }
  } catch (e) { tb.append(el('tr', {}, el('td', { colspan: 7 }, errorText(e)))); }
}
$('#open').addEventListener('change', load);
load();
