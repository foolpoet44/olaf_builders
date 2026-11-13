import { requireMe, api, el, $, clear, showMessage, errorText } from './common.js';

await requireMe(['office'], 'admin');
const STATUS = { draft: '준비', published: '공개', hidden: '숨김' };

async function load() {
  const { items } = await api('/api/materials?all=1');
  const body = clear($('#rows'));
  for (const m of items) {
    const sel = el('select', {}, Object.entries(STATUS).map(([v, l]) => el('option', { value: v, ...(v === m.status ? { selected: true } : {}) }, l)));
    sel.addEventListener('change', async () => {
      try { await api(`/api/admin/materials/${m.id}`, { method: 'PATCH', body: { status: sel.value } }); load(); } catch (e) { alert(errorText(e)); }
    });
    body.append(el('tr', {}, el('td', {}, m.id), el('td', {}, m.title), el('td', {}, m.lecturer), el('td', {}, m.session ?? ''),
      el('td', {}, m.pages), el('td', {}, m.views), el('td', {}, sel), el('td', {}, el('a', { href: `/materials.html?m=${m.id}` }, '보기'))));
  }
}

$('#up').addEventListener('click', async () => {
  const f = $('#file').files[0];
  if (!f) return showMessage($('#out'), 'err', 'zip 파일을 고르세요');
  $('#up').disabled = true;
  try {
    const r = await api('/api/admin/materials', { method: 'POST', raw: f, headers: { 'Content-Type': 'application/zip' } });
    showMessage($('#out'), 'ok', `등록했습니다 (${r.pages}쪽 · 준비 상태). 확인 후 공개로 바꾸세요.`);
    $('#file').value = '';
    load();
  } catch (e) {
    showMessage($('#out'), 'err', errorText(e), e.problems);
  } finally { $('#up').disabled = false; }
});

load();
