import { parseCsv } from './roster.js';
import { privacyProblems } from './privacy.js';
import { composeSentence, readSeconds } from './qcard.js';

export function parseWrappedCsv(text) {
  const outer = parseCsv(text);
  if (outer.length && outer.every((row) => row.length === 1)) {
    return parseCsv(outer.map((row) => row[0]).join('\n'));
  }
  return outer;
}

function table(rows) {
  if (!rows.length) return { items: [], problems: ['CSV 파일이 비어 있습니다'] };
  const header = rows[0].map((value) => value.trim().toLowerCase());
  return {
    items: rows.slice(1).map((row) => Object.fromEntries(header.map((key, index) => [key, row[index] ?? '']))),
    problems: [],
  };
}

function groupFromCaseId(caseId) {
  const match = /^T-([A-Z]{2,4})-(\d+)-\d+$/.exec(caseId);
  if (!match) return null;
  return { lab: match[1], grp: `${match[1]}-${Number(match[2])}` };
}

export function parseLegacyQcardsCsv(text, cfg) {
  const parsed = table(parseWrappedCsv(text));
  const problems = [...parsed.problems];
  const people = new Map();
  const cards = [];
  for (const [index, row] of parsed.items.entries()) {
    let payload;
    try {
      payload = JSON.parse(row.value);
    } catch {
      problems.push(`${index + 2}행: Value가 JSON 형식이 아닙니다`);
      continue;
    }
    const source = payload?.card;
    const personId = String(source?.case_id ?? '').trim();
    const scope = groupFromCaseId(personId);
    const session = String(source?.session ?? '').trim();
    const sourceId = String(source?.card_uid ?? '').trim();
    if (!sourceId) problems.push(`${index + 2}행: card_uid가 없습니다`);
    if (!scope) problems.push(`${index + 2}행: case_id 형식이 올바르지 않습니다`);
    if (!cfg.sessions.some((item) => item.code === session)) problems.push(`${index + 2}행: 알 수 없는 세션 ${session}`);
    if (scope && !cfg.labs.some((lab) => lab.code === scope.lab && lab.groups.includes(scope.grp))) {
      problems.push(`${index + 2}행: 알 수 없는 Lab/그룹 ${scope.lab}/${scope.grp}`);
    }
    if (!scope || !sourceId) continue;
    const format = source.question_format === 'free' ? 'free' : 'template';
    const card = {
      sourceId,
      authorId: personId,
      session,
      status: ['registered', 'selected', 'asked', 'followup', 'withdrawn'].includes(source.status) ? source.status : 'registered',
      createdAt: String(source.written_at ?? payload.received_at ?? '').trim(),
      format,
      situation: format === 'template' ? String(source.situation ?? '').trim() : '',
      constraint: format === 'template' ? String(source.constraint ?? '').trim() : '',
      ask: String(source.ask ?? '').trim(),
    };
    if (!card.createdAt || Number.isNaN(Date.parse(card.createdAt))) problems.push(`${index + 2}행: 작성 시각이 올바르지 않습니다`);
    if (!card.ask) problems.push(`${index + 2}행: 질문 내용이 없습니다`);
    for (const problem of privacyProblems([card.situation, card.constraint, card.ask], cfg.privacy)) {
      problems.push(`${index + 2}행: ${problem}`);
    }
    const person = {
      id: personId,
      role: 'builder',
      name: String(source.writer_name ?? '').trim(),
      title: String(source.writer_title ?? '').trim(),
      lab: scope.lab,
      grp: scope.grp,
      assigned: [],
      challenge: null,
    };
    if (!person.name) problems.push(`${index + 2}행: 작성자 이름이 없습니다`);
    const previous = people.get(person.id);
    if (previous && JSON.stringify(previous) !== JSON.stringify(person)) problems.push(`${index + 2}행: 작성자 정보가 앞 행과 다릅니다 (${person.id})`);
    else people.set(person.id, person);
    card.sentence = composeSentence(card, cfg.qcards, null);
    card.seconds = readSeconds(card.sentence, cfg.qcards);
    cards.push(card);
  }
  if (new Set(cards.map((card) => card.sourceId)).size !== cards.length) problems.push('card_uid가 중복되었습니다');
  return { people: [...people.values()], cards, problems };
}

export function parseLegacyAuditCsv(text) {
  const parsed = table(parseWrappedCsv(text));
  const problems = [...parsed.problems];
  const entries = parsed.items.map((row, index) => {
    const entry = {
      sourceId: String(row.id ?? '').trim(),
      at: String(row.at ?? '').trim(),
      actor: String(row.actor_id ?? '').trim(),
      action: String(row.action ?? '').trim(),
      target: String(row.target ?? '').trim(),
      result: String(row.result ?? 'ok').trim() || 'ok',
      sourceHash: String(row.source_hash ?? '').trim(),
    };
    if (!entry.sourceId || !entry.at || !entry.actor || !entry.action) problems.push(`${index + 2}행: 필수 감사 필드가 없습니다`);
    if (entry.at && Number.isNaN(Date.parse(entry.at))) problems.push(`${index + 2}행: 감사 시각이 올바르지 않습니다`);
    return entry;
  });
  return { entries, problems };
}

export function snapshotLegacyContent(parsed) {
  return {
    formatVersion: 1,
    people: parsed.people,
    qcards: parsed.cards,
    audit: parsed.entries,
  };
}

export function parseLegacySnapshot(text, cfg) {
  let value;
  try {
    value = JSON.parse(String(text).replace(/^\uFEFF/, ''));
  } catch {
    return { people: [], cards: [], entries: [], problems: ['스냅샷 JSON 형식이 올바르지 않습니다'] };
  }
  const problems = [];
  if (value?.formatVersion !== 1) problems.push('지원하지 않는 스냅샷 버전입니다');
  for (const key of ['people', 'qcards', 'audit']) if (!Array.isArray(value?.[key])) problems.push(`${key} 배열이 없습니다`);
  if (problems.length) return { people: [], cards: [], entries: [], problems };
  const people = value.people.map((person) => ({ ...person, assigned: Array.isArray(person.assigned) ? person.assigned : [] }));
  const peopleById = new Map(people.map((person) => [person.id, person]));
  for (const person of people) {
    const lab = cfg.labs.find((item) => item.code === person.lab);
    if (!person.id || person.role !== 'builder' || !person.name || !lab?.groups.includes(person.grp)) {
      problems.push(`작성자 정보가 올바르지 않습니다: ${person.id ?? '(없음)'}`);
    }
  }
  const cards = value.qcards.map((card) => ({ ...card }));
  for (const card of cards) {
    if (!card.sourceId || !peopleById.has(card.authorId) || !cfg.sessions.some((item) => item.code === card.session) || !card.ask) {
      problems.push(`질문 카드 정보가 올바르지 않습니다: ${card.sourceId ?? '(없음)'}`);
    }
    for (const problem of privacyProblems([card.situation, card.constraint, card.ask], cfg.privacy)) {
      problems.push(`${card.sourceId}: ${problem}`);
    }
  }
  if (new Set(cards.map((card) => card.sourceId)).size !== cards.length) problems.push('card_uid가 중복되었습니다');
  const entries = value.audit.map((entry) => ({ ...entry }));
  for (const entry of entries) {
    if (!entry.sourceId || !entry.at || !entry.actor || !entry.action || Number.isNaN(Date.parse(entry.at))) {
      problems.push(`감사 기록이 올바르지 않습니다: ${entry.sourceId ?? '(없음)'}`);
    }
  }
  return { people, cards, entries, problems };
}
