import { api, $, showMessage, errorText, qs } from './common.js';

const input = $('#code');
input.addEventListener('input', () => {
  const raw = input.value.toUpperCase().replace(/[^0-9A-Z]/g, '').slice(0, 12);
  input.value = raw.match(/.{1,4}/g)?.join('-') ?? '';
});

api('/api/config/public').then((c) => {
  $('#band').textContent = c.securityLabel;
  $('#title').textContent = c.brand.community;
  $('#msg-brand').textContent = c.brand.messages.master;
}).catch(() => {});

$('#f').addEventListener('submit', async (e) => {
  e.preventDefault();
  const btn = $('#go');
  btn.disabled = true;
  try {
    await api('/api/auth/login', { method: 'POST', body: { code: input.value } });
    const next = qs('next');
    location.href = next && next.startsWith('/') && !next.startsWith('//') ? next : '/';
  } catch (err) {
    showMessage($('#out'), 'err', errorText(err));
  } finally {
    btn.disabled = false;
  }
});
