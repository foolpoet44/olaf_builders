#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { resolveEnv } from '../src/config.js';
import { tx } from '../src/db.js';
import { parseLegacyQcardsCsv, parseLegacyAuditCsv, parseLegacySnapshot, snapshotLegacyContent } from '../src/domain/legacy.js';
import { composeSentence, readSeconds } from '../src/domain/qcard.js';
import { seedSessions } from '../src/repo/qcards.js';
import { upsertPerson, getPerson } from '../src/repo/people.js';
import { isoNow } from '../src/lib/clock.js';
import { openContext } from './admin.js';

function parseArgs(argv) {
  const positional = [];
  const flags = {};
  for (let index = 0; index < argv.length; index++) {
    const value = argv[index];
    if (value.startsWith('--')) {
      const key = value.slice(2);
      if (key === 'dry-run') flags[key] = true;
      else flags[key] = argv[++index];
    } else positional.push(value);
  }
  return { positional, flags };
}

function usage(message) {
  if (message) console.error(`[사용법] ${message}`);
  console.error('node tools/import-legacy.js all <qcards.csv> <audit.csv> --actor OP-01 [--dry-run] [--snapshot <json>]');
  console.error('node tools/import-legacy.js snapshot <legacy-content.json> --actor OP-01 [--dry-run]');
  return 2;
}

function insertContent(ctx, parsed, actor) {
  const { db, cfg, clock, audit } = ctx;
  const now = isoNow(clock);
  const counts = { peopleAdded: 0, peopleUpdated: 0, cardsAdded: 0, cardsSkipped: 0, auditAdded: 0, auditSkipped: 0 };
  seedSessions(db, cfg.sessions);
  for (const person of parsed.people) {
    const result = upsertPerson(db, person, now);
    if (result === 'added') counts.peopleAdded++;
    else if (result !== 'same') counts.peopleUpdated++;
  }
  const sourceExists = db.prepare("SELECT 1 FROM audit_log WHERE action = 'import_legacy_card' AND target = ?");
  const addCard = db.prepare("INSERT INTO qcards(author_id,session,lab,grp,status,created_at,updated_at) VALUES(?,?,?,?,?,?,?)");
  const addVersion = db.prepare("INSERT INTO qcard_versions(card_id,ver,format,situation,constraint_,ask,sentence,seconds,created_at,editor_id) VALUES(?,1,?,?,?,?,?,?,?,?)");
  for (const card of parsed.cards) {
    if (sourceExists.get(card.sourceId)) { counts.cardsSkipped++; continue; }
    const person = getPerson(db, card.authorId);
    const sentence = composeSentence(card, cfg.qcards, person?.challenge);
    const seconds = readSeconds(sentence, cfg.qcards);
    const result = addCard.run(card.authorId, card.session, person.lab, person.grp, card.status, card.createdAt, card.createdAt);
    addVersion.run(Number(result.lastInsertRowid), card.format, card.situation || null, card.constraint || null, card.ask, sentence, seconds, card.createdAt, card.authorId);
    audit(actor, 'import_legacy_card', card.sourceId, `card=${result.lastInsertRowid}`);
    counts.cardsAdded++;
  }
  const auditExists = db.prepare('SELECT 1 FROM audit_log WHERE at=? AND actor=? AND action=? AND target=? AND result=?');
  const addAudit = db.prepare('INSERT INTO audit_log(at,actor,action,target,result) VALUES(?,?,?,?,?)');
  for (const entry of parsed.entries) {
    if (auditExists.get(entry.at, entry.actor, entry.action, entry.target, entry.result)) { counts.auditSkipped++; continue; }
    addAudit.run(entry.at, entry.actor, entry.action, entry.target, entry.result);
    counts.auditAdded++;
  }
  audit(actor, 'import_legacy', 'csv', `people=${parsed.people.length} cards=${counts.cardsAdded} audit=${counts.auditAdded}`);
  return counts;
}

export function run(argv) {
  const { positional, flags } = parseArgs(argv);
  const mode = positional[0];
  if (!((mode === 'all' && positional.length === 3) || (mode === 'snapshot' && positional.length === 2))) return usage();
  if (!flags.actor) return usage('--actor가 필요합니다');
  let input;
  try {
    if (mode === 'all') input = [fs.readFileSync(positional[1], 'utf8'), fs.readFileSync(positional[2], 'utf8')];
    else input = fs.readFileSync(positional[1], 'utf8');
  } catch (error) {
    return usage(`입력 파일을 읽을 수 없습니다: ${error.code}`);
  }
  const ctx = openContext(resolveEnv(process.env));
  try {
    const operator = getPerson(ctx.db, flags.actor);
    if (!operator || !operator.active || operator.role !== 'office') return usage('활성 사무국 --actor가 필요합니다');
    const parsed = mode === 'all'
      ? (() => {
        const qcards = parseLegacyQcardsCsv(input[0], ctx.cfg);
        const audit = parseLegacyAuditCsv(input[1]);
        return { ...qcards, ...audit, problems: [...qcards.problems, ...audit.problems] };
      })()
      : parseLegacySnapshot(input, ctx.cfg);
    const problems = parsed.problems;
    if (problems.length) {
      console.error('[중단] 아무 데이터도 저장하지 않았습니다.');
      for (const problem of problems) console.error(`- ${problem}`);
      return 1;
    }
    if (mode === 'all' && flags.snapshot) {
      const snapshot = `${JSON.stringify(snapshotLegacyContent(parsed), null, 2)}\n`;
      fs.mkdirSync(path.dirname(path.resolve(flags.snapshot)), { recursive: true });
      fs.writeFileSync(flags.snapshot, snapshot, 'utf8');
    }
    let counts;
    if (flags['dry-run']) {
      ctx.db.exec('BEGIN IMMEDIATE');
      try { counts = insertContent(ctx, parsed, flags.actor); } finally { ctx.db.exec('ROLLBACK'); }
    } else counts = tx(ctx.db, () => insertContent(ctx, parsed, flags.actor));
    console.log(JSON.stringify({ dryRun: Boolean(flags['dry-run']), source: { people: parsed.people.length, cards: parsed.cards.length, audit: parsed.entries.length }, ...counts }));
    return 0;
  } finally {
    ctx.db.close();
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'))) {
  process.exitCode = run(process.argv.slice(2));
}
