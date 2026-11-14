import { api, $, showMessage, errorText, qs } from './common.js';

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
    await api('/api/auth/login', {
      method: 'POST',
      body: { username: $('#username').value, password: $('#password').value },
    });
    const next = qs('next');
    location.href = next && next.startsWith('/') && !next.startsWith('//') ? next : '/';
  } catch (err) {
    showMessage($('#out'), 'err', errorText(err));
  } finally {
    $('#password').value = '';
    btn.disabled = false;
  }
});
