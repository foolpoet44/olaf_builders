import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { makeApp } from '../helpers.js';
import { seedPeople } from '../seed.js';

let t, s, b1, b2, b3, admin, master;
const enc = encodeURIComponent;

before(async () => {
  t = await makeApp();
  s = seedPeople(t);
  [b1, b2, b3, admin, master] = await Promise.all(['TEST-001', 'TEST-002', 'TEST-003', 'OP-01', 'MS-01'].map((id) => s.login(id)));
});
after(() => t.close());

test('FR-BRD-01 공간 목록: 읽을 수 있는 공간만 · canWrite · 설정 순서', async () => {
  const r = await b1.get('/api/spaces');
  const ids = r.body.data.items.map((x) => x.id);
  assert.ok(ids.includes('group_board/PA-1'));
  assert.ok(!ids.includes('group_board/PA-2'));
  assert.equal(r.body.data.items.find((x) => x.id === 'notice').canWrite, false);
  assert.equal(ids[0], 'notice');
});

test('FR-BRD-02 다른 그룹 보드 읽기·쓰기 404/403 · 공지는 사무국만 쓰기', async () => {
  assert.equal((await b1.get(`/api/spaces/${enc('group_board/PA-2')}/posts`)).status, 404);
  assert.equal((await b1.post(`/api/spaces/${enc('group_board/PA-2')}/posts`, { title: 'x', body: 'y' })).status, 404);
  assert.equal((await b1.post('/api/spaces/notice/posts', { title: '공지', body: '본문' })).status, 403);
  assert.equal((await admin.post('/api/spaces/notice/posts', { title: '공지', body: '본문' })).status, 201);
  assert.equal((await b1.post(`/api/spaces/${enc('lab_lounge/AA')}/posts`, { title: 'x', body: 'y' })).status, 403);
});

test('FR-BRD-04·09 글 검사: 제목 필수 · 길이 · 개인정보 거부 · 줄바꿈 보존 · HTML 은 문자 그대로', async () => {
  const sid = enc('group_board/PA-1');
  assert.equal((await b1.post(`/api/spaces/${sid}/posts`, { title: '', body: '본문' })).status, 400);
  assert.equal((await b1.post(`/api/spaces/${sid}/posts`, { title: 'x'.repeat(201), body: '본문' })).status, 400);
  const r = await b1.post(`/api/spaces/${sid}/posts`, { title: '연락처', body: '010-1234-5678 로 연락' });
  assert.equal(r.status, 400);
  assert.match(r.body.error.problems.join(), /휴대전화/);
  const ok = await b1.post(`/api/spaces/${sid}/posts`, { title: '<b>주간</b> 공유', body: '첫 줄\n둘째 줄\n<script>x</script>' });
  assert.equal(ok.status, 201);
  const p = await b1.get(`/api/posts/${ok.body.data.id}`);
  assert.equal(p.body.data.post.body, '첫 줄\n둘째 줄\n<script>x</script>');
  assert.equal(p.body.data.post.title, '<b>주간</b> 공유');
});

test('FR-BRD-05 수정은 새 판 · 판 불일치 409 · 남의 글 403 · 사무국만 이전 판 (FR-BRD-11)', async () => {
  const id = (await b1.post(`/api/spaces/${enc('master_qa')}/posts`, { title: '질문', body: '처음 본문' })).body.data.id;
  assert.equal((await b1.put(`/api/posts/${id}`, { title: '질문(수정)', body: '고친 본문', ver: 1 })).status, 200);
  assert.equal((await b1.put(`/api/posts/${id}`, { body: '또', ver: 1 })).status, 409);
  assert.equal((await b2.put(`/api/posts/${id}`, { body: '남의 글', ver: 2 })).status, 403);
  const p = (await b2.get(`/api/posts/${id}`)).body.data.post;
  assert.equal(p.body, '고친 본문');
  assert.equal(p.edited, true);
  assert.equal((await b1.get(`/api/admin/posts/${id}/versions`)).status, 403);
  const v = await admin.get(`/api/admin/posts/${id}/versions`);
  assert.deepEqual(v.body.data.items.map((x) => x.body), ['처음 본문', '고친 본문']);
});

test('FR-BRD-06 작성자 삭제 → 안내 문구 · 원본은 사무국만 · 행 유지', async () => {
  const id = (await b1.post(`/api/spaces/${enc('build_review')}/posts`, { title: '지울 글', body: '원문' })).body.data.id;
  await b2.post(`/api/posts/${id}/comments`, { body: '남는 댓글' });
  assert.equal((await b2.del(`/api/posts/${id}`)).status, 403);
  assert.equal((await b1.del(`/api/posts/${id}`)).status, 200);
  const list = (await b2.get(`/api/spaces/build_review/posts`)).body.data.items;
  const it = list.find((x) => x.id === id);
  assert.equal(it.title, null);
  assert.equal(it.notice, '작성자가 삭제한 글입니다.');
  assert.equal(it.author, null);
  const d = await b2.get(`/api/posts/${id}`);
  assert.equal(d.body.data.post.body, null);
  assert.equal(d.body.data.comments[0].body, '남는 댓글');
  assert.equal((await admin.get(`/api/posts/${id}`)).body.data.post.body, '원문');
  assert.equal(t.db.prepare('SELECT COUNT(*) n FROM posts WHERE id = ?').get(id).n, 1);
});

test('FR-BRD-07 사무국 숨김: 사유 필수 · builder 목록에서 사라짐 · 사무국은 사유와 봄 · 복구', async () => {
  const id = (await b1.post(`/api/spaces/${enc('master_qa')}/posts`, { title: '숨길 글', body: '내용' })).body.data.id;
  assert.equal((await admin.post(`/api/admin/posts/${id}/hide`, {})).status, 400);
  assert.equal((await b2.post(`/api/admin/posts/${id}/hide`, { reason: 'other' })).status, 403);
  assert.equal((await admin.post(`/api/admin/posts/${id}/hide`, { reason: 'confidential' })).status, 200);
  assert.ok(!(await b2.get('/api/spaces/master_qa/posts')).body.data.items.some((x) => x.id === id));
  assert.equal((await b2.get(`/api/posts/${id}`)).status, 404);
  const own = await b1.get(`/api/posts/${id}`);
  assert.equal(own.body.data.post.body, null);
  assert.match(own.body.data.post.notice, /숨김/);
  const a = (await admin.get('/api/spaces/master_qa/posts')).body.data.items.find((x) => x.id === id);
  assert.equal(a.hideReason, 'confidential');
  await admin.post(`/api/admin/posts/${id}/restore`);
  assert.equal((await b2.get(`/api/posts/${id}`)).status, 200);
});

test('댓글: 한 단계만 · 쓰기 권한 필요 · 삭제 글에는 불가', async () => {
  const id = (await b1.post(`/api/spaces/${enc('group_board/PA-1')}/posts`, { title: '그룹 글', body: '내용' })).body.data.id;
  const c = await b1.post(`/api/posts/${id}/comments`, { body: '댓글' });
  assert.equal(c.status, 201);
  assert.equal((await b1.post(`/api/posts/${c.body.data.id}/comments`, { body: '대댓글' })).status, 400);
  assert.equal((await b3.post(`/api/posts/${id}/comments`, { body: '남의 그룹' })).status, 404);
  assert.equal((await master.post(`/api/posts/${id}/comments`, { body: 'Master 의견' })).status, 201);
});

test('FR-BRD-08·10 목록: 최신순 · 20건 페이지 · 검색은 그 공간 안에서만 · LIKE 특수문자 안전', async () => {
  const sid = enc('lab_lounge/PA');
  for (let i = 1; i <= 22; i++) await b1.post(`/api/spaces/${sid}/posts`, { title: `라운지 글 ${i}`, body: i === 5 ? '특별한 키워드 100%' : '일반' });
  await b3.post(`/api/spaces/${enc('lab_lounge/AA')}/posts`, { title: '다른 라운지', body: '특별한 키워드' });
  const p1 = (await b2.get(`/api/spaces/${sid}/posts`)).body.data;
  assert.equal(p1.items.length, 20);
  assert.equal(p1.total, 22);
  assert.equal(p1.items[0].title, '라운지 글 22');
  const q = (await b2.get(`/api/spaces/${sid}/posts?q=${enc('키워드 100%')}`)).body.data;
  assert.deepEqual(q.items.map((x) => x.title), ['라운지 글 5']);
  assert.equal((await b2.get(`/api/spaces/${sid}/posts?q=${enc('%')}`)).body.data.total, 1);
});

test('없는 공간·글 404 · 숫자 아닌 id 404', async () => {
  assert.equal((await b1.get('/api/spaces/nope/posts')).status, 404);
  assert.equal((await b1.get('/api/posts/999999')).status, 404);
  assert.equal((await b1.get('/api/posts/abc')).status, 404);
});
