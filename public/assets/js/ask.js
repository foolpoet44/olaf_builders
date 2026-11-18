import { api, $, showMessage, errorText } from './common.js';

let rules;
try { rules = (await api('/api/intake/form')).rules; } catch { showMessage($('#out'), 'err', '지금은 질문을 받지 않습니다'); $('#submit').disabled = true; }
const body = $('#body');
const count = () => { if (rules) $('#count').textContent = `${body.value.trim().length} / ${rules.bodyMax}자`; };
body.addEventListener('input', count);
count();

$('#submit').addEventListener('click', async () => {
  const btn = $('#submit');
  btn.disabled = true;
  try {
    const r = await api('/api/intake', { method: 'POST', body: {
      affiliation: $('#affiliation').value, name: $('#name').value, title: $('#title').value, body: body.value,
    } });
    body.value = '';
    count();
    showMessage($('#out'), 'ok', `접수되었습니다 (${r.ref}). 이어서 다른 질문을 낼 수 있습니다.`);
  } catch (e) {
    showMessage($('#out'), 'err', errorText(e), e.problems);
  } finally { btn.disabled = false; }
});
