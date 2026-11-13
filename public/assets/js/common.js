// 화면 공통 — fetch 래퍼 · 로그인 확인 · 머리글 · DOM 도우미
// 사용자 값은 textContent 로만 넣는다 (innerHTML 금지).

export class ApiError extends Error {
  constructor(status, body) {
    super(body?.error?.message || `HTTP ${status}`);
    this.status = status;
    this.code = body?.error?.code;
    this.problems = body?.error?.problems || [];
    this.retryAfter = null;
  }
}

export async function api(path, { method = 'GET', body, raw, headers = {} } = {}) {
  const opt = { method, headers: { ...headers }, credentials: 'same-origin' };
  if (raw) { opt.body = raw; opt.headers['Content-Type'] ??= 'application/octet-stream'; }
  else if (body !== undefined) { opt.body = JSON.stringify(body); opt.headers['Content-Type'] = 'application/json'; }
  const r = await fetch(path, opt);
  if (r.status === 401 && !path.startsWith('/api/auth/login')) {
    location.href = '/login.html?next=' + encodeURIComponent(location.pathname + location.search);
    throw new ApiError(401, {});
  }
  const ct = r.headers.get('content-type') || '';
  if (!ct.includes('json')) {
    if (!r.ok) throw new ApiError(r.status, {});
    return r;
  }
  const j = await r.json();
  if (!r.ok || j.ok === false) {
    const e = new ApiError(r.status, j);
    e.retryAfter = r.headers.get('retry-after');
    throw e;
  }
  return j.data;
}

/** el('div', {class:'x', onclick: fn}, '텍스트', childNode) */
export function el(tag, attrs = {}, ...children) {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v === undefined || v === null || v === false) continue;
    if (k === 'class') n.className = v;
    else if (k.startsWith('on') && typeof v === 'function') n.addEventListener(k.slice(2), v);
    else if (k === 'dataset') Object.assign(n.dataset, v);
    else if (k === 'value') n.value = v;
    else if (v === true) n.setAttribute(k, '');
    else n.setAttribute(k, String(v));
  }
  for (const c of children.flat()) {
    if (c === null || c === undefined || c === false) continue;
    n.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return n;
}

export const $ = (sel, root = document) => root.querySelector(sel);
export const clear = (n) => { while (n.firstChild) n.removeChild(n.firstChild); return n; };

export function showMessage(target, kind, text, problems = []) {
  clear(target);
  if (!text && !problems.length) return;
  const box = el('div', { class: `msg ${kind}` }, text || '');
  if (problems.length) box.append(el('ul', {}, problems.map((p) => el('li', {}, p))));
  target.append(box);
}

export function errorText(e) {
  if (e.code === 'rate_limited') return `잠시 후 다시 시도해 주세요${e.retryAfter ? ` (약 ${Math.ceil(e.retryAfter / 60)}분)` : ''}`;
  return e.message || '오류가 발생했습니다';
}

export const fmtTime = (iso) => {
  if (!iso) return '';
  const d = new Date(iso);
  const p = (x) => String(x).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
};

let meCache = null;
export async function getMe() {
  if (!meCache) meCache = await api('/api/me');
  return meCache;
}

/** 로그인·역할 확인 후 머리글을 그린다. roles 가 있으면 다른 역할은 포털로 보낸다. */
export async function requireMe(roles, active) {
  const me = await getMe();
  if (roles && !roles.includes(me.role)) { location.href = '/'; throw new Error('forbidden'); }
  renderTop(me, active);
  return me;
}

export function renderTop(me, active) {
  const top = $('#top');
  if (!top) return;
  clear(top);
  const nav = el('nav', {}, el('a', { href: '/', class: active === 'home' ? 'active' : '' }, '첫 화면'),
    me.menu.map((m) => el('a', { href: m.href, class: active === m.key ? 'active' : '', dataset: { key: m.key } }, m.label,
      el('span', { class: 'badge hidden', dataset: { badge: m.key } }, ''))));
  const logout = el('button', { class: 'link', onclick: async () => { await api('/api/auth/logout', { method: 'POST' }).catch(() => {}); location.href = '/login.html'; } }, '로그아웃');
  top.append(el('a', { class: 'brand', href: '/' }, el('b', {}, 'OLAF'), ' Builders'), nav,
    el('span', { class: 'who' }, `${me.name} · ${roleLabel(me.role)}`), logout);
}

export const roleLabel = (r) => ({ builder: 'Builder', master: 'Master', office: '사무국' }[r] || r);

export function modal(content, { onClose } = {}) {
  const back = el('div', { class: 'modal-back' });
  const box = el('div', { class: 'modal' }, content);
  const close = () => { back.remove(); onClose?.(); };
  back.addEventListener('click', (e) => { if (e.target === back) close(); });
  back.append(box);
  document.body.append(back);
  return { close, box };
}

export function qs(name) { return new URLSearchParams(location.search).get(name); }
