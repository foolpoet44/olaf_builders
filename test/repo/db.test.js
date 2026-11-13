import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { openDb, migrate, userVersion, latestVersion, backupTo, tx } from '../../src/db.js';
import { runDailyBackup, pruneLogs } from '../../src/backup.js';
import { tmpDir } from '../helpers.js';

const fresh = () => { const db = openDb(':memory:'); migrate(db, {}); return db; };

test('빈 DB → 최신 스키마', () => {
  const db = fresh();
  assert.equal(userVersion(db), latestVersion());
  assert.equal(db.prepare('PRAGMA integrity_check').get().integrity_check, 'ok');
});

test('최신 DB 는 그대로 (백업 없음)', () => {
  const db = fresh();
  assert.deepEqual(migrate(db, { backupDir: tmpDir() }).backup, null);
});

test('코드보다 높은 user_version 이면 시작 거부', () => {
  const db = fresh();
  db.exec(`PRAGMA user_version = ${latestVersion() + 1}`);
  assert.throws(() => migrate(db, {}), /schema newer than code/);
});

test('스키마를 올리기 전에 pre-migrate 백업을 만든다', () => {
  const dir = tmpDir();
  const schemaDir = path.join(dir, 'schema');
  fs.mkdirSync(schemaDir);
  fs.writeFileSync(path.join(schemaDir, '001_a.sql'), 'CREATE TABLE a(x); PRAGMA user_version = 1;');
  const db = openDb(path.join(dir, 'x.db'));
  migrate(db, { dir: schemaDir });
  db.exec("INSERT INTO a VALUES ('keep')");
  fs.writeFileSync(path.join(schemaDir, '002_b.sql'), 'ALTER TABLE a ADD COLUMN y; PRAGMA user_version = 2;');
  const r = migrate(db, { dir: schemaDir, backupDir: path.join(dir, 'bk') });
  assert.equal(r.to, 2);
  assert.ok(fs.existsSync(r.backup));
  const old = new DatabaseSync(r.backup, { readOnly: true });
  assert.equal(old.prepare('PRAGMA user_version').get().user_version, 1);
  assert.equal(old.prepare('SELECT x FROM a').get().x, 'keep');
  old.close();
  db.close();
});

test('트리거: audit_log 수정·삭제 불가', () => {
  const db = fresh();
  db.exec("INSERT INTO audit_log(at,actor,action) VALUES('t','OP-01','x')");
  assert.throws(() => db.exec('DELETE FROM audit_log'), /append-only/);
  assert.throws(() => db.exec("UPDATE audit_log SET actor='y'"), /append-only/);
});

test('트리거: posts 행 삭제·소유 변경 불가, post_versions 수정 불가, status 변경 허용', () => {
  const db = fresh();
  db.exec("INSERT INTO people VALUES('TEST-001','builder','가나다','','PA','PA-1','[]',NULL,1,'t','t')");
  db.exec("INSERT INTO spaces VALUES('notice','notice','공지',NULL,NULL,'all','operator',1)");
  db.exec("INSERT INTO posts(space_id,author_id,created_at,updated_at) VALUES('notice','TEST-001','t','t')");
  db.exec("INSERT INTO post_versions VALUES(1,1,'제목','본문','t','TEST-001')");
  assert.throws(() => db.exec('DELETE FROM posts'), /never deleted/);
  assert.throws(() => db.exec("UPDATE posts SET author_id='X'"), /only status/);
  assert.throws(() => db.exec("UPDATE post_versions SET body='x'"), /append-only/);
  db.exec("UPDATE posts SET status='deleted'");
  assert.equal(db.prepare('SELECT status FROM posts').get().status, 'deleted');
});

test('tx 는 실패 시 되돌린다', () => {
  const db = fresh();
  assert.throws(() => tx(db, () => {
    db.exec("INSERT INTO audit_log(at,actor,action) VALUES('t','OP-01','x')");
    throw new Error('boom');
  }));
  assert.equal(db.prepare('SELECT COUNT(*) n FROM audit_log').get().n, 0);
});

test('FR-SYS-07 일일 백업: VACUUM INTO 사본 · 보존 개수 · pre-* 유지', () => {
  const dir = tmpDir();
  const bk = path.join(dir, 'bk');
  const db = openDb(path.join(dir, 'olaf.db'));
  migrate(db, {});
  db.exec("INSERT INTO audit_log(at,actor,action) VALUES('t','OP-01','x')");
  fs.mkdirSync(bk);
  for (const d of ['20261101', '20261102', '20261103']) fs.writeFileSync(path.join(bk, `olaf-${d}.db`), '');
  fs.writeFileSync(path.join(bk, 'pre-migrate-v1-x.db'), '');
  const r = runDailyBackup({ db, backupDir: bk, keep: 2, now: new Date(2026, 10, 20, 3) });
  assert.ok(r.created);
  assert.deepEqual(r.removed, ['olaf-20261101.db', 'olaf-20261102.db']);
  assert.ok(fs.existsSync(path.join(bk, 'pre-migrate-v1-x.db')));
  const copy = new DatabaseSync(r.file, { readOnly: true });
  assert.equal(copy.prepare('SELECT COUNT(*) n FROM audit_log').get().n, 1);
  copy.close();
  assert.equal(runDailyBackup({ db, backupDir: bk, keep: 2, now: new Date(2026, 10, 20, 9) }).created, false);
  db.close();
});

test('backupTo 사본 열림', () => {
  const dir = tmpDir();
  const db = fresh();
  const f = backupTo(db, path.join(dir, 'c.db'));
  assert.ok(fs.statSync(f).size > 0);
});

test('NFR-12 오래된 회전 로그 정리, out.log·err.log 유지', () => {
  const dir = tmpDir();
  for (const f of ['out.log', 'err.log', 'out-20260101.log', 'new.log']) fs.writeFileSync(path.join(dir, f), 'x');
  const old = new Date('2026-01-01');
  for (const f of ['out.log', 'out-20260101.log']) fs.utimesSync(path.join(dir, f), old, old);
  const removed = pruneLogs(dir, 30, new Date('2026-11-20'));
  assert.deepEqual(removed, ['out-20260101.log']);
  assert.ok(fs.existsSync(path.join(dir, 'out.log')));
});
