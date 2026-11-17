// 설정 읽기 · 병합 · 검증 (docs/07_CONFIG.md)
// 층: config/app.json (릴리스) → APP_CONFIG_FILE (운영 덮어쓰기) → 환경변수
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const PROTECTED_PORTS = [80, 443, 1234, 3389, 8080, 8081];
export const OVERRIDE_KEYS = [
  'configVersion', 'qcards', 'auth', 'backup', 'logs', 'materials', 'visibility', 'sessions', 'brand', 'meta',
  'site', 'features', 'events', 'directory', 'qcardAnswer', 'notifications', 'digest', 'tags',
  'moderation', 'surveys',
];
export const FEATURE_KEYS = [
  'templates', 'directory', 'pin', 'accept', 'qcardAnswer', 'notifications', 'events', 'digest',
  'materialThreads', 'bookmarks', 'tags', 'reports', 'helpful', 'surveys',
];
// 이 기능들은 004 스키마가 필요하다
export const SCHEMA5_FEATURES = ['helpful', 'surveys'];

export class ConfigError extends Error {}

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

export function deepMerge(base, over) {
  if (!isObj(base) || !isObj(over)) return over;
  const out = { ...base };
  for (const [k, v] of Object.entries(over)) out[k] = isObj(v) && isObj(base[k]) ? deepMerge(base[k], v) : v;
  return out;
}

function deepFreeze(o) {
  if (o && typeof o === 'object' && !Object.isFrozen(o)) {
    Object.freeze(o);
    for (const v of Object.values(o)) deepFreeze(v);
  }
  return o;
}

function readJson(file, label) {
  let text;
  try {
    text = fs.readFileSync(file, 'utf8');
  } catch (e) {
    if (e.code === 'ENOENT') return undefined;
    throw new ConfigError(`${label}: 읽을 수 없음 (${e.code})`);
  }
  try {
    return JSON.parse(text.replace(/^\uFEFF/, ''));
  } catch {
    throw new ConfigError(`${label}: JSON 형식 오류`);
  }
}

/** 설정 객체 검증. 문제가 있으면 키 경로만 담은 ConfigError. */
export function validateConfig(c) {
  const p = [];
  const need = (cond, msg) => { if (!cond) p.push(msg); };
  const int = (v, lo, hi) => Number.isInteger(v) && v >= lo && v <= hi;
  const re = (s) => { try { new RegExp(s); return true; } catch { return false; } };

  need(/^[a-z][a-z0-9-]{2,40}$/.test(c.appId ?? ''), 'appId must match ^[a-z][a-z0-9-]{2,40}$');
  need(Array.isArray(c.labs) && c.labs.length > 0, 'labs must be non-empty array');
  const labCodes = new Set();
  const groups = new Set();
  for (const l of c.labs ?? []) {
    need(/^[A-Z]{2,4}$/.test(l.code ?? ''), `labs[${l.code}].code must be 2-4 uppercase letters`);
    need(!labCodes.has(l.code), `labs code duplicated: ${l.code}`);
    labCodes.add(l.code);
    for (const g of l.groups ?? []) { need(!groups.has(g), `labs group duplicated: ${g}`); groups.add(g); }
  }
  for (const [r, v] of Object.entries(c.roles ?? {})) need(re(v.idPattern), `roles.${r}.idPattern must compile`);
  need(['builder', 'master', 'office'].every((r) => c.roles?.[r]), 'roles must define builder, master, office');
  need(['lab', 'group', 'all'].includes(c.roles?.master?.scope), 'roles.master.scope must be lab|group|all');
  for (const k of ['employeeIdPattern', 'emailPattern', 'phonePattern']) need(re(c.privacy?.[k]), `privacy.${k} must compile`);

  const RULES = ['all', 'lab', 'group', 'lab_scope', 'operator'];
  const spaceCodes = new Set();
  for (const s of c.spaces ?? []) {
    need(['none', 'lab', 'group'].includes(s.per), `spaces[${s.code}].per must be none|lab|group`);
    need(RULES.includes(s.read) && RULES.includes(s.write), `spaces[${s.code}].read/write invalid`);
    need(!s.template || (Array.isArray(s.template) && s.template.length <= 8), `spaces[${s.code}].template must be array <= 8`);
    need(!s.feature || FEATURE_KEYS.includes(s.feature), `spaces[${s.code}].feature unknown`);
    spaceCodes.add(s.code);
  }

  const q = c.qcards ?? {};
  for (const f of ['situation', 'constraint', 'ask']) {
    need(int(q.template?.minChars?.[f], 0, 1000) && int(q.template?.maxChars?.[f], 1, 1000)
      && q.template.minChars[f] <= q.template.maxChars[f], `qcards.template.min/maxChars.${f} invalid`);
  }
  need(int(q.free?.minChars, 0, 1000) && int(q.free?.maxChars, 1, 1000) && q.free.minChars <= q.free.maxChars, 'qcards.free.min/maxChars invalid');
  need(int(q.readAloudSeconds, 10, 120), 'qcards.readAloudSeconds must be integer 10..120');
  need(int(q.charsPerSecond, 1, 20), 'qcards.charsPerSecond must be integer 1..20');
  need(typeof q.closed === 'boolean', 'qcards.closed must be boolean');

  const sessionCodes = new Set();
  for (const s of c.sessions ?? []) {
    need(!sessionCodes.has(s.code), `sessions code duplicated: ${s.code}`);
    sessionCodes.add(s.code);
    need(!s.leadLab || labCodes.has(s.leadLab), `sessions[${s.code}].leadLab unknown`);
  }
  need(int(c.auth?.sessionHours, 1, 24), 'auth.sessionHours must be 1..24');
  need(int(c.auth?.officeSessionHours, 1, 12), 'auth.officeSessionHours must be 1..12');
  for (const [role, pol] of Object.entries(c.auth?.password ?? {})) {
    need(role === 'default' || ['builder', 'master', 'office'].includes(role), `auth.password.${role} unknown`);
    need(int(pol?.minLength, 6, 64), `auth.password.${role}.minLength must be 6..64`);
    need(typeof pol?.requireMixedClasses === 'boolean', `auth.password.${role}.requireMixedClasses must be boolean`);
  }
  need(int(c.backup?.hourLocal, 0, 23), 'backup.hourLocal must be 0..23');
  need(int(c.backup?.keep, 1, 90), 'backup.keep must be 1..90');

  // 확장 (docs/13)
  for (const [k, v] of Object.entries(c.features ?? {})) {
    need(FEATURE_KEYS.includes(k), `features.${k} unknown`);
    need(typeof v === 'boolean', `features.${k} must be boolean`);
  }
  const url = c.site?.publicBaseUrl;
  need(url == null || /^https?:\/\//.test(url), 'site.publicBaseUrl must be null or http(s) URL');
  for (const e of c.events ?? []) {
    need(/^\d{4}-\d{2}-\d{2}$/.test(e.date ?? ''), 'events[].date must be YYYY-MM-DD');
    need(['launch', 'lab', 'session', 'review', 'demo', 'other'].includes(e.kind), 'events[].kind invalid');
  }
  if (c.tags) {
    const all = [...(c.labs ?? []).flatMap((l) => l.keywords ?? []), ...(c.tags.extra ?? [])];
    need(new Set(all).size === all.length, 'tags must be unique across labs[].keywords and tags.extra');
    need(int(c.tags.maxPerPost, 1, 10), 'tags.maxPerPost must be 1..10');
  }
  if (c.moderation) {
    need((c.moderation.immediateHideReasons ?? []).every((r) => (c.posts?.hideReasons ?? []).includes(r)),
      'moderation.immediateHideReasons must be subset of posts.hideReasons');
  }
  if (c.qcardAnswer) {
    const sp = (c.spaces ?? []).find((s) => s.code === c.qcardAnswer.space);
    need(sp && sp.per === 'none', 'qcardAnswer.space must be a per:none space');
  }
  if (p.length) throw new ConfigError(`설정 검증 실패:\n - ${p.join('\n - ')}`);
  return c;
}

/** 환경변수 → 실행 경로·포트. 운영 모드 필수값 검사 포함. */
export function resolveEnv(env = process.env) {
  const prod = env.NODE_ENV === 'production';
  const missing = ['APP_DATA_DIR', 'APP_UPLOAD_DIR', 'APP_CONFIG_FILE', 'APP_RELEASE'].filter((k) => !env[k]);
  if (prod && missing.length) throw new ConfigError(`운영 모드 필수 환경변수 없음: ${missing.join(', ')}`);
  const port = env.PORT ? Number(env.PORT) : 8091;
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new ConfigError('PORT 값 오류');
  if (PROTECTED_PORTS.includes(port)) throw new ConfigError(`보호 포트 사용 금지: ${port}`);
  const local = path.join(ROOT, '.local');
  const dataDir = path.resolve(env.APP_DATA_DIR || path.join(local, 'data'));
  const configFile = path.resolve(env.APP_CONFIG_FILE || path.join(local, 'config', 'app-settings.json'));
  return {
    production: prod,
    port,
    host: env.HOST || '127.0.0.1',
    dataDir,
    uploadDir: path.resolve(env.APP_UPLOAD_DIR || path.join(local, 'uploads')),
    configFile,
    configDir: path.dirname(configFile),
    backupDir: path.resolve(env.APP_BACKUP_DIR || path.join(dataDir, '..', 'backups')),
    logDir: path.resolve(env.APP_LOG_DIR || path.join(dataDir, '..', 'logs')),
    release: env.APP_RELEASE || 'dev',
    trustProxy: env.TRUST_PROXY === '1',
  };
}

/** app.json + 덮어쓰기 파일을 읽어 병합·검증한 설정 (얼리지 않음 — 런타임 설정 저장소가 감싼다). */
export function loadConfig({ configFile, baseFile = path.join(ROOT, 'config', 'app.json') } = {}) {
  const base = readJson(baseFile, 'config/app.json');
  if (base === undefined) throw new ConfigError('config/app.json 없음');
  let merged = base;
  if (configFile) {
    const over = readJson(configFile, 'APP_CONFIG_FILE');
    if (over !== undefined) {
      if (!isObj(over)) throw new ConfigError('APP_CONFIG_FILE: 최상위는 객체여야 함');
      const bad = Object.keys(over).filter((k) => !OVERRIDE_KEYS.includes(k));
      if (bad.length) throw new ConfigError(`APP_CONFIG_FILE: 허용되지 않은 키: ${bad.join(', ')}`);
      merged = deepMerge(base, over);
    }
  }
  return validateConfig(merged);
}

/**
 * 런타임 설정 저장소. 대부분은 얼린 설정을 읽고, 사무국 화면이 바꾸는 값(qcards.closed)만
 * 덮어쓰기 파일에 원자적으로 다시 쓴다.
 */
export function createSettings(cfg, configFile) {
  let current = deepFreeze(structuredClone(cfg));
  return {
    get cfg() { return current; },
    feature(key) { return current.features?.[key] === true; },
    features() {
      return Object.fromEntries(FEATURE_KEYS.map((k) => [k, current.features?.[k] === true]));
    },
    setQcardsClosed(closed) {
      const over = (configFile && readJson(configFile, 'APP_CONFIG_FILE')) || {};
      over.qcards = { ...(over.qcards || {}), closed: !!closed };
      if (configFile) {
        fs.mkdirSync(path.dirname(configFile), { recursive: true });
        const tmp = `${configFile}.${process.pid}.tmp`;
        fs.writeFileSync(tmp, JSON.stringify(over, null, 2) + '\n', 'utf8');
        fs.renameSync(tmp, configFile);
      }
      current = deepFreeze(deepMerge(structuredClone(current), { qcards: { closed: !!closed } }));
    },
  };
}
