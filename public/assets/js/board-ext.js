// 게시판 확장 — 기능 키가 꺼져 있으면 아무것도 끼우지 않는다.
import { api, el } from './common.js';

export async function init(me, ext) {
  const f = me.features || {};
  const office = me.role === 'office';
  const reload = () => location.reload();
  const call = async (method, path, body) => { try { await api(path, { method, body }); reload(); } catch (e) { alert(e.message); } };

  // FR-EXT-09 공간별 새 글 수 · 공간을 열면 확인 처리
  if (f.notifications) {
    let counts = {};
    try { counts = Object.fromEntries((await api('/api/me/notifications')).spaces.map((s) => [s.id, s.newPosts])); } catch { /* 표시만 생략 */ }
    ext.spaceBadge = (s) => (counts[s.id] ? `새 ${counts[s.id]}` : null);
    ext.afterSpaceOpen.push((sid) => { if (counts[sid]) { counts[sid] = 0; api('/api/me/seen', { method: 'POST', body: { key: `space:${sid}` } }).catch(() => {}); } });
  }

  // FR-EXT-07 해결 표시 · 채택 버튼
  if (f.accept) {
    ext.listItem.push((p) => (p.solved ? [el('span', { class: 'tag-solved' }, '해결')] : []));
    ext.postTop.push((card, post) => { if (post.acceptAnswers && post.acceptedCommentId) card.append(el('span', { class: 'tag-solved' }, '해결됨')); });
    ext.commentActions.push((c, post) => {
      if (!post.acceptAnswers || c.status !== 'live' || post.status !== 'live' || !(post.mine || office)) return [];
      return c.accepted
        ? [el('button', { class: 'link', onclick: () => call('DELETE', `/api/posts/${post.id}/accept`) }, '채택 취소')]
        : [el('button', { class: 'link', onclick: () => call('POST', `/api/posts/${post.id}/accept`, { commentId: c.id }) }, '채택')];
    });
  }

  // FR-EXT-06 공지 고정 (사무국)
  if (f.pin && office) {
    ext.postActions.push((post) => (post.status !== 'live' ? [] : post.pinned
      ? [el('button', { onclick: () => call('DELETE', `/api/admin/posts/${post.id}/pin`) }, '고정 해제')]
      : [el('button', { onclick: () => call('POST', `/api/admin/posts/${post.id}/pin`) }, '상단 고정')]));
  }

  // FR-EXT-08a 질문 카드 답변 글 표시
  if (f.qcardAnswer) {
    ext.postTop.push((card, post) => { if (post.ref?.kind === 'qcard') card.append(el('span', { class: 'chip' }, '질문 카드 후속 답변')); });
  }

  // FR-EXT-08b 자료 질문 → 자료로 가기
  if (f.materialThreads) {
    ext.postTop.push((card, post) => {
      if (post.ref?.kind === 'material' && post.ref.title) card.append(el('a', { class: 'chip', href: `/materials.html?m=${post.ref.id}${post.ref.page ? `&page=${post.ref.page}` : ''}` }, `자료: ${post.ref.title}${post.ref.page ? ` ${post.ref.page}쪽` : ''}`));
    });
  }

  // FR-EXT-11 태그 — 고르기(자유 입력 없음) · 목록·상세 칩 · 칩 누르면 필터
  if (f.tags) {
    let catalog = [];
    try { catalog = (await api('/api/tags')).items; } catch { /* 생략 */ }
    const chip = (t, sid) => el('a', { class: 'chip', href: `?s=${encodeURIComponent(sid)}&tag=${encodeURIComponent(t)}` }, `#${t}`);
    ext.listItem.push((p) => (p.tags ?? []).map((t) => chip(t, p.spaceId)));
    ext.postTop.push((card, post) => { for (const t of post.tags ?? []) card.append(chip(t, post.space.id)); });
    ext.formExtra.push((space, post) => {
      if (!catalog.length) return null;
      const on = new Set(post?.tags ?? []);
      const box = el('div', { style: 'margin-top:8px' }, el('label', {}, '태그 (선택)'));
      for (const c of catalog) {
        const b = el('button', { type: 'button', class: `chip${on.has(c.tag) ? ' on' : ''}`, onclick: () => { on.has(c.tag) ? on.delete(c.tag) : on.add(c.tag); b.classList.toggle('on'); } }, c.tag);
        box.append(b);
      }
      return { node: box, value: () => ({ tags: [...on] }) };
    });
  }

  // FR-EXT-10 저장
  if (f.bookmarks) {
    ext.postActions.push((post) => (post.status !== 'live' ? [] : [post.bookmarked
      ? el('button', { onclick: () => call('DELETE', `/api/me/bookmarks/${post.id}`) }, '저장 취소')
      : el('button', { onclick: () => call('PUT', `/api/me/bookmarks/${post.id}`) }, '저장')]));
  }

  // FR-EXT-12 신고 (남의 글·댓글)
  if (f.reports) {
    const R = { confidential: '기밀 정보', personal_info: '개인정보', evaluative: '사람 평가성', other: '기타' };
    const report = async (id) => {
      const reason = prompt(`신고 사유 번호를 입력하세요\n${Object.values(R).map((v, i) => `${i + 1}. ${v}`).join('\n')}\n(기밀·개인정보는 즉시 숨겨집니다)`);
      const key = Object.keys(R)[Number(reason) - 1];
      if (!key) return;
      const note = prompt('메모 (선택 · 500자 이내 · 개인정보 금지)') ?? '';
      try { const r = await api(`/api/posts/${id}/report`, { method: 'POST', body: { reason: key, note } }); alert(r.autoHidden ? '접수되었고 글이 즉시 숨겨졌습니다.' : '접수되었습니다. 사무국이 확인합니다.'); reload(); }
      catch (e) { alert(e.message); }
    };
    ext.postActions.push((post) => (post.mine || post.status !== 'live' ? [] : [el('button', { onclick: () => report(post.id) }, '신고')]));
    ext.commentActions.push((c) => (c.mine || c.status !== 'live' ? [] : [el('button', { class: 'link', onclick: () => report(c.id) }, '신고')]));
  }

  // FR-EXT-04 이번 주 새 글 보기
  if (f.digest) {
    ext.views.recent = async (main, { listItem }) => {
      while (main.firstChild) main.removeChild(main.firstChild);
      const d = await api('/api/feed/recent?days=7');
      main.append(el('h1', {}, '이번 주 새 글'), el('p', { class: 'muted small' }, `최근 ${d.days}일 · 읽을 수 있는 공간 · 최신순`));
      if (!d.items.length) main.append(el('p', { class: 'muted' }, '새 글이 없습니다.'));
      for (const p of d.items) main.append(listItem(p, p.spaceId));
    };
  }
  if (f.bookmarks) ext.views.bookmarks = true;
}
