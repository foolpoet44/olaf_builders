import { requireMe, api, el, $, clear, showMessage, errorText, fmtTime, qs, modal } from './common.js';

const me = await requireMe(null, 'board');
const HIDE = { confidential: '기밀', personal_info: '개인정보', evaluative: '평가성', other: '기타' };
const office = me.role === 'office';
let spaces = [];
// 확장 모듈이 끼어드는 지점
export const ext = { spaceBadge: null, listTop: [], listItem: [], postTop: [], postActions: [], commentActions: [], formExtra: [], afterSpaceOpen: [], views: {} };
const extMod = await import('./board-ext.js').catch(() => null);
await extMod?.init?.(me, ext);

const nav = (params) => { const u = new URL(location.href); u.search = new URLSearchParams(params).toString(); history.pushState({}, '', u); route(); };
window.addEventListener('popstate', () => route());

async function loadSpaces() {
  spaces = (await api('/api/spaces')).items;
  const side = clear($('#spaces'));
  const cur = qs('s');
  let lastCode = null;
  if (ext.views.recent) side.append(el('a', { href: '?view=recent', class: qs('view') === 'recent' ? 'active' : '', onclick: (e) => { e.preventDefault(); nav({ view: 'recent' }); } }, '이번 주 새 글'));
  if (ext.views.bookmarks) side.append(el('a', { href: '/bookmarks.html' }, '내 저장함'));
  for (const s of spaces) {
    if (s.code !== lastCode && s.lab) side.append(el('h4', {}, s.label.split(' · ')[0]));
    lastCode = s.code;
    const badge = ext.spaceBadge?.(s);
    side.append(el('a', { href: `?s=${encodeURIComponent(s.id)}`, class: s.id === cur ? 'active' : '', onclick: (e) => { e.preventDefault(); nav({ s: s.id }); } },
      el('span', {}, s.lab ? s.label.split(' · ').slice(1).join(' · ') : s.label), badge ? el('span', { class: 'badge' }, badge) : el('span', { class: 'muted small' }, s.postCount)));
  }
}

async function showList(sid, page = 1, q = '', tag = '') {
  const m = clear($('#main'));
  const params = new URLSearchParams({ page });
  if (q) params.set('q', q);
  if (tag) params.set('tag', tag);
  const d = await api(`/api/spaces/${encodeURIComponent(sid)}/posts?${params}`);
  const search = el('input', { type: 'search', placeholder: '제목·본문 검색', value: q });
  search.addEventListener('keydown', (e) => { if (e.key === 'Enter') nav({ s: sid, q: search.value }); });
  m.append(el('div', { class: 'row' }, el('h1', { style: 'margin:0' }, d.space.label), el('span', { class: 'spacer' }),
    el('div', { style: 'width:220px' }, search), d.space.canWrite ? el('button', { class: 'primary', onclick: () => showForm(sid) }, '글쓰기') : ''));
  if (tag) m.append(el('div', { class: 'row', style: 'margin-top:8px' }, el('span', { class: 'chip on' }, `#${tag}`), el('button', { class: 'link', onclick: () => nav({ s: sid }) }, '태그 해제')));
  for (const f of ext.listTop) f(m, d, sid);
  const list = el('div', { style: 'margin-top:10px' });
  if (d.pinned?.length) for (const p of d.pinned) list.append(listItem(p, sid, true));
  if (!d.items.length && !d.pinned?.length) list.append(el('p', { class: 'muted' }, q ? '검색 결과가 없습니다.' : '아직 글이 없습니다.'));
  for (const p of d.items) list.append(listItem(p, sid));
  m.append(list);
  const pages = Math.max(1, Math.ceil(d.total / d.pageSize));
  if (pages > 1) m.append(el('div', { class: 'row end' }, page > 1 ? el('button', { onclick: () => nav({ s: sid, page: page - 1, q }) }, '이전') : '',
    el('span', { class: 'muted' }, `${page} / ${pages}`), page < pages ? el('button', { onclick: () => nav({ s: sid, page: page + 1, q }) }, '다음') : ''));
  for (const f of ext.afterSpaceOpen) f(sid);
}

export function listItem(p, sid, pinned = false) {
  const title = p.notice ? el('span', { class: 'muted' }, p.notice) : el('a', { class: 'title', href: `?p=${p.id}`, onclick: (e) => { e.preventDefault(); nav({ p: p.id }); } }, p.title);
  const pre = [];
  if (pinned) pre.push(el('span', { class: 'tag-pin' }, '고정'));
  if (p.status === 'hidden' && office) pre.push(el('span', { class: 'chip' }, `숨김 · ${HIDE[p.hideReason] ?? ''}`));
  if (p.status === 'deleted' && office) pre.push(el('span', { class: 'chip' }, '삭제됨'));
  const post = [];
  for (const f of ext.listItem) post.push(...(f(p) || []));
  return el('div', { class: 'list-item' }, el('div', { class: 'row' }, ...pre, title, p.commentCount ? el('span', { class: 'muted small' }, `[${p.commentCount}]`) : ''),
    el('div', { class: 'muted small row' }, p.author ? `${p.author.name}` : '', fmtTime(p.createdAt), p.edited ? '수정됨' : '', p.spaceLabel ?? '', ...post));
}

async function showPost(id) {
  const m = clear($('#main'));
  const { post, comments } = await api(`/api/posts/${id}`);
  const back = el('button', { onclick: () => nav({ s: post.space.id }) }, `← ${post.space.label}`);
  const acts = [];
  if (post.mine && post.status === 'live') {
    acts.push(el('button', { onclick: () => showForm(post.space.id, post) }, '수정'));
  }
  if ((post.mine || office) && post.status !== 'deleted') acts.push(el('button', { class: 'danger', onclick: () => del(post.id, post.space.id) }, '삭제'));
  if (office) {
    if (post.status === 'hidden') acts.push(el('button', { onclick: () => act(`/api/admin/posts/${post.id}/restore`, {}, post.id) }, '복구'));
    else acts.push(el('button', { onclick: () => hide(post.id) }, '숨김'));
    acts.push(el('button', { onclick: () => versions(post.id) }, '이전 판'));
  }
  for (const f of ext.postActions) acts.push(...(f(post) || []));
  const head = [];
  if (post.status === 'hidden') head.push(el('div', { class: 'band-hidden' }, office ? `숨김 처리됨 · 사유: ${HIDE[post.hideReason] ?? ''}` : post.notice));
  if (post.status === 'deleted' && office) head.push(el('div', { class: 'band-hidden' }, '작성자가 삭제한 글 (사무국만 원문 열람)'));
  const card = el('article', { class: 'card', style: 'margin-top:12px' }, ...head);
  for (const f of ext.postTop) f(card, post);
  card.append(el('h2', {}, post.title ?? post.notice ?? ''),
    el('div', { class: 'muted small row' }, post.author ? `${post.author.name} ${post.author.title}` : '', fmtTime(post.createdAt), post.edited ? `수정됨 (${fmtTime(post.updatedAt)})` : ''),
    el('div', { class: 'pre', style: 'margin-top:14px' }, post.body ?? ''),
    el('div', { class: 'row end', style: 'margin-top:12px' }, ...acts));
  m.append(back, card);

  const cbox = el('section', { style: 'margin-top:18px' }, el('h3', {}, `댓글 ${comments.filter((c) => c.status === 'live').length}`));
  for (const c of comments) {
    const cacts = [];
    if ((c.mine || office) && c.status !== 'deleted') cacts.push(el('button', { class: 'link', onclick: () => del(c.id, null, post.id) }, '삭제'));
    if (office && c.status !== 'hidden') cacts.push(el('button', { class: 'link', onclick: () => hide(c.id, post.id) }, '숨김'));
    if (office && c.status === 'hidden') cacts.push(el('button', { class: 'link', onclick: () => act(`/api/admin/posts/${c.id}/restore`, {}, post.id) }, '복구'));
    for (const f of ext.commentActions) cacts.push(...(f(c, post) || []));
    cbox.append(el('div', { class: 'list-item', style: c.accepted ? 'background:#f0fdf4;padding-left:8px' : '' },
      c.accepted ? el('div', { class: 'tag-solved' }, '채택된 답변') : '',
      el('div', { class: 'muted small row' }, c.author ? `${c.author.name} ${c.author.title}` : '', fmtTime(c.createdAt), c.status !== 'live' && office ? `(${c.status})` : '', el('span', { class: 'spacer' }), ...cacts),
      el('div', { class: 'pre' }, c.body ?? c.notice ?? '')));
  }
  if (post.space.canWrite && post.status === 'live') {
    const ta = el('textarea', { rows: 3, placeholder: '댓글' });
    const out = el('div');
    cbox.append(ta, out, el('div', { class: 'row end' }, el('button', { class: 'primary', onclick: async () => {
      try { await api(`/api/posts/${post.id}/comments`, { method: 'POST', body: { body: ta.value } }); showPost(post.id); } catch (e) { showMessage(out, 'err', errorText(e), e.problems); }
    } }, '댓글 달기')));
  }
  m.append(cbox);
}

function showForm(sid, post = null) {
  const s = spaces.find((x) => x.id === sid);
  const m = clear($('#main'));
  const title = el('input', { type: 'text', value: post?.title ?? '' });
  const body = el('textarea', { rows: 14 });
  body.value = post?.body ?? (s?.template ? s.template.map((t) => `【${t}】\n\n`).join('') : '');
  const out = el('div');
  const extraFields = [];
  for (const f of ext.formExtra) { const x = f(s, post); if (x) extraFields.push(x); }
  m.append(el('h1', {}, post ? '글 수정' : `글쓰기 · ${s?.label ?? ''}`),
    el('p', { class: 'small muted' }, '사번·이메일·휴대전화 번호·고객사 기밀은 쓰지 않습니다. 수정하면 이전 판이 보존됩니다.'),
    el('label', {}, '제목'), title, el('label', {}, '본문'), body,
    s?.template && !post ? el('button', { class: 'link', onclick: () => { body.value = ''; } }, '틀 지우기') : '',
    ...extraFields.map((x) => x.node), out,
    el('div', { class: 'row end', style: 'margin-top:12px' }, el('button', { onclick: () => (post ? nav({ p: post.id }) : nav({ s: sid })) }, '취소'),
      el('button', { class: 'primary', onclick: async () => {
        const payload = { title: title.value, body: body.value };
        for (const x of extraFields) Object.assign(payload, x.value());
        try {
          if (post) { await api(`/api/posts/${post.id}`, { method: 'PUT', body: { ...payload, ver: post.ver } }); nav({ p: post.id }); }
          else { const r = await api(`/api/spaces/${encodeURIComponent(sid)}/posts`, { method: 'POST', body: payload }); nav({ p: r.id }); }
        } catch (e) { showMessage(out, 'err', errorText(e), e.problems); }
      } }, post ? '저장' : '게시')));
}

async function act(path, body, reopen) {
  try { await api(path, { method: 'POST', body }); } catch (e) { alert(errorText(e)); }
  showPost(reopen);
}

async function del(id, sid, reopen) {
  if (!confirm('삭제할까요? 화면에서 내려가고 원본은 보존 기간 동안 사무국만 봅니다.')) return;
  try { await api(`/api/posts/${id}`, { method: 'DELETE' }); } catch (e) { return alert(errorText(e)); }
  if (reopen) showPost(reopen); else nav({ s: sid });
}

function hide(id, reopen) {
  const sel = el('select', {}, Object.entries(HIDE).map(([v, l]) => el('option', { value: v }, l)));
  const md = modal(el('div', {}, el('h3', {}, '숨김 사유'), sel, el('div', { class: 'row end', style: 'margin-top:12px' },
    el('button', { onclick: () => md.close() }, '취소'), el('button', { class: 'primary', onclick: async () => { md.close(); await act(`/api/admin/posts/${id}/hide`, { reason: sel.value }, reopen ?? id); } }, '숨김'))));
}

async function versions(id) {
  const d = await api(`/api/admin/posts/${id}/versions`);
  modal(el('div', {}, el('h3', {}, '이전 판 (사무국 전용)'), ...d.items.map((v) => el('div', { class: 'list-item' },
    el('div', { class: 'muted small' }, `${v.ver}판 · ${fmtTime(v.createdAt)} · ${v.editorId}`), v.title ? el('b', {}, v.title) : '', el('div', { class: 'pre' }, v.body)))));
}

async function route() {
  try {
    await loadSpaces();
    const p = qs('p');
    const s = qs('s');
    const view = qs('view');
    if (p) return await showPost(p);
    if (view && ext.views[view]) return await ext.views[view]($('#main'), { nav, listItem });
    const target = s || spaces[0]?.id;
    if (target) return await showList(target, Number(qs('page')) || 1, qs('q') || '', qs('tag') || '');
    clear($('#main')).append(el('p', { class: 'muted' }, '읽을 수 있는 공간이 없습니다.'));
  } catch (e) {
    if (e.status !== 401) clear($('#main')).append(el('div', { class: 'msg err' }, e.status === 404 ? '글을 찾을 수 없거나 볼 권한이 없습니다.' : errorText(e)));
  }
}
route();
