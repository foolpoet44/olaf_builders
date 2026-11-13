// FR-EXT-08b 자료 질문 스레드 패널 — 뷰어 옆
import { api, el, clear, showMessage, errorText, fmtTime } from './common.js';

export async function mount(me, material, aside, viewer, getPage) {
  if (!aside) return;
  aside.classList.remove('hidden');
  const draw = async () => {
    clear(aside);
    let d;
    try { d = await api(`/api/materials/${material.id}/threads`); } catch (e) { aside.append(el('div', { class: 'msg err' }, errorText(e))); return; }
    aside.append(el('h3', {}, `이 자료 질문 ${d.items.length}`));
    if (d.canWrite) aside.append(el('button', { class: 'primary', onclick: () => form() }, '이 쪽에 질문'));
    for (const p of d.items) {
      aside.append(el('div', { class: 'list-item' },
        el('div', { class: 'row' }, p.page ? el('span', { class: 'chip' }, `${p.page}쪽`) : '', p.solved ? el('span', { class: 'tag-solved' }, '해결') : '',
          p.notice ? el('span', { class: 'muted' }, p.notice) : el('a', { href: `/board.html?p=${p.id}`, target: '_blank' }, p.title)),
        el('div', { class: 'muted small' }, p.author?.name ?? '', ' ', fmtTime(p.createdAt), p.commentCount ? ` · 댓글 ${p.commentCount}` : '')));
    }
    if (!d.items.length) aside.append(el('p', { class: 'muted small' }, '아직 질문이 없습니다.'));
  };
  const form = () => {
    clear(aside);
    const page = el('input', { type: 'number', min: 1, max: material.pages, value: getPage() });
    const title = el('input', { type: 'text' });
    const body = el('textarea', { rows: 6 });
    const out = el('div');
    aside.append(el('h3', {}, '자료 질문'), el('label', {}, '쪽 (비우면 자료 전체)'), page, el('label', {}, '제목'), title, el('label', {}, '내용'), body, out,
      el('div', { class: 'row end' }, el('button', { onclick: draw }, '취소'), el('button', { class: 'primary', onclick: async () => {
        try { await api(`/api/materials/${material.id}/threads`, { method: 'POST', body: { title: title.value, body: body.value, page: page.value || null } }); draw(); }
        catch (e) { showMessage(out, 'err', errorText(e), e.problems); }
      } }, '올리기')));
  };
  await draw();
}
