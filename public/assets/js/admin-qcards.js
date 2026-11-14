import { requireMe, api, el, $, clear, errorText, modal } from './common.js';

const me = await requireMe(['office'], 'admin');
const cfg = await api('/api/config/public');
const STATUS = { registered: '접수', selected: '선정', asked: '질문함', followup: '후속 답변', withdrawn: '철회' };
const SLOTS = ['대표', '예비'];
let items = [];

const sessions = new Set();
for (const l of cfg.labs) $('#f-lab').append(el('option', { value: l.code }, l.name));
for (const [v, l] of Object.entries(STATUS)) $('#f-status').append(el('option', { value: v }, l));

async function load() {
  const q = new URLSearchParams();
  for (const [k, id] of [['session', '#f-session'], ['lab', '#f-lab'], ['status', '#f-status']]) if ($(id).value) q.set(k, $(id).value);
  const data = await api('/api/admin/qcards?' + q);
  items = data.items;
  $('#closed').checked = data.closed;
  for (const c of items) if (!sessions.has(c.session)) { sessions.add(c.session); $('#f-session').append(el('option', { value: c.session }, `세션 ${c.session}`)); }
  const body = clear($('#rows'));
  items.forEach((c, i) => {
    const st = el('select', { disabled: c.status === 'withdrawn' }, Object.entries(STATUS).filter(([v]) => v !== 'withdrawn' || c.status === 'withdrawn')
      .map(([v, l]) => el('option', { value: v, ...(v === c.status ? { selected: true } : {}) }, l)));
    st.addEventListener('change', () => act(`/api/admin/qcards/${c.id}`, 'PATCH', { status: st.value }));
    const sel = el('select', { disabled: c.status === 'withdrawn' }, el('option', { value: '' }, '-'), SLOTS.map((s) => el('option', { value: s, ...(s === c.selection ? { selected: true } : {}) }, s)));
    sel.addEventListener('change', () => act(`/api/admin/qcards/${c.id}/select`, 'POST', { slot: sel.value || null }));
    const extra = [];
    if (me.features.qcardAnswer) {
      extra.push(c.answerPostId ? el('a', { href: `/board.html?p=${c.answerPostId}` }, '답변 글') :
        el('button', { class: 'link', disabled: c.status === 'withdrawn', onclick: () => answer(c) }, '답변 글 쓰기'));
    }
    body.append(el('tr', {}, el('td', {}, c.session), el('td', {}, `${c.lab} · ${c.grp}`), el('td', {}, `${c.author.name} ${c.author.title}`, el('div', { class: 'small muted' }, c.author.id)),
      el('td', {}, el('button', { class: 'link', onclick: () => big(i) }, c.sentence), el('div', { class: 'small muted' }, `${c.seconds}초${c.ver > 1 ? ` · ${c.ver}판` : ''}`)),
      el('td', {}, st), el('td', {}, sel), el('td', {}, ...extra)));
  });
  if (!items.length) body.append(el('tr', {}, el('td', { colspan: 7, class: 'muted' }, '카드가 없습니다')));
}

async function act(path, method, body) {
  try { await api(path, { method, body }); } catch (e) { alert(errorText(e)); }
  load();
}

function big(i) {
  let k = i;
  const meta = el('div', { class: 'qcard-stage-meta' });
  const sentence = el('p', { class: 'qcard-stage-sentence' });
  const count = el('span', { class: 'qcard-stage-count' });
  const previous = el('button', {}, '← 이전');
  const next = el('button', {}, '다음 →');
  let m;
  const close = el('button', { class: 'qcard-stage-close', 'aria-label': '전체 화면 닫기', onclick: () => m.close() }, '×');
  const view = el('div', { class: 'qcard-stage-shell' },
    el('div', { class: 'qcard-stage-head' }, el('strong', {}, '질문 카드'), meta, close),
    el('div', { class: 'qcard-stage-body' }, sentence),
    el('div', { class: 'qcard-stage-foot' }, previous, count, next));
  const draw = () => {
    const c = items[k];
    meta.textContent = `세션 ${c.session} · ${c.lab} · ${c.grp} · ${c.author.name}`;
    sentence.textContent = c.sentence;
    count.textContent = `${k + 1} / ${items.length}`;
    previous.disabled = k === 0;
    next.disabled = k === items.length - 1;
  };
  const move = (step) => { k = Math.max(0, Math.min(items.length - 1, k + step)); draw(); };
  previous.addEventListener('click', () => move(-1));
  next.addEventListener('click', () => move(1));
  const key = (e) => { if (e.key === 'ArrowLeft') move(-1); if (e.key === 'ArrowRight') move(1); if (e.key === 'Escape') m.close(); };
  m = modal(view, { onClose: () => { document.removeEventListener('keydown', key); document.body.classList.remove('modal-open'); } });
  m.box.classList.add('qcard-fullscreen');
  m.box.parentElement.classList.add('qcard-stage');
  document.body.classList.add('modal-open');
  document.addEventListener('keydown', key);
  draw();
  close.focus();
}

function answer(c) {
  const title = el('input', { type: 'text', value: `[후속 답변] 세션 ${c.session} 질문` });
  const body = el('textarea', { rows: 8 });
  const out = el('div');
  const m = modal(el('div', {}, el('h3', {}, '답변 글 쓰기'), el('p', { class: 'small muted' }, '본문 앞에 질문 문장이 자동 인용됩니다. 질문자 성명은 넣지 않습니다.'),
    el('div', { class: 'card pre small' }, c.sentence), el('label', {}, '제목'), title, el('label', {}, '답변'), body, out,
    el('div', { class: 'row end', style: 'margin-top:10px' }, el('button', { onclick: () => m.close() }, '닫기'), el('button', { class: 'primary', onclick: async () => {
      try {
        const r = await api(`/api/admin/qcards/${c.id}/answer-post`, { method: 'POST', body: { title: title.value, body: body.value } });
        m.close(); location.href = `/board.html?p=${r.postId}`;
      } catch (e) { clear(out).append(el('div', { class: 'msg err' }, errorText(e), e.problems.length ? el('ul', {}, e.problems.map((p) => el('li', {}, p))) : '')); }
    } }, '게시'))));
}

$('#closed').addEventListener('change', async (e) => {
  if (!confirm(e.target.checked ? '질문 카드 제출을 마감할까요?' : '제출을 다시 열까요?')) { e.target.checked = !e.target.checked; return; }
  await act('/api/admin/settings/qcards', 'PATCH', { closed: e.target.checked });
});
for (const id of ['#f-session', '#f-lab', '#f-status']) $(id).addEventListener('change', load);
load();
