import { requireMe, api, el, $, clear, showMessage, errorText, fmtTime } from './common.js';
import { composeSentence, readSeconds, checkCardShape } from './shared/qcard-rules.js';

await requireMe(['builder'], 'qcards');
const form = await api('/api/qcards/form');
const STATUS = { registered: '접수', selected: '선정', asked: '질문함', followup: '후속 답변', withdrawn: '철회' };
let format = 'template';
let editing = null; // {id, ver}

function current() {
  return { session: $('#session').value, format, situation: format === 'free' ? '' : $('#situation').value, constraint: format === 'free' ? '' : $('#constraint').value, ask: $('#ask').value };
}

function refresh() {
  if (form.closed) return;
  const r = form.rules;
  const c = current();
  const s = composeSentence(c, r, form.me.challenge);
  $('#preview').textContent = s;
  const sec = readSeconds(s, r);
  $('#secs').textContent = `약 ${sec}초 / ${r.readAloudSeconds}초`;
  $('#secs').style.color = sec > r.readAloudSeconds ? 'var(--err)' : '';
  for (const f of ['situation', 'constraint', 'ask']) {
    const max = f === 'ask' && format === 'free' ? r.free.maxChars : r.template.maxChars[f];
    const n = c[f].trim().length;
    const tag = document.querySelector(`[data-count="${f}"]`);
    if (tag) tag.textContent = `${n}/${max}`;
  }
}

function setFormat(f) {
  format = f;
  $('#tpl-fields').classList.toggle('hidden', f === 'free');
  for (const b of document.querySelectorAll('[data-format]')) b.classList.toggle('primary', b.dataset.format === f);
  if (f === 'template' && !$('#ask').value) $('#ask').value = form.rules.template.defaultAsk;
  refresh();
}

async function loadMine() {
  const { items } = await api('/api/qcards/mine');
  const box = clear($('#mine'));
  if (!items.length) { box.append(el('p', { class: 'muted' }, '아직 제출한 카드가 없습니다.')); return; }
  for (const c of items) {
    const actions = [];
    if (!form.closed && c.status !== 'withdrawn') {
      actions.push(el('button', { onclick: () => edit(c) }, '수정'));
      actions.push(el('button', { class: 'danger', onclick: async () => {
        if (!confirm('이 카드를 철회할까요?')) return;
        try { await api(`/api/qcards/${c.id}/withdraw`, { method: 'POST' }); loadMine(); } catch (e) { alert(errorText(e)); }
      } }, '철회'));
    }
    if (c.answerPostId) actions.push(el('a', { href: `/board.html?p=${c.answerPostId}` }, '답변 보기'));
    box.append(el('div', { class: 'list-item' },
      el('div', { class: 'row' }, el('span', { class: 'chip' }, `세션 ${c.session}`), el('span', { class: 'chip' }, STATUS[c.status] || c.status),
        el('span', { class: 'muted small' }, `${fmtTime(c.updatedAt)} · ${c.seconds}초${c.ver > 1 ? ` · ${c.ver}판` : ''}`), el('span', { class: 'spacer' }), ...actions),
      el('div', { class: 'pre', style: 'margin-top:6px' }, c.sentence)));
  }
}

function edit(c) {
  editing = { id: c.id, ver: c.ver };
  $('#form-title').textContent = `카드 수정 (${c.ver}판 → ${c.ver + 1}판)`;
  $('#session').value = c.session;
  $('#situation').value = c.situation ?? '';
  $('#constraint').value = c.constraint ?? '';
  $('#ask').value = c.ask;
  setFormat(c.format);
  $('#submit').textContent = '수정 저장';
  $('#cancel').classList.remove('hidden');
  $('#form-wrap').scrollIntoView({ behavior: 'smooth' });
}

function resetForm() {
  editing = null;
  $('#form-title').textContent = '새 카드';
  $('#situation').value = ''; $('#constraint').value = ''; $('#ask').value = '';
  $('#submit').textContent = '제출';
  $('#cancel').classList.add('hidden');
  setFormat(form.rules.formats.default);
}

if (form.closed) {
  $('#closed').textContent = form.message;
  $('#closed').classList.remove('hidden');
} else {
  $('#form-wrap').classList.remove('hidden');
  for (const s of form.sessions) $('#session').append(el('option', { value: s.code }, `${s.title}${s.date ? ` (${s.date})` : ''}`));
  const LABEL = { template: '포맷 (빈칸 채우기)', free: '자유 질문' };
  for (const f of form.rules.formats.allowed) $('#formats').append(el('button', { dataset: { format: f }, onclick: () => setFormat(f) }, LABEL[f] || f));
  for (const id of ['session', 'situation', 'constraint', 'ask']) $('#' + id).addEventListener('input', refresh);
  $('#cancel').addEventListener('click', resetForm);
  $('#submit').addEventListener('click', async () => {
    const c = current();
    const local = checkCardShape(c, form.rules, form.me.challenge);
    if (local.length) return showMessage($('#out'), 'err', '질문 카드를 확인해 주세요', local);
    $('#submit').disabled = true;
    try {
      if (editing) await api(`/api/qcards/${editing.id}`, { method: 'PUT', body: { ...c, ver: editing.ver } });
      else await api('/api/qcards', { method: 'POST', body: c });
      showMessage($('#out'), 'ok', editing ? '수정했습니다' : '제출했습니다');
      resetForm();
      loadMine();
    } catch (e) {
      showMessage($('#out'), 'err', errorText(e), e.problems);
    } finally { $('#submit').disabled = false; }
  });
  setFormat(form.rules.formats.default);
}
loadMine();
