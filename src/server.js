// 진입 파일 — NSSM AppParameters = src\server.js
// 유일하게 process·env 를 직접 읽는 곳 (docs/02_ARCHITECTURE.md 3절)
import { resolveEnv, ConfigError } from './config.js';
import { bootstrap } from './bootstrap.js';
import { runDailyBackup, pruneLogs, scheduleDaily } from './backup.js';
import { log } from './lib/log.js';

function main() {
  let env, ctx;
  try {
    env = resolveEnv(process.env);
    ctx = bootstrap(env);
  } catch (e) {
    const known = e instanceof ConfigError || e.name === 'SchemaError';
    log.fatal(known ? e.message : `시작 실패: ${e.name}: ${e.message}`);
    process.exit(1);
  }
  const { app, deps, migration, secretsCreated } = ctx;
  const cfg = deps.settings.cfg;
  if (secretsCreated) log.info('secrets.json 생성됨 (config 폴더 접근 권한을 확인하세요)');
  if (migration.from !== migration.to) log.info('스키마 적용', { from: migration.from, to: migration.to, backup: migration.backup ? 'yes' : 'no' });

  const removed = pruneLogs(env.logDir, cfg.logs?.keepDays ?? 30);
  if (removed.length) log.info('오래된 로그 정리', { count: removed.length });

  const backup = () => runDailyBackup({ db: deps.db, backupDir: env.backupDir, keep: deps.settings.cfg.backup.keep, audit: deps.audit });
  const daily = scheduleDaily(cfg.backup.hourLocal, backup);
  const sweeper = setInterval(() => deps.sweep?.(), 3600_000);
  sweeper.unref();

  const server = app.listen(env.port, env.host, () => {
    log.info('OLAF Builders 시작', { app: cfg.appId, release: env.release, host: env.host, port: env.port, schema: deps.schemaVersion });
  });
  server.on('error', (e) => {
    log.fatal(`listen 실패: ${e.code ?? e.message}`);
    process.exit(1);
  });

  let stopping = false;
  const shutdown = (sig) => {
    if (stopping) return;
    stopping = true;
    log.info('종료 신호', { sig });
    daily.stop();
    clearInterval(sweeper);
    const force = setTimeout(() => { log.warn('진행 중 요청 대기 시간 초과 — 강제 종료'); finish(1); }, 10_000);
    force.unref();
    server.close(() => { clearTimeout(force); finish(0); });
    server.closeIdleConnections?.();
  };
  const finish = (code) => {
    try { deps.db.close(); } catch { /* 이미 닫힘 */ }
    log.info('종료');
    process.exit(code);
  };
  for (const sig of ['SIGINT', 'SIGTERM', 'SIGBREAK']) process.on(sig, () => shutdown(sig));
  process.on('uncaughtException', (e) => { log.fatal('uncaughtException', { name: e.name, msg: String(e.message).slice(0, 200) }); finish(1); });
  process.on('unhandledRejection', (e) => { log.fatal('unhandledRejection', { msg: String(e?.message ?? e).slice(0, 200) }); finish(1); });
}

main();
