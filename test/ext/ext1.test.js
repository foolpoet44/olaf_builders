// P4.5 확장 1차 — FR-EXT-01·02·06·07·08a·09
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { makeApp } from '../helpers.js';
import { seedPeople } from '../seed.js';

let t, s, b1, b2, b3, admin, master;
const enc = encodeURIComponent;
const post = (c, sid, title = '글', body = '본문') => c.post(`/api/spaces/${enc(sid)}/posts`, { title, body });

before(async () => {
  t = await makeApp();
  s = seedPeople(t);
  [b1, b2, b3, admin, master] = await Promise.all(['TEST-001', 'TEST-002', 'TEST-003', 'OP-01', 'MS-01'].map((id) => s.login(id)));
});
const extra = [];
const mk = async (o) => { const a = await makeApp(o); extra.push(a); return a; };
after(async () => { await t.close(); for (const a of extra) await a.close().catch(() => {}); });

test('/api/me features 에 확장 키가 모두 실린다 · 기본 helpful·surveys false', async () => {
  const f = (await b1.get('/api/me')).body.data.features;
  for (const k of ['templates', 'directory', 'pin', 'accept', 'qcardAnswer', 'notifications']) assert.equal(f[k], true, k);
  assert.equal(f.helpful, false);
  assert.equal(f.surveys, false);
});

test('FR-EXT-01 틀이 있는 공간만 template 배열', async () => {
  const items = (await b1.get('/api/spaces')).body.data.items;
  assert.deepEqual(items.find((x) => x.id === 'build_review').template, ['Problem', 'Solution', 'Evidence', 'Business Impact', 'Next Scale']);
  assert.equal(items.find((x) => x.id === 'notice').template, undefined);
});

test('FR-EXT-02 디렉터리: Lab→그룹→이름 · 비활성 제외 · 표시 칸만 · 과제명 기본 숨김', async () => {
  const g = (await b1.get('/api/directory')).body.data.groups;
  assert.deepEqual(g.map((x) => x.label), ['Physical AI · PA-1', 'Physical AI · PA-2', 'Agentic AI · AA-1', 'Digital Twin · DT-1', 'Master', '사무국']);
  for (const grp of g) for (const p of grp.people) assert.deepEqual(Object.keys(p).sort(), ['grp', 'id', 'lab', 'name', 'title']);
  const t2 = await mk({ settingsFile: { directory: { showChallenge: true } } });
  const s2 = seedPeople(t2);
  await (await s2.login('OP-01')).post('/api/admin/people/TEST-002/deactivate');
  const g2 = (await (await s2.login('TEST-001')).get('/api/directory')).body.data.groups;
  assert.equal(g2[0].people[0].challenge, '설비 예지보전');
  assert.ok(!g2.some((x) => x.people.some((p) => p.id === 'TEST-002')));
});

test('FR-EXT-06 공지 고정: builder 403 · 댓글 400 · 공간당 4번째 409 · 고정 글은 pinned 에만', async () => {
  const ids = [];
  for (let i = 0; i < 4; i++) ids.push((await post(admin, 'notice', `공지 ${i}`)).body.data.id);
  const cmt = (await admin.post(`/api/posts/${ids[0]}/comments`, { body: '댓글' })).body.data.id;
  assert.equal((await b1.post(`/api/admin/posts/${ids[0]}/pin`)).status, 403);
  assert.equal((await admin.post(`/api/admin/posts/${cmt}/pin`)).status, 400);
  for (let i = 0; i < 3; i++) assert.equal((await admin.post(`/api/admin/posts/${ids[i]}/pin`)).status, 200);
  assert.equal((await admin.post(`/api/admin/posts/${ids[3]}/pin`)).status, 409);
  const d = (await b1.get('/api/spaces/notice/posts')).body.data;
  assert.deepEqual(d.pinned.map((x) => x.id).sort(), ids.slice(0, 3).sort());
  assert.deepEqual(d.items.map((x) => x.id), [ids[3]]);
  assert.equal((await admin.del(`/api/admin/posts/${ids[0]}/pin`)).status, 200);
  assert.ok(t.db.prepare("SELECT 1 FROM audit_log WHERE action='post_unpin'").get());
});

test('FR-EXT-07 답변 채택: acceptAnswers 공간만 · 다른 글 댓글 400 · 남의 글 403 · 채택 댓글 삭제 시 해결 해제', async () => {
  const q = (await post(b1, 'master_qa', '질문', '알려 주세요')).body.data.id;
  const other = (await post(b2, 'master_qa', '다른 질문')).body.data.id;
  const c1 = (await master.post(`/api/posts/${q}/comments`, { body: '답변' })).body.data.id;
  const cOther = (await master.post(`/api/posts/${other}/comments`, { body: '다른 답' })).body.data.id;
  const br = (await post(b1, 'build_review', '리뷰')).body.data.id;
  const brc = (await b2.post(`/api/posts/${br}/comments`, { body: '코멘트' })).body.data.id;
  assert.equal((await b1.post(`/api/posts/${br}/accept`, { commentId: brc })).status, 400);
  assert.equal((await b1.post(`/api/posts/${q}/accept`, { commentId: cOther })).status, 400);
  assert.equal((await b2.post(`/api/posts/${q}/accept`, { commentId: c1 })).status, 403);
  assert.equal((await b1.post(`/api/posts/${q}/accept`, { commentId: c1 })).status, 200);
  const list = (await b2.get('/api/spaces/master_qa/posts')).body.data.items;
  assert.equal(list.find((x) => x.id === q).solved, true);
  assert.equal(list.find((x) => x.id === other).solved, false);
  const d = (await b2.get(`/api/posts/${q}`)).body.data;
  assert.equal(d.post.acceptedCommentId, c1);
  assert.equal(d.comments[0].accepted, true);
  await master.del(`/api/posts/${c1}`);
  assert.equal((await b2.get('/api/spaces/master_qa/posts')).body.data.items.find((x) => x.id === q).solved, false);
});

test('FR-EXT-08a 질문 카드 답변 글: 본문 인용 · 성명 없음 · followup · 두 번째 409 · 참여자 answerPostId', async () => {
  const cardId = (await b1.post('/api/qcards', { session: 'DT', format: 'template', situation: '설비 이상 징후 판별', constraint: '고장 이력 데이터가 부족한', ask: '이 현실 이슈를 해결한 사례가 있나?' })).body.data.id;
  assert.equal((await admin.post(`/api/admin/qcards/${cardId}/answer-post`, { body: '' })).status, 400);
  const r = await admin.post(`/api/admin/qcards/${cardId}/answer-post`, { body: '사례: 가상 공장 A 에서 시뮬레이션 데이터로 보완' });
  assert.equal(r.status, 201);
  const p = (await b2.get(`/api/posts/${r.body.data.postId}`)).body.data.post;
  assert.ok(p.body.startsWith('【질문】 내 과제 「설비 예지보전」에서'));
  assert.ok(!p.body.includes('가나다'));
  assert.equal(p.space.id, 'master_qa');
  assert.equal(t.db.prepare('SELECT status FROM qcards WHERE id = ?').get(cardId).status, 'followup');
  assert.equal((await admin.post(`/api/admin/qcards/${cardId}/answer-post`, { body: '또' })).status, 409);
  const mine = (await b1.get('/api/qcards/mine')).body.data.items.find((c) => c.id === cardId);
  assert.equal(mine.answerPostId, r.body.data.postId);
  assert.equal((await admin.get('/api/admin/qcards')).body.data.items.find((c) => c.id === cardId).answerPostId, r.body.data.postId);
});

test('FR-EXT-09 알림: 남의 새 글만 · seen 뒤 0 · 권한 밖 공간 없음 · 내 글 새 댓글 · 다른 사람 seen 키 403', async () => {
  const t2 = await mk();
  const s2 = seedPeople(t2);
  const [x1, x2, x3, xm] = await Promise.all(['TEST-001', 'TEST-002', 'TEST-003', 'MS-01'].map((id) => s2.login(id)));
  const mine = (await post(x1, 'group_board/PA-1', '내 글')).body.data.id;
  await post(x2, 'lab_lounge/PA', '라운지 새 글');
  await post(x3, 'group_board/AA-1', '다른 그룹 글');
  assert.equal((await xm.post(`/api/posts/${mine}/comments`, { body: '댓글' })).status, 201);
  await x1.post(`/api/posts/${mine}/comments`, { body: '내 댓글' });
  let n = (await x1.get('/api/me/notifications')).body.data;
  const by = Object.fromEntries(n.spaces.map((x) => [x.id, x.newPosts]));
  assert.equal(by['lab_lounge/PA'], 1);
  assert.equal(by['group_board/PA-1'], 0);
  assert.equal(by['group_board/AA-1'], undefined);
  assert.equal(n.newCommentsOnMine, 1);
  assert.equal((await x1.get('/api/me/notifications/mine')).body.data.items[0].postId, mine);
  t2.clock.advance(1000);
  await x1.post('/api/me/seen', { key: 'space:lab_lounge/PA' });
  await x1.post('/api/me/seen', { key: 'mine' });
  n = (await x1.get('/api/me/notifications')).body.data;
  assert.equal(n.spaces.find((x) => x.id === 'lab_lounge/PA').newPosts, 0);
  assert.equal(n.newCommentsOnMine, 0);
  assert.equal((await x1.post('/api/me/seen', { key: 'space:group_board/AA-1' })).status, 403);
  // 비활성화 시 seen 삭제
  await (await s2.login('OP-01')).post('/api/admin/people/TEST-001/deactivate');
  assert.equal(t2.db.prepare("SELECT COUNT(*) n FROM seen WHERE person_id='TEST-001'").get().n, 0);
});

test('FR-EXT-00 모든 확장 기능 끔 → 확장 경로 404 · 기존 응답에 확장 칸 없음', async () => {
  const off = Object.fromEntries(['templates', 'directory', 'pin', 'accept', 'qcardAnswer', 'notifications', 'events', 'digest', 'inviteText', 'materialThreads', 'bookmarks', 'tags', 'reports', 'helpful', 'surveys'].map((k) => [k, false]));
  const t2 = await mk({ settingsFile: { features: off } });
  const s2 = seedPeople(t2);
  const [x1, a] = await Promise.all([s2.login('TEST-001'), s2.login('OP-01')]);
  const q = (await post(x1, 'master_qa', '질문')).body.data.id;
  const c = (await a.post(`/api/posts/${q}/comments`, { body: '답' })).body.data.id;
  for (const [m, p, b] of [['get', '/api/directory'], ['get', '/api/me/notifications'], ['post', '/api/me/seen', { key: 'mine' }], ['post', `/api/posts/${q}/accept`, { commentId: c }]]) {
    assert.equal((await x1[m](p, b)).status, 404, p);
  }
  assert.equal((await a.post(`/api/admin/posts/${q}/pin`)).status, 404);
  assert.equal((await a.post('/api/admin/qcards/1/answer-post', { body: 'x' })).status, 404);
  const sp = (await x1.get('/api/spaces')).body.data.items;
  assert.ok(sp.every((x) => !('template' in x)));
  assert.ok(!sp.some((x) => x.id === 'material_qa'));
  const list = (await x1.get('/api/spaces/master_qa/posts')).body.data;
  assert.ok(!('pinned' in list));
  assert.ok(list.items.every((x) => !('solved' in x)));
  const d = (await x1.get(`/api/posts/${q}`)).body.data;
  assert.ok(!('acceptedCommentId' in d.post) && !('pinned' in d.post));
  assert.deepEqual((await x1.get('/api/me')).body.data.menu.map((m) => m.key), ['materials', 'qcards', 'board']);
});
