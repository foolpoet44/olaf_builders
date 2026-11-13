import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { makeApp, client } from '../helpers.js';
import { seedPeople } from '../seed.js';
import { writeZip, readZip } from '../../src/lib/zip.js';
import { checkPackage, isWebp } from '../../src/domain/materials.js';
import { loadConfig } from '../../src/config.js';
import { WEBP_1PX, fakeWebp } from '../fixtures/webp.js';

let t, s, admin, builder;
const pkg = (pages = 2, manifest = {}) => writeZip([
  { name: 'manifest.json', data: Buffer.from(JSON.stringify({ title: '가상 자료 1', lecturer: '가나다 (가상대학교)', session: 'DT', pages, ...manifest })) },
  ...Array.from({ length: pages }, (_, i) => ({ name: `p${String(i + 1).padStart(3, '0')}.webp`, data: WEBP_1PX })),
]);

before(async () => {
  t = await makeApp();
  s = seedPeople(t);
  admin = await s.login('OP-01');
  builder = await s.login('TEST-001');
});
after(() => t.close());

test('webp 서명 확인', () => {
  assert.ok(isWebp(WEBP_1PX));
  assert.ok(!isWebp(Buffer.from('\x89PNG\r\n\x1a\n0000')));
});

test('FR-MAT-05 거부 케이스: 경로 이탈·절대경로·폴더·이름 형식·png 내용·쪽 수·크기·manifest 불일치', () => {
  const cfg = loadConfig({});
  const base = [{ name: 'manifest.json', data: Buffer.from('{"title":"x","pages":1}'), dir: false }, { name: 'p001.webp', data: WEBP_1PX, dir: false }];
  const P = (extra, mod = (x) => x) => checkPackage(mod([...base, ...extra]), cfg).problems.join('\n');
  assert.match(P([{ name: '../p002.webp', data: WEBP_1PX, dir: false }]), /경로/);
  assert.match(P([{ name: 'C:x.webp', data: WEBP_1PX, dir: false }]), /경로/);
  assert.match(P([{ name: 'sub/', data: Buffer.alloc(0), dir: true }]), /폴더/);
  assert.match(P([{ name: 'p1.webp', data: WEBP_1PX, dir: false }]), /허용되지 않은 파일/);
  assert.match(P([], (l) => [l[0], { name: 'p001.webp', data: Buffer.from('\x89PNG....xxxx'), dir: false }]), /webp 이미지가 아닙니다/);
  assert.match(P([], (l) => [l[0], { name: 'p001.webp', data: fakeWebp(2048 * 1024), dir: false }]), /너무 큽니다/);
  assert.match(P([{ name: 'p003.webp', data: WEBP_1PX, dir: false }]), /비어 있습니다: p002/);
  const many = [{ name: 'manifest.json', data: Buffer.from('{"title":"x","pages":151}'), dir: false },
    ...Array.from({ length: 151 }, (_, i) => ({ name: `p${String(i + 1).padStart(3, '0')}.webp`, data: WEBP_1PX, dir: false }))];
  assert.match(checkPackage(many, cfg).problems.join(), /쪽 수가 너무 많습니다/);
  assert.match(checkPackage([base[1]], cfg).problems.join(), /manifest.json 이 없습니다/);
  assert.match(checkPackage([{ ...base[0], data: Buffer.from('{"title":"x","pages":3}') }, base[1]], cfg).problems.join(), /다릅니다/);
});

test('FR-MAT-04 사무국 꾸러미 등록 → draft · builder 에게 404 (FR-MAT-06)', async () => {
  const r = await admin.post('/api/admin/materials', pkg(3));
  assert.equal(r.status, 201, JSON.stringify(r.body));
  assert.deepEqual({ ...r.body.data, id: 0 }, { id: 0, pages: 3, status: 'draft' });
  const id = r.body.data.id;
  assert.equal((await builder.get(`/api/materials/${id}`)).status, 404);
  assert.equal((await builder.get(`/api/materials/${id}/pages/1`)).status, 404);
  assert.equal((await builder.get('/api/materials')).body.data.items.length, 0);
  const dir = `${t.env.uploadDir}/materials`;
  const folder = fs.readdirSync(dir)[0];
  assert.match(folder, /^[0-9a-f]{24}$/);
  assert.deepEqual(fs.readdirSync(`${dir}/${folder}`), ['p001.webp', 'p002.webp', 'p003.webp']);
  assert.ok(t.db.prepare("SELECT 1 FROM audit_log WHERE action='material_upload'").get());
});

test('FR-MAT-01·02·03 공개 후 목록·메타·쪽 이미지 (no-store · inline) · 범위 밖 404', async () => {
  const id = (await admin.post('/api/admin/materials', pkg(2))).body.data.id;
  assert.equal((await admin.patch(`/api/admin/materials/${id}`, { status: 'published' })).status, 200);
  const list = await builder.get('/api/materials');
  assert.ok(list.body.data.items.some((m) => m.id === id));
  assert.ok(!('views' in list.body.data.items[0]));
  const img = await builder.get(`/api/materials/${id}/pages/2`);
  assert.equal(img.status, 200);
  assert.equal(img.headers.get('content-type'), 'image/webp');
  assert.equal(img.headers.get('cache-control'), 'no-store');
  assert.equal(img.headers.get('content-disposition'), 'inline');
  assert.ok(Buffer.compare(img.body, WEBP_1PX) === 0);
  assert.equal((await builder.get(`/api/materials/${id}/pages/3`)).status, 404);
  assert.equal((await builder.get(`/api/materials/${id}/pages/0`)).status, 404);
  assert.equal((await builder.get(`/api/materials/${id}/pages/..%2F..%2Fx`)).status, 404);
});

test('FR-MAT-07 열람 건수는 사무국만 · builder 열람 시 증가', async () => {
  const id = (await admin.post('/api/admin/materials', pkg(1))).body.data.id;
  await admin.patch(`/api/admin/materials/${id}`, { status: 'published' });
  await builder.get(`/api/materials/${id}`);
  await builder.get(`/api/materials/${id}`);
  await admin.get(`/api/materials/${id}`);
  const all = await admin.get('/api/materials?all=1');
  assert.equal(all.body.data.items.find((m) => m.id === id).views, 2);
  const b = await builder.get('/api/materials?all=1');
  assert.ok(!('views' in b.body.data.items[0]));
});

test('FR-MAT-06 숨김으로 바꾸면 builder 404', async () => {
  const id = (await admin.post('/api/admin/materials', pkg(1))).body.data.id;
  await admin.patch(`/api/admin/materials/${id}`, { status: 'published' });
  assert.equal((await builder.get(`/api/materials/${id}`)).status, 200);
  await admin.patch(`/api/admin/materials/${id}`, { status: 'hidden' });
  assert.equal((await builder.get(`/api/materials/${id}`)).status, 404);
});

test('잘못된 꾸러미는 400 problems · 파일 남지 않음', async () => {
  const before = fs.readdirSync(`${t.env.uploadDir}/materials`).length;
  const r = await admin.post('/api/admin/materials', pkg(2, { pages: 5 }));
  assert.equal(r.status, 400);
  assert.ok(r.body.error.problems.length);
  const r2 = await admin.post('/api/admin/materials', Buffer.from('not a zip at all, sorry........'));
  assert.equal(r2.status, 400);
  assert.equal(fs.readdirSync(`${t.env.uploadDir}/materials`).length, before);
});

test('builder 는 업로드 403', async () => {
  assert.equal((await builder.post('/api/admin/materials', pkg(1))).status, 403);
});

test('zip 왕복', () => {
  const e = readZip(pkg(2));
  assert.deepEqual(e.map((x) => x.name), ['manifest.json', 'p001.webp', 'p002.webp']);
});
