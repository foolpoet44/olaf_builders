import { requireMe, api, el, $, clear, errorText, modal, roleLabel } from './common.js';

const me = await requireMe(['office'], 'admin');

async function load() {
  const { items } = await api('/api/admin/people');
  const body = clear($('#rows'));
  for (const p of items) {
    const acts = [];
    if (p.active) {
      acts.push(el('button', { onclick: () => issue(p) }, p.hasCode ? '재발급' : '코드 발급'));
      if (p.id !== me.id) acts.push(el('button', { class: 'danger', onclick: () => deact(p) }, '비활성화'));
    }
    body.append(el('tr', {}, el('td', {}, p.id), el('td', {}, roleLabel(p.role)), el('td', {}, p.name), el('td', {}, p.title),
      el('td', {}, [p.lab, p.grp].filter(Boolean).join(' · ')), el('td', {}, p.hasCode ? '있음' : '-'), el('td', {}, p.lastLoginDay ?? ''),
      el('td', {}, p.active ? '활성' : '비활성'), el('td', {}, el('div', { class: 'row' }, ...acts))));
  }
}

async function issue(p) {
  if (!confirm(`${p.name}(${p.id}) 의 코드를 새로 발급할까요? 기존 코드는 바로 무효가 됩니다.`)) return;
  try {
    const r = await api(`/api/admin/people/${encodeURIComponent(p.id)}/code`, { method: 'POST' });
    const parts = [el('h3', {}, `${p.name} 접속 코드`), el('div', { class: 'code-big' }, r.code),
      el('p', { class: 'small muted' }, '이 창을 닫으면 다시 볼 수 없습니다. 본인에게 사내 메일로 직접 전달하세요.')];
    const copy = (text, btn) => navigator.clipboard?.writeText(text).then(() => { btn.textContent = '복사됨'; }).catch(() => {});
    const b1 = el('button', { onclick: (e) => copy(r.code, e.target) }, '코드 복사');
    const row = el('div', { class: 'row end' }, b1);
    if (r.inviteText) {
      const ta = el('textarea', { rows: 6, readonly: true }, r.inviteText);
      parts.push(el('label', {}, '안내 문안 (복사용 · 발송은 직접)'), ta);
      row.append(el('button', { onclick: (e) => copy(r.inviteText, e.target) }, '문안 복사'));
    }
    const m = modal(el('div', {}, ...parts, row, el('div', { class: 'row end', style: 'margin-top:8px' }, el('button', { class: 'primary', onclick: () => m.close() }, '닫기'))));
    load();
  } catch (e) { alert(errorText(e)); }
}

async function deact(p) {
  if (!confirm(`${p.name}(${p.id}) 을 비활성화할까요? 코드가 폐기되고 로그인이 끊깁니다.`)) return;
  try { await api(`/api/admin/people/${encodeURIComponent(p.id)}/deactivate`, { method: 'POST' }); load(); } catch (e) { alert(errorText(e)); }
}

load();
