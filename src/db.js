// SQLite (node:sqlite) — 연결 · 마이그레이션 · 트랜잭션 · 백업 (docs/03_DATA_MODEL.md)
import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { ROOT } from './config.js';

export const SCHEMA_DIR = path.join(ROOT, 'src', 'schema');

export class SchemaError extends Error {}

/** 스키마 파일 목록 [{version, file, sql}] — 번호순 */
export function schemaFiles(dir = SCHEMA_DIR) {
  return fs.readdirSync(dir)
    .filter((f) => /^\d{3}_[a-z0-9_]+\.sql$/.test(f))
    .sort()
    .map((f) => ({ version: Number(f.slice(0, 3)), file: f, sql: fs.readFileSync(path.join(dir, f), 'utf8') }));
}

export const latestVersion = (dir = SCHEMA_DIR) => Math.max(0, ...schemaFiles(dir).map((s) => s.version));

export function openDb(file) {
  if (file !== ':memory:') fs.mkdirSync(path.dirname(file), { recursive: true });
  const db = new DatabaseSync(file);
  db.exec('PRAGMA journal_mode = WAL;');
  db.exec('PRAGMA synchronous = NORMAL;');
  db.exec('PRAGMA foreign_keys = ON;');
  db.exec('PRAGMA busy_timeout = 5000;');
  return db;
}

export const userVersion = (db) => db.prepare('PRAGMA user_version').get().user_version;

/** BEGIN IMMEDIATE … COMMIT. fn 의 반환값을 돌려준다. 중첩 호출은 바깥 트랜잭션에 합친다. */
export function tx(db, fn) {
  if (db.isTransaction) return fn();
  db.exec('BEGIN IMMEDIATE');
  try {
    const r = fn();
    db.exec('COMMIT');
    return r;
  } catch (e) {
    try { db.exec('ROLLBACK'); } catch { /* 이미 끝남 */ }
    throw e;
  }
}

/** 실행 중에도 일관된 사본 (VACUUM INTO). 대상 파일이 있으면 실패하므로 호출자가 확인한다. */
export function backupTo(db, dest) {
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  db.prepare('VACUUM INTO ?').run(dest);
  return dest;
}

const stamp = (d) => d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');

/**
 * 스키마 적용. 낮으면 백업 후 순서대로, 코드보다 높으면 throw.
 * @returns {{from:number,to:number,backup:string|null}}
 */
export function migrate(db, { backupDir, now = new Date(), dir = SCHEMA_DIR } = {}) {
  const files = schemaFiles(dir);
  const latest = Math.max(0, ...files.map((f) => f.version));
  const from = userVersion(db);
  if (from > latest) {
    throw new SchemaError(`schema newer than code: db=${from} code=${latest} — 백업 복원 또는 새 릴리스 필요`);
  }
  if (from === latest) return { from, to: from, backup: null };
  let backup = null;
  if (from > 0 && backupDir) {
    backup = path.join(backupDir, `pre-migrate-v${from}-${stamp(now)}.db`);
    backupTo(db, backup);
  }
  for (const f of files.filter((x) => x.version > from)) {
    tx(db, () => db.exec(f.sql));
    if (userVersion(db) !== f.version) throw new SchemaError(`${f.file} must set PRAGMA user_version = ${f.version}`);
  }
  return { from, to: latest, backup };
}
