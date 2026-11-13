// 일일 백업 · 보존 · 로그 정리 (FR-SYS-07 · NFR-12)
import fs from 'node:fs';
import path from 'node:path';
import { backupTo } from './db.js';
import { localDay } from './lib/clock.js';
import { log } from './lib/log.js';

/** 오늘 백업이 없으면 만든다. 보존 개수 밖의 olaf-*.db 는 지운다 (pre-* 는 유지). */
export function runDailyBackup({ db, backupDir, keep, now = new Date(), audit }) {
  fs.mkdirSync(backupDir, { recursive: true });
  const file = path.join(backupDir, `olaf-${localDay(now)}.db`);
  let created = false;
  if (!fs.existsSync(file)) {
    backupTo(db, file);
    created = true;
    audit?.('SYSTEM', 'backup', path.basename(file));
  }
  const daily = fs.readdirSync(backupDir).filter((f) => /^olaf-\d{8}\.db$/.test(f)).sort();
  const removed = daily.slice(0, Math.max(0, daily.length - keep));
  for (const f of removed) fs.unlinkSync(path.join(backupDir, f));
  return { file, created, removed };
}

/** keepDays 보다 오래된 회전 로그(out-*.log 등) 삭제. 현재 쓰는 out.log·err.log 는 건드리지 않는다. */
export function pruneLogs(logDir, keepDays, now = new Date()) {
  if (!fs.existsSync(logDir)) return [];
  const limit = now.getTime() - keepDays * 86400_000;
  const removed = [];
  for (const f of fs.readdirSync(logDir)) {
    if (f === 'out.log' || f === 'err.log' || !f.endsWith('.log')) continue;
    const p = path.join(logDir, f);
    if (fs.statSync(p).mtimeMs < limit) { fs.unlinkSync(p); removed.push(f); }
  }
  return removed;
}

/** 매일 hourLocal 시에 실행되는 타이머. stop() 으로 해제. */
export function scheduleDaily(hourLocal, fn) {
  let timer;
  const next = () => {
    const now = new Date();
    const t = new Date(now);
    t.setHours(hourLocal, 0, 0, 0);
    if (t <= now) t.setDate(t.getDate() + 1);
    timer = setTimeout(() => {
      try { fn(); } catch (e) { log.error('daily task failed', { name: e.name, msg: String(e.message).slice(0, 200) }); }
      next();
    }, t - now);
    timer.unref();
  };
  next();
  return { stop: () => clearTimeout(timer) };
}
