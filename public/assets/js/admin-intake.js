import { requireMe, api, el, $, clear, errorText, modal, fmtTime } from './common.js';

await requireMe(['office'], 'admin');
let items = [];
let filtersReady = false;

async function load() {
  const q = new URLSearchParams();
  if ($('#f-aff').value) q.set('affiliation', $('#f-aff').value);
  if ($('#f-name').value) q.set('name', $('#f-name').value);
  if ($('#f-hidden').checked) q.set('hidden', '1');
  const data = await api('/api/admin/intake?' + q);
  items = data.items;
  drawSummary(data.summary);
  if (!filtersReady) { // 필터 목록은 전체 기준으로 한 번만
    filtersReady = true;
    for (const a of data.summary.byAffiliation) $('#f-aff').append(el('option', { value: a.affiliation }, a.affiliation));
    for (const s of data.summary.submitters) $('#f-name').append(el('option', { value: s.name }, s.name));
  }
  drawCards();
}

function drawSummary(s) {
  const box = clear($('#summary'));
  box.append(el('p', {}, el('b', {}, `총 ${s.total}건`), ` · 제출자 ${s.submitters.length}명`));
  if (!s.total) { box.append(el('p', { class: 'muted' }, '아직 접수된 질문이 없습니다')); return; }
  box.append(el('p', { class: 'small' }, s.byAffiliation.map((a) => `${a.affiliation} ${a.count}건`).join(' · ')));
  box.append(el('div', { class: 'table-scroll' }, el('table', {},
    el('thead', {}, el('tr', {}, el('th', {}, '성명'), el('th', {}, '직급'), el('th', {}, '소속'), el('th', {}, '건수'))),
    el('tbody', {}, s.submitters.map((x) => el('tr', {}, el('td', {}, x.name), el('td', {}, x.title), el('td', {}, x.affiliation), el('td', {}, x.count)))))));
}

function drawCards() {
  const box = clear($('#cards'));
  if (!items.length) { box.append(el('p', { class: 'muted' }, '카드가 없습니다')); return; }
  items.forEach((c, i) => box.append(el('div', { class: 'card', style: c.status === 'hidden' ? 'opacity:.5' : '' },
    el('div', { class: 'small muted' }, `${c.ref} · ${fmtTime(c.createdAt)}${c.status === 'hidden' ? ' · 숨김' : ''}`),
    el('p', { class: 'pre', style: 'margin:8px 0' }, c.body.length > 120 ? c.body.slice(0, 120) + '…' : c.body),
    el('div', { class: 'small' }, `${c.name} · ${c.title} · ${c.affiliation}`),
    el('div', { class: 'row', style: 'margin-top:8px' },
      el('button', { class: 'primary', onclick: () => stage(i) }, '전체 화면'),
      el('button', { onclick: () => hide(c) }, c.status === 'hidden' ? '숨김 해제' : '숨김')))));
}

async function hide(c) {
  try { await api(`/api/admin/intake/${c.id}`, { method: 'PATCH', body: { status: c.status === 'hidden' ? 'open' : 'hidden' } }); } catch (e) { alert(errorText(e)); }
  load();
}

// 전체 화면 공유 — ←/→ 이동 · Esc 닫기 · A 키로 작성자 가리기(화면 표시만)
function stage(start) {
  let k = start;
  let blind = false;
  const meta = el('div', { class: 'qcard-stage-meta' });
  const text = el('p', { class: 'qcard-stage-sentence' });
  const count = el('span', { class: 'qcard-stage-count' });
  const prev = el('button', {}, '← 이전');
  const next = el('button', {}, '다음 →');
  const mask = el('button', {}, '작성자 가리기 (A)');
  let m;
  const close = el('button', { class: 'qcard-stage-close', 'aria-label': '닫기', onclick: () => m.close() }, '×');
  const view = el('div', { class: 'qcard-stage-shell' },
    el('div', { class: 'qcard-stage-head' }, el('strong', {}, '질문 카드'), meta, mask, close),
    el('div', { class: 'qcard-stage-body' }, text),
    el('div', { class: 'qcard-stage-foot' }, prev, count, next));
  const draw = () => {
    const c = items[k];
    meta.textContent = blind ? c.ref : `${c.ref} · ${c.name} · ${c.title} · ${c.affiliation}`;
    text.textContent = c.body;
    count.textContent = `${k + 1} / ${items.length}`;
    prev.disabled = k === 0;
    next.disabled = k === items.length - 1;
  };
  const move = (d) => { k = Math.max(0, Math.min(items.length - 1, k + d)); draw(); };
  const toggle = () => { blind = !blind; draw(); };
  prev.addEventListener('click', () => move(-1));
  next.addEventListener('click', () => move(1));
  mask.addEventListener('click', toggle);
  const key = (e) => {
    if (e.key === 'ArrowLeft') move(-1);
    else if (e.key === 'ArrowRight') move(1);
    else if (e.key === 'a' || e.key === 'A') toggle();
    else if (e.key === 'Escape') m.close();
  };
  m = modal(view, { onClose: () => {
    document.removeEventListener('keydown', key);
    document.body.classList.remove('modal-open');
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
  } });
  m.box.classList.add('qcard-fullscreen');
  m.box.parentElement.classList.add('qcard-stage');
  document.body.classList.add('modal-open');
  document.addEventListener('keydown', key);
  m.box.parentElement.requestFullscreen?.().catch(() => {}); // 브라우저 전체 화면 (거부돼도 창 가득 표시)
  draw();
  close.focus();
}

for (const id of ['#f-aff', '#f-name', '#f-hidden']) $(id).addEventListener('change', load);
load();
