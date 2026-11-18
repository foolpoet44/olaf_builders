// 서버와 테스트가 함께 쓰는 조립 단계 (docs/02_ARCHITECTURE.md 3절 1~6)
import fs from 'node:fs';
import { loadConfig, createSettings, SCHEMA5_FEATURES, ConfigError } from './config.js';
import { openDb, migrate, latestVersion } from './db.js';
import { loadOrCreateSecrets } from './secrets.js';
import { makeAudit } from './repo/audit.js';
import { systemClock } from './lib/clock.js';
import { createApp } from './app.js';
import { apiRoutes, seed } from './registry.js';

/**
 * @param {object} env  resolveEnv() 결과
 * @param {object} [opt]
 * @param {string} [opt.dbFile]  기본 env.dataDir/olaf.db · 테스트는 ':memory:'
 * @param {object} [opt.cfgOverride]  테스트용 설정 덮어쓰기 (검증 거침)
 */
export function bootstrap(env, opt = {}) {
  const clock = opt.clock ?? systemClock;
  let cfg = loadConfig({ configFile: env.configFile, baseFile: opt.baseFile });
  if (opt.cfgOverride) cfg = opt.cfgOverride(cfg);

  for (const d of [env.dataDir, env.uploadDir, env.configDir, env.backupDir, env.logDir]) fs.mkdirSync(d, { recursive: true });
  const secrets = loadOrCreateSecrets(env.configDir, clock.now());

  const db = openDb(opt.dbFile ?? `${env.dataDir}/olaf.db`);
  const mig = migrate(db, { backupDir: env.backupDir, now: clock.now() });
  const schemaVersion = latestVersion();
  const on = SCHEMA5_FEATURES.filter((k) => cfg.features?.[k]);
  if (on.length && !db.prepare("SELECT 1 FROM sqlite_master WHERE name = 'reactions'").get()) {
    db.close();
    throw new ConfigError(`features ${on.join(', ')} 은(는) 스키마 005 가 필요합니다 (결정 B8·B9 후 005_optional.sql 포함)`);
  }

  const settings = createSettings(cfg, env.configFile);
  const audit = makeAudit(db, clock);
  if (mig.to !== mig.from) audit('SYSTEM', 'migrate', `v${mig.from}->v${mig.to}`);
  // hooks: 뒤 단계·확장 모듈이 기존 응답에 칸을 붙이거나 저장 뒤 동작을 더하는 지점 (docs/02 7-1절)
  const hooks = { me: [], stats: [], postSaved: [], postListItem: [], postDetail: [], spaceItem: [], qcardItem: [], postsList: [] };
  const deps = { env, settings, db, secrets, clock, audit, schemaVersion, apiRoutes, hooks };
  seed(deps);
  const app = createApp(deps);
  return { app, deps, migration: mig, secretsCreated: secrets.created };
}
