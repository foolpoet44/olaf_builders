#!/usr/bin/env node
// 사무국 명령줄 도구 (FR-ADM-01~08) — 라우트를 거치지 않고 domain + repo 를 직접 쓴다.
//
//   node tools/admin.js bootstrap OP-01 --name "사무국"
//   node tools/admin.js import-roster <명단.csv> --actor OP-01 [--dry-run]
//   node tools/admin.js issue <person_id> --actor OP-01
//   node tools/admin.js issue-all --role builder --out <파일> --actor OP-01
//   node tools/admin.js revoke <person_id> --actor OP-01
//   node tools/admin.js deactivate <person_id> --actor OP-01
//   node tools/admin.js list
//
// 환경변수는 서비스와 같은 APP_DATA_DIR · APP_CONFIG_FILE 을 쓴다 (서비스 실행 중에도 안전 — WAL).
import fs from 'node:fs';
import path from 'node:path';
import { resolveEnv, loadConfig } from '../src/config.js';
import { openDb, migrate, tx } from '../src/db.js';
import { loadOrCreateSecrets } from '../src/secrets.js';
import { makeAudit } from '../src/repo/audit.js';
import { getPerson, listPeople, upsertPerson, issueCode, revokeCodes, deactivate, countOffice } from '../src/repo/people.js';
import { parseRosterCsv } from '../src/domain/roster.js';
import { formatCode } from '../src/auth.js';
import { systemClock, isoNow } from '../src/lib/clock.js';
import { inviteText } from '../src/domain/invite.js';

export function openContext(env, { clock = systemClock, dbFile } = {}) {
  const cfg = loadConfig({ configFile: env.configFile });
  for (const d of [env.dataDir, env.configDir, env.backupDir]) fs.mkdirSync(d, { recursive: true });
  const secrets = loadOrCreateSecrets(env.configDir, clock.now());
  const db = openDb(dbFile ?? path.join(env.dataDir, 'olaf.db'));
  migrate(db, { backupDir: env.backupDir, now: clock.now() });
  return { cfg, secrets, db, clock, audit: makeAudit(db, clock) };
}

class UsageError extends Error {}

function parseArgs(argv) {
  const pos = [];
  const flags = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const k = a.slice(2);
      if (['dry-run'].includes(k)) flags[k] = true;
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

/** 명령 실행. out(line) 으로 출력. 종료 코드 반환 (0 성공 · 1 검증 실패 · 2 사용법) */
export function run(ctx, argv, out = console.log) {
  const { pos, flags } = parseArgs(argv);
  const [cmd, arg] = pos;
  const { db, cfg, clock, audit } = ctx;
  const key = ctx.secrets.sessionKey;
  try {
    switch (cmd) {
      case 'bootstrap': {
        if (!arg || !new RegExp(cfg.roles.office.idPattern).test(arg)) throw new UsageError('사무국 ID 형식 (예: OP-01)');
        if (countOffice(db) > 0) { out('[멈춤] 이미 사무국 계정이 있습니다 — issue 명령으로 코드를 재발급하세요'); return 1; }
        const name = flags.name || '사무국';
        const now = isoNow(clock);
        const code = tx(db, () => {
          upsertPerson(db, { id: arg, role: 'office', name, title: '' }, now);
          audit(arg, 'roster_import', 'bootstrap');
          const c = issueCode(db, { personId: arg, actor: arg, key, clock });
          audit(arg, 'code_issue', arg);
          return c;
        });
        out(`사무국 계정 ${arg} 를 만들었습니다. 접속 코드 (이 화면에서만 보입니다):`);
        out(`  ${formatCode(code)}`);
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
      case 'issue': {
        const actor = needActor(ctx, flags);
        const p = getPerson(db, arg ?? '');
        if (!p) throw new UsageError(`없는 사람: ${arg}`);
        if (!p.active) throw new UsageError('비활성 사용자입니다');
        const code = formatCode(issueCode(db, { personId: p.id, actor, key, clock }));
        audit(actor, 'code_issue', p.id);
        out(`${p.id} ${p.name} 접속 코드 (이 화면에서만 보입니다): ${code}`);
        if (cfg.features?.inviteText) { out('--- 안내 문안 (복사용 · 발송은 사람이) ---'); out(inviteText(cfg, p, code)); }
        return 0;
      }
      case 'issue-all': {
        const actor = needActor(ctx, flags);
        const role = flags.role;
        if (!['builder', 'master', 'office'].includes(role)) throw new UsageError('--role builder|master|office');
        if (!flags.out) throw new UsageError('--out <결과 파일> 이 필요합니다');
        const outFile = path.resolve(flags.out);
        if (fs.existsSync(outFile)) throw new UsageError('결과 파일이 이미 있습니다 (덮어쓰지 않습니다)');
        const targets = listPeople(db).filter((p) => p.role === role && p.active);
        const lines = ['person_id,name,code'];
        tx(db, () => {
          for (const p of targets) {
            const c = formatCode(issueCode(db, { personId: p.id, actor, key, clock }));
            lines.push(`${p.id},"${p.name.replace(/"/g, '""')}",${c}`);
          }
          audit(actor, 'code_issue', `issue-all ${role}`, `${targets.length}`);
        });
        fs.writeFileSync(outFile, '\uFEFF' + lines.join('\r\n') + '\r\n', { encoding: 'utf8', flag: 'wx' });
        out(`[완료] ${targets.length}명 코드 발급 → ${outFile}`);
        out('[주의] 이 파일에는 접속 코드가 들어 있습니다. 전달 후 안전하게 지우고, 공유 폴더·메일 첨부로 돌리지 마세요.');
        return 0;
      }
      case 'revoke': {
        const actor = needActor(ctx, flags);
        if (!getPerson(db, arg ?? '')) throw new UsageError(`없는 사람: ${arg}`);
        const n = revokeCodes(db, arg, isoNow(clock));
        audit(actor, 'code_revoke', arg);
        out(`[완료] ${arg} 코드 ${n}개 폐기`);
        return 0;
      }
      case 'deactivate': {
        const actor = needActor(ctx, flags);
        if (!getPerson(db, arg ?? '')) throw new UsageError(`없는 사람: ${arg}`);
        if (arg === actor) throw new UsageError('자기 자신은 비활성화할 수 없습니다');
        deactivate(db, arg, isoNow(clock));
        audit(actor, 'person_deactivate', arg);
        out(`[완료] ${arg} 비활성화 · 코드 폐기 · 세션 종료`);
        return 0;
      }
      case 'list': {
        out('id\trole\tname\ttitle\tlab\tgroup\tactive\tcode\tlast_login');
        for (const p of listPeople(db)) {
          out([p.id, p.role, p.name, p.title, p.lab ?? '', p.grp ?? '', p.active ? 'Y' : 'N', p.hasCode ? 'Y' : '-', p.lastLoginDay ?? ''].join('\t'));
        }
        return 0;
      }
      default:
        throw new UsageError('명령: bootstrap | import-roster | issue | issue-all | revoke | deactivate | list');
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
