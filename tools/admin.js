#!/usr/bin/env node
// 사무국 명령줄 도구 (FR-ADM-01~08) — 라우트를 거치지 않고 domain + repo 를 직접 쓴다.
//
//   echo <password> | node tools/admin.js bootstrap OP-01 --name "사무국" --username admin --password-stdin
//   node tools/admin.js import-roster <명단.csv> --actor OP-01 [--dry-run]
//   echo <password> | node tools/admin.js set-credentials <person_id> --username <id> --password-stdin --actor OP-01
//   node tools/admin.js import-credentials <person_id,username,password.csv> --actor OP-01 [--dry-run]
//   node tools/admin.js deactivate <person_id> --actor OP-01
//   node tools/admin.js list
//
// 환경변수는 서비스와 같은 APP_DATA_DIR · APP_CONFIG_FILE 을 쓴다 (서비스 실행 중에도 안전 — WAL).
import fs from 'node:fs';
import path from 'node:path';
import { resolveEnv, loadConfig } from '../src/config.js';
import { openDb, migrate, tx } from '../src/db.js';
import { makeAudit } from '../src/repo/audit.js';
import { getPerson, listPeople, upsertPerson, setCredentials, CredentialError, deactivate, countOffice } from '../src/repo/people.js';
import { parseRosterCsv, parseCsv } from '../src/domain/roster.js';
import { passwordPolicyFor, passwordProblems, normalizeUsername } from '../src/auth.js';
import { systemClock, isoNow } from '../src/lib/clock.js';

export function openContext(env, { clock = systemClock, dbFile } = {}) {
  const cfg = loadConfig({ configFile: env.configFile });
  for (const d of [env.dataDir, env.configDir, env.backupDir]) fs.mkdirSync(d, { recursive: true });
  const db = openDb(dbFile ?? path.join(env.dataDir, 'olaf.db'));
  migrate(db, { backupDir: env.backupDir, now: clock.now() });
  return { cfg, db, clock, audit: makeAudit(db, clock) };
}

class UsageError extends Error {}

function parseArgs(argv) {
  const pos = [];
  const flags = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const k = a.slice(2);
      if (['dry-run', 'password-stdin'].includes(k)) flags[k] = true;
      else { flags[k] = argv[i + 1]; i++; }
    } else pos.push(a);
  }
  return { pos, flags };
}

function needActor(ctx, flags) {
  const a = flags.actor;
  if (!a) throw new UsageError('--actor <사무국 내부번호> 가 필요합니다');
  const p = getPerson(ctx.db, a);
  if (!p || p.role !== 'office' || !p.active) throw new UsageError(`--actor ${a}: 활성 사무국 계정이 아닙니다`);
  return a;
}

function readPassword(flags, readSecret) {
  if (!flags['password-stdin']) throw new UsageError('--password-stdin 이 필요합니다');
  const password = String(readSecret()).replace(/\r?\n$/, '');
  if (!password) throw new UsageError('표준 입력으로 비밀번호를 전달하세요');
  return password;
}

/** 명령 실행. out(line) 으로 출력. 종료 코드 반환 (0 성공 · 1 검증 실패 · 2 사용법) */
export function run(ctx, argv, out = console.log, readSecret = () => fs.readFileSync(0, 'utf8')) {
  const { pos, flags } = parseArgs(argv);
  const [cmd, arg] = pos;
  const { db, cfg, clock, audit } = ctx;
  try {
    switch (cmd) {
      case 'bootstrap': {
        if (!arg || !new RegExp(cfg.roles.office.idPattern).test(arg)) throw new UsageError('사무국 ID 형식 (예: OP-01)');
        if (countOffice(db) > 0) { out('[멈춤] 이미 사무국 계정이 있습니다 — set-credentials 명령을 사용하세요'); return 1; }
        if (!flags.username) throw new UsageError('--username <로그인 아이디> 가 필요합니다');
        const password = readPassword(flags, readSecret);
        const name = flags.name || '사무국';
        const now = isoNow(clock);
        const username = tx(db, () => {
          upsertPerson(db, { id: arg, role: 'office', name, title: '' }, now);
          audit(arg, 'roster_import', 'bootstrap');
          const value = setCredentials(db, { personId: arg, username: flags.username, password, actor: arg, clock });
          audit(arg, 'credentials_set', arg);
          return value;
        });
        out(`사무국 계정 ${arg} · 로그인 아이디 ${username} 를 만들었습니다.`);
        return 0;
      }
      case 'import-roster': {
        if (!arg) throw new UsageError('명단 CSV 경로가 필요합니다');
        const actor = needActor(ctx, flags);
        let text;
        try { text = fs.readFileSync(arg, 'utf8'); } catch { throw new UsageError(`파일을 읽을 수 없습니다: ${arg}`); }
        const { people, problems, dropped } = parseRosterCsv(text, cfg);
        if (dropped.length) out(`[알림] 저장하지 않고 버린 열: ${dropped.join(', ')}`);
        if (problems.length) {
          out('[멈춤] 아무것도 저장하지 않았습니다:');
          for (const p of problems) out(`  - ${p}`);
          return 1;
        }
        const now = isoNow(clock);
        const counts = { added: 0, updated: 0, same: 0, role_changed: 0 };
        const apply = () => {
          for (const p of people) {
            const r = upsertPerson(db, p, now);
            counts[r]++;
            if (r === 'role_changed') audit(actor, 'permission_change', p.id);
          }
          audit(actor, 'roster_import', `${people.length} rows`, `added=${counts.added} updated=${counts.updated + counts.role_changed}`);
        };
        if (flags['dry-run']) {
          db.exec('BEGIN IMMEDIATE');
          try { apply(); } finally { db.exec('ROLLBACK'); }
          out(`[시험] ${people.length}명 — 추가 ${counts.added} · 갱신 ${counts.updated + counts.role_changed} · 같음 ${counts.same} (저장 안 함)`);
        } else {
          tx(db, apply);
          out(`[완료] ${people.length}명 — 추가 ${counts.added} · 갱신 ${counts.updated + counts.role_changed} · 같음 ${counts.same}`);
        }
        return 0;
      }
      case 'set-credentials': {
        const actor = needActor(ctx, flags);
        const p = getPerson(db, arg ?? '');
        if (!p) throw new UsageError(`없는 사람: ${arg}`);
        if (!p.active) throw new UsageError('비활성 사용자입니다');
        if (!flags.username) throw new UsageError('--username <로그인 아이디> 가 필요합니다');
        const password = readPassword(flags, readSecret);
        try {
          const username = setCredentials(db, { personId: p.id, username: flags.username, password, actor, clock, policy: passwordPolicyFor(cfg, p.role) });
          audit(actor, 'credentials_set', p.id);
          out(`[완료] ${p.id} 로그인 아이디 ${username} 설정 · 기존 세션 종료`);
        } catch (error) {
          if (error instanceof CredentialError) throw new UsageError(error.problems.join(' · '));
          throw error;
        }
        return 0;
      }
      case 'import-credentials': {
        // 여러 명의 로그인 정보를 한 번에 설정한다. CSV 열: person_id,username,password (결정 B12)
        // 하나라도 오류면 아무것도 저장하지 않는다. 비밀번호는 출력·감사 기록에 남기지 않는다.
        if (!arg) throw new UsageError('CSV 경로가 필요합니다 (열: person_id,username,password)');
        const actor = needActor(ctx, flags);
        let text;
        try { text = fs.readFileSync(arg, 'utf8').replace(/^\uFEFF/, ''); } catch { throw new UsageError(`파일을 읽을 수 없습니다: ${arg}`); }
        const rows = parseCsv(text);
        const head = (rows[0] ?? []).map((h) => h.trim());
        const col = Object.fromEntries(['person_id', 'username', 'password'].map((c) => [c, head.indexOf(c)]));
        if (Object.values(col).some((i) => i < 0)) throw new UsageError('열 이름은 person_id,username,password 여야 합니다');
        const problems = [];
        const seenIds = new Set();
        const seenNames = new Map();
        const items = [];
        rows.slice(1).forEach((r, n) => {
          const line = n + 2;
          if (r.every((v) => !String(v ?? '').trim())) return;
          const id = String(r[col.person_id] ?? '').trim();
          const person = getPerson(db, id);
          const name = normalizeUsername(r[col.username]);
          const password = String(r[col.password] ?? '');
          if (!person) { problems.push(`${line}행: 없는 사람 ${id}`); return; }
          if (!person.active) problems.push(`${line}행: 비활성 사용자 ${id}`);
          if (seenIds.has(id)) problems.push(`${line}행: 같은 사람이 두 번 있습니다 ${id}`);
          seenIds.add(id);
          if (!name) problems.push(`${line}행: ${id} 아이디 형식 오류`);
          else {
            if (seenNames.has(name)) problems.push(`${line}행: 아이디가 겹칩니다 (${seenNames.get(name)} 와 ${id})`);
            seenNames.set(name, id);
          }
          for (const m of passwordProblems(password, passwordPolicyFor(cfg, person.role))) problems.push(`${line}행: ${id} ${m}`);
          items.push({ person, username: name, password });
        });
        if (!items.length && !problems.length) problems.push('읽을 행이 없습니다');
        if (problems.length) {
          out('[멈춤] 아무것도 저장하지 않았습니다:');
          for (const p of problems) out(`  - ${p}`);
          return 1;
        }
        const apply = () => {
          for (const it of items) {
            setCredentials(db, { personId: it.person.id, username: it.username, password: it.password, actor, clock, policy: passwordPolicyFor(cfg, it.person.role) });
            audit(actor, 'credentials_set', it.person.id);
          }
          audit(actor, 'credentials_import', `${items.length} rows`);
        };
        try {
          if (flags['dry-run']) {
            db.exec('BEGIN IMMEDIATE');
            try { apply(); } finally { db.exec('ROLLBACK'); }
            out(`[시험] ${items.length}명 로그인 정보 설정 가능 (저장 안 함)`);
          } else {
            tx(db, apply);
            out(`[완료] ${items.length}명 로그인 정보를 설정했습니다 · 기존 세션 종료. CSV 파일은 지금 지우세요`);
          }
        } catch (error) {
          if (error instanceof CredentialError) { out(`[멈춤] ${error.problems.join(' · ')}`); return 1; }
          throw error;
        }
        return 0;
      }
      case 'deactivate': {
        const actor = needActor(ctx, flags);
        if (!getPerson(db, arg ?? '')) throw new UsageError(`없는 사람: ${arg}`);
        if (arg === actor) throw new UsageError('자기 자신은 비활성화할 수 없습니다');
        deactivate(db, arg, isoNow(clock));
        audit(actor, 'person_deactivate', arg);
        out(`[완료] ${arg} 비활성화 · 로그인 정보 삭제 · 세션 종료`);
        return 0;
      }
      case 'list': {
        out('id\trole\tname\ttitle\tlab\tgroup\tactive\tusername\tlast_login');
        for (const p of listPeople(db)) {
          out([p.id, p.role, p.name, p.title, p.lab ?? '', p.grp ?? '', p.active ? 'Y' : 'N', p.username ?? '-', p.lastLoginDay ?? ''].join('\t'));
        }
        return 0;
      }
      default:
        throw new UsageError('명령: bootstrap | import-roster | set-credentials | import-credentials | deactivate | list');
    }
  } catch (e) {
    if (e instanceof UsageError) { out(`[사용법] ${e.message}`); return 2; }
    throw e;
  }
}

// 직접 실행될 때만
if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'))) {
  let code = 1;
  try {
    const ctx = openContext(resolveEnv(process.env));
    code = run(ctx, process.argv.slice(2));
    ctx.db.close();
  } catch (e) {
    console.error(`[오류] ${e.message}`);
    code = 1;
  }
  process.exitCode = code;
}
