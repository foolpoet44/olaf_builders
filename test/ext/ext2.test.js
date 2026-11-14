// P4.6 확장 2차 — FR-EXT-03·04·08b·10·11·12
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { makeApp } from '../helpers.js';
import { seedPeople } from '../seed.js';
import { writeZip } from '../../src/lib/zip.js';
import { WEBP_1PX } from '../fixtures/webp.js';

let t, s, b1, b2, b3, admin, master;
const enc = encodeURIComponent;
const post = (c, sid, title = '글', body = '본문', more = {}) => c.post(`/api/spaces/${enc(sid)}/posts`, { title, body, ...more });
const extra = [];
const mk = async (o) => { const a = await makeApp(o); extra.push(a); return a; };

before(async () => {
  t = await makeApp();
  s = seedPeople(t);
  [b1, b2, b3, admin, master] = await Promise.all(['TEST-001', 'TEST-002', 'TEST-003', 'OP-01', 'MS-01'].map((id) => s.login(id)));
});
after(async () => { await t.close(); for (const a of extra) await a.close().catch(() => {}); });

test('FR-EXT-03 일정: 설정 events + sessions · 날짜순', async () => {
  const items = (await b1.get('/api/events')).body.data.items;
  assert.ok(items.length >= 2);
  for (let i = 1; i < items.length; i++) assert.ok(items[i - 1].date <= items[i].date);
  assert.ok(items.some((e) => e.kind === 'session' && e.title.startsWith('DT')));
  assert.ok(items.some((e) => e.note === 'DT · AA 세션'));
});

test('FR-EXT-04 이번 주 새 글: 읽기 가능 공간만 · 최신순 · days 범위 · 공간별 건수', async () => {
  const t2 = await mk();
  const s2 = seedPeople(t2);
  const [x1, x2, x3] = await Promise.all(['TEST-001', 'TEST-002', 'TEST-003'].map((id) => s2.login(id)));
  // 세션 만료를 피하려고 시계를 과거로 돌려 오래된 글을 쓴 뒤 되돌린다
  t2.clock.advance(-10 * 86400_000);
  await post(x1, 'lab_lounge/PA', '오래된 글');
  t2.clock.advance(10 * 86400_000);
  await post(x2, 'lab_lounge/PA', '새 라운지 글');
  await post(x3, 'group_board/AA-1', '다른 그룹');
  t2.clock.advance(1000);
  await post(x1, 'master_qa', '최신 질문');
  const d = (await x1.get('/api/feed/recent?days=7')).body.data;
  assert.deepEqual(d.items.map((x) => x.title), ['최신 질문', '새 라운지 글']);
  assert.deepEqual(d.counts, { master_qa: 1, 'lab_lounge/PA': 1 });
  assert.equal((await x1.get('/api/feed/recent?days=999')).body.data.days, 30);
  assert.equal((await x1.get('/api/feed/recent?days=30')).body.data.items.length, 3);
});

test('FR-EXT-08b 자료 질문 스레드: 공개 자료만 · 쪽 범위 · material_qa 에서도 보임 · 상세 ref', async () => {
  const zip = writeZip([{ name: 'manifest.json', data: Buffer.from(JSON.stringify({ title: '가상 자료', session: 'DT', pages: 3 })) },
    ...[1, 2, 3].map((i) => ({ name: `p00${i}.webp`, data: WEBP_1PX }))]);
  const id = (await admin.post('/api/admin/materials', zip)).body.data.id;
  assert.equal((await b1.get(`/api/materials/${id}/threads`)).status, 404);
  assert.equal((await b1.post(`/api/materials/${id}/threads`, { title: 'q', body: 'b' })).status, 404);
  await admin.patch(`/api/admin/materials/${id}`, { status: 'published' });
  assert.equal((await b1.post(`/api/materials/${id}/threads`, { title: '쪽 질문', body: '내용', page: 4 })).status, 400);
  const r = await b1.post(`/api/materials/${id}/threads`, { title: '쪽 질문', body: '2쪽 그림 설명 부탁', page: 2 });
  assert.equal(r.status, 201);
  await b2.post(`/api/materials/${id}/threads`, { title: '전체 질문', body: '전체' });
  const list = (await b3.get(`/api/materials/${id}/threads`)).body.data;
  assert.deepEqual(list.items.map((x) => [x.title, x.page]), [['전체 질문', null], ['쪽 질문', 2]]);
  assert.ok((await b3.get('/api/spaces/material_qa/posts')).body.data.items.some((x) => x.id === r.body.data.id));
  const d = (await b3.get(`/api/posts/${r.body.data.id}`)).body.data.post;
  assert.deepEqual(d.ref, { kind: 'material', id, page: 2, title: '가상 자료' });
  await admin.patch(`/api/admin/materials/${id}`, { status: 'hidden' });
  assert.equal((await b1.get(`/api/materials/${id}/threads`)).status, 404);
});

test('FR-EXT-10 저장함: 읽기 권한 없는 글 404 · 본인만 · 삭제·숨김 후 안내 · 삭제는 실제 삭제', async () => {
  const mine = (await post(b1, 'group_board/PA-1', '그룹 글')).body.data.id;
  const open = (await post(b2, 'build_review', '리뷰 글')).body.data.id;
  assert.equal((await b3.put(`/api/me/bookmarks/${mine}`)).status, 404);
  assert.equal((await b3.put(`/api/me/bookmarks/${open}`)).status, 200);
  assert.equal((await b3.put(`/api/me/bookmarks/${open}`)).status, 200);
  assert.equal((await b1.get('/api/me/bookmarks')).body.data.items.length, 0);
  let items = (await b3.get('/api/me/bookmarks')).body.data.items;
  assert.equal(items[0].title, '리뷰 글');
  assert.equal((await b3.get(`/api/posts/${open}`)).body.data.post.bookmarked, true);
  await b2.del(`/api/posts/${open}`);
  items = (await b3.get('/api/me/bookmarks')).body.data.items;
  assert.equal(items[0].title, undefined);
  assert.ok(items[0].notice);
  await b3.del(`/api/me/bookmarks/${open}`);
  assert.equal(t.db.prepare("SELECT COUNT(*) n FROM bookmarks WHERE person_id = 'TEST-003'").get().n, 0);
});

test('FR-EXT-11 태그: 목록 밖·상한 초과 400 · 수정 시 교체 · ?tag= 필터 · 건수', async () => {
  const sid = 'lab_lounge/AA';
  assert.equal((await post(b3, sid, 't', 'b', { tags: ['NotATag'] })).status, 400);
  assert.equal((await post(b3, sid, 't', 'b', { tags: ['Robot', 'AMR', 'Vision', 'Sensor', 'Safety', 'Process'] })).status, 400);
  const id = (await post(b3, sid, '태그 글', 'b', { tags: ['Robot', 'Process'] })).body.data.id;
  await post(b3, sid, '태그 없음', 'b');
  let d = (await b3.get(`/api/spaces/${enc(sid)}/posts?tag=Robot`)).body.data;
  assert.deepEqual(d.items.map((x) => x.title), ['태그 글']);
  assert.deepEqual(d.items[0].tags, ['Process', 'Robot']);
  await b3.put(`/api/posts/${id}`, { title: '태그 글', body: 'b2', ver: 1, tags: ['Quality'] });
  assert.deepEqual((await b3.get(`/api/posts/${id}`)).body.data.post.tags, ['Quality']);
  assert.equal((await b3.get(`/api/spaces/${enc(sid)}/posts?tag=Robot`)).body.data.total, 0);
  const tags = (await b3.get('/api/tags')).body.data.items;
  assert.equal(tags.find((x) => x.tag === 'Quality').count, 1);
  assert.equal(tags.find((x) => x.tag === 'Robot').lab, 'PA');
});

test('FR-EXT-12 신고: 즉시 숨김 사유 · 중복 409 · 사무국 목록에 신고자 · kept 면 복구 · 감사', async () => {
  const id = (await post(b1, 'build_review', '신고될 글', '내용')).body.data.id;
  const id2 = (await post(b1, 'build_review', '평가성 글', '내용')).body.data.id;
  assert.equal((await b2.post(`/api/posts/${id}/report`, { reason: 'bad' })).status, 400);
  assert.equal((await b2.post(`/api/posts/${id}/report`, { reason: 'other', note: '010-1234-5678' })).status, 400);
  const r = await b2.post(`/api/posts/${id}/report`, { reason: 'confidential', note: '고객사 이름' });
  assert.equal(r.status, 201);
  assert.equal(r.body.data.autoHidden, true);
  assert.equal((await b3.get(`/api/posts/${id}`)).status, 404);
  assert.equal((await b2.post(`/api/posts/${id}/report`, { reason: 'other' })).status, 404);
  const r2 = await b2.post(`/api/posts/${id2}/report`, { reason: 'evaluative' });
  assert.equal(r2.body.data.autoHidden, false);
  assert.equal((await b2.post(`/api/posts/${id2}/report`, { reason: 'other' })).status, 409);
  assert.equal((await b1.get('/api/admin/reports')).status, 403);
  const list = (await admin.get('/api/admin/reports?open=1')).body.data;
  const rep = list.items.find((x) => x.post.id === id);
  assert.equal(rep.reporter.name, '라마바');
  assert.equal((await admin.get('/api/me')).body.data.openReports, 2);
  assert.ok(!('openReports' in (await b1.get('/api/me')).body.data));
  assert.equal((await admin.post(`/api/admin/reports/${rep.id}/resolve`, { outcome: 'kept' })).status, 200);
  assert.equal((await b3.get(`/api/posts/${id}`)).status, 200);
  assert.equal((await admin.post(`/api/admin/reports/${rep.id}/resolve`, { outcome: 'kept' })).status, 409);
  const rep2 = list.items.find((x) => x.post.id === id2);
  await admin.post(`/api/admin/reports/${rep2.id}/resolve`, { outcome: 'hidden' });
  assert.equal((await b3.get(`/api/posts/${id2}`)).status, 404);
  for (const a of ['report_create', 'post_auto_hide', 'report_resolve']) assert.ok(t.db.prepare('SELECT 1 FROM audit_log WHERE action = ?').get(a), a);
  assert.throws(() => t.db.prepare('DELETE FROM reports').run(), /never deleted/);
});

test('FR-EXT-12 하루 신고 상한 429', async () => {
  const t2 = await mk({ settingsFile: { moderation: { reportsPerPersonPerDay: 2 } } });
  const s2 = seedPeople(t2);
  const [x1, x2] = await Promise.all([s2.login('TEST-001'), s2.login('TEST-002')]);
  const ids = [];
  for (let i = 0; i < 3; i++) ids.push((await post(x1, 'build_review', `글 ${i}`)).body.data.id);
  assert.equal((await x2.post(`/api/posts/${ids[0]}/report`, { reason: 'other' })).status, 201);
  assert.equal((await x2.post(`/api/posts/${ids[1]}/report`, { reason: 'other' })).status, 201);
  assert.equal((await x2.post(`/api/posts/${ids[2]}/report`, { reason: 'other' })).status, 429);
});

test('P4.6 기능 끔 → 경로 404 · 응답에 칸 없음', async () => {
  const off = Object.fromEntries(['events', 'digest', 'materialThreads', 'bookmarks', 'tags', 'reports'].map((k) => [k, false]));
  const t2 = await mk({ settingsFile: { features: off } });
  const s2 = seedPeople(t2);
  const [x1, a] = await Promise.all([s2.login('TEST-001'), s2.login('OP-01')]);
  const id = (await post(x1, 'build_review', '글', 'b', { tags: ['Robot'] })).body.data.id;
  for (const [m, p, b] of [['get', '/api/events'], ['get', '/api/feed/recent'], ['get', '/api/tags'], ['get', '/api/me/bookmarks'], ['put', `/api/me/bookmarks/${id}`],
    ['post', `/api/posts/${id}/report`, { reason: 'other' }], ['get', '/api/materials/1/threads']]) assert.equal((await x1[m](p, b)).status, 404, p);
  assert.equal((await a.get('/api/admin/reports')).status, 404);
  const d = (await x1.get(`/api/posts/${id}`)).body.data.post;
  assert.ok(!('tags' in d) && !('bookmarked' in d));
  assert.equal(t2.db.prepare('SELECT COUNT(*) n FROM post_tags').get().n, 0);
  assert.ok(!('openReports' in (await a.get('/api/me')).body.data));
});
