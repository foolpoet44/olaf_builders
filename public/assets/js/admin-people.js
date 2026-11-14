import { requireMe, api, el, $, clear, errorText, modal, roleLabel } from './common.js';

const me = await requireMe(['office'], 'admin');

async function load() {
  const { items } = await api('/api/admin/people');
  const body = clear($('#rows'));
  for (const p of items) {
    const acts = [];
    if (p.active) {
      acts.push(el('button', { onclick: () => editCredentials(p) }, p.hasCredentials ? '로그인 변경' : '로그인 설정'));
      if (p.id !== me.id) acts.push(el('button', { class: 'danger', onclick: () => deact(p) }, '비활성화'));
    }
    body.append(el('tr', {}, el('td', {}, p.id), el('td', {}, roleLabel(p.role)), el('td', {}, p.name), el('td', {}, p.title),
      el('td', {}, [p.lab, p.grp].filter(Boolean).join(' · ')), el('td', {}, p.username ?? '-'), el('td', {}, p.lastLoginDay ?? ''),
      el('td', {}, p.active ? '활성' : '비활성'), el('td', {}, el('div', { class: 'row' }, ...acts))));
  }
}

function editCredentials(p) {
  const username = el('input', { type: 'text', value: p.username ?? '', maxlength: 32, autocomplete: 'username', required: true });
  const password = el('input', { type: 'password', maxlength: 128, minlength: 10, autocomplete: 'new-password', required: true });
  const out = el('div');
  const form = el('form', {},
    el('h3', {}, `${p.name} 로그인 설정`),
    el('label', {}, '아이디', username),
    el('label', {}, '새 비밀번호', password),
    el('p', { class: 'small muted' }, '10자 이상이며 영문, 숫자, 특수문자를 모두 포함해야 합니다. 변경하면 기존 세션이 종료됩니다.'),
    out,
    el('div', { class: 'row end' },
      el('button', { type: 'button', onclick: () => m.close() }, '취소'),
      el('button', { type: 'submit', class: 'primary' }, '저장')));
  const m = modal(form);
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    try {
      await api(`/api/admin/people/${encodeURIComponent(p.id)}/credentials`, {
        method: 'POST',
        body: { username: username.value, password: password.value },
      });
      password.value = '';
      m.close();
      load();
    } catch (error) {
      out.textContent = errorText(error);
      out.className = 'msg err';
      password.value = '';
    }
  });
}

async function deact(p) {
  if (!confirm(`${p.name}(${p.id}) 을 비활성화할까요? 로그인 정보가 삭제되고 세션이 끊깁니다.`)) return;
  try { await api(`/api/admin/people/${encodeURIComponent(p.id)}/deactivate`, { method: 'POST' }); load(); } catch (e) { alert(errorText(e)); }
}

load();
