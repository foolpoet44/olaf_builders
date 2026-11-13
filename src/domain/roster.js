// 명단 CSV 검사 (FR-ADM-02·03) — HTTP·DB 모름
import { findPersonalInfo } from './privacy.js';

/** RFC4180 CSV 파서 (따옴표·쉼표·줄바꿈). BOM 제거. */
export function parseCsv(text) {
  const s = String(text).replace(/^\uFEFF/, '');
  const rows = [];
  let row = [];
  let field = '';
  let q = false;
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (q) {
      if (ch === '"') {
        if (s[i + 1] === '"') { field += '"'; i++; } else q = false;
      } else field += ch;
    } else if (ch === '"') q = true;
    else if (ch === ',') { row.push(field); field = ''; }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && s[i + 1] === '\n') i++;
      row.push(field); rows.push(row); row = []; field = '';
    } else field += ch;
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row); }
  return rows.filter((r) => r.some((c) => c.trim() !== ''));
}

/**
 * @returns {{people: object[], problems: string[], dropped: string[]}}
 * problems 가 하나라도 있으면 아무것도 저장하지 않는다 (호출자 책임).
 */
export function parseRosterCsv(text, cfg) {
  const R = cfg.roster;
  const problems = [];
  const rows = parseCsv(text);
  if (!rows.length) return { people: [], problems: ['명단 파일이 비어 있습니다'], dropped: [] };
  const header = rows[0].map((h) => h.trim().toLowerCase());
  const drop = new Set(R.dropColumns.map((c) => c.toLowerCase()));
  const forbidden = new Set(R.forbiddenColumns.map((c) => c.toLowerCase()));
  const allowed = new Set([...R.requiredColumns, ...R.optionalColumns]);

  const dropped = header.filter((h) => drop.has(h));
  const bad = header.filter((h) => forbidden.has(h));
  if (bad.length) problems.push(`진단 값 열이 있어 가져오기를 멈춥니다: ${bad.join(', ')}`);
  const unknown = header.filter((h) => !drop.has(h) && !forbidden.has(h) && !allowed.has(h));
  if (unknown.length) problems.push(`알 수 없는 열: ${unknown.join(', ')}`);
  const missing = R.requiredColumns.filter((c) => !header.includes(c));
  if (missing.length) problems.push(`필수 열이 없습니다: ${missing.join(', ')}`);
  if (problems.length) return { people: [], problems, dropped };

  const idx = Object.fromEntries(header.map((h, i) => [h, i]));
  const labs = new Map(cfg.labs.map((l) => [l.code, new Set(l.groups)]));
  const allGroups = new Set(cfg.labs.flatMap((l) => l.groups));
  const idRe = Object.fromEntries(Object.entries(cfg.roles).map(([r, v]) => [r, new RegExp(v.idPattern)]));
  const seen = new Set();
  const people = [];

  rows.slice(1).forEach((r, n) => {
    const line = n + 2;
    const get = (c) => (idx[c] === undefined ? '' : String(r[idx[c]] ?? '').trim());
    // 버리는 열(사번·이메일)은 읽지 않는다. 남은 칸만 개인정보 패턴 검사
    const kept = header.map((h, i) => (drop.has(h) ? '' : String(r[i] ?? '')));
    if (kept.some((v) => findPersonalInfo(v, cfg.privacy).includes('employee_id'))) {
      problems.push(`${line}행: 사번으로 보이는 6~7자리 숫자가 있습니다`);
    }
    if (kept.some((v) => findPersonalInfo(v, cfg.privacy).includes('email'))) {
      problems.push(`${line}행: 이메일은 저장하지 않습니다 — 이메일 열 밖에 주소가 있습니다`);
    }
    const p = {
      id: get('person_id'), role: get('role'), name: get('name'), title: get('title'),
      lab: get('lab') || null, grp: get('group') || null,
      assigned: get('assigned') ? get('assigned').split(';').map((x) => x.trim()).filter(Boolean) : [],
      challenge: get('challenge') || null,
    };
    if (!['builder', 'master', 'office'].includes(p.role)) { problems.push(`${line}행: 역할은 builder·master·office 중 하나`); return; }
    if (!idRe[p.role].test(p.id)) problems.push(`${line}행: ${p.role} ID 형식이 아닙니다`);
    if (seen.has(p.id)) problems.push(`${line}행: 중복 ID`);
    seen.add(p.id);
    if (p.name.length < 1 || p.name.length > 20) problems.push(`${line}행: 성명은 1~20자`);
    if (p.title.length > 20) problems.push(`${line}행: 직위는 20자까지`);
    if (p.role === 'builder') {
      if (!labs.has(p.lab)) problems.push(`${line}행: 알 수 없는 Lab`);
      else if (!labs.get(p.lab).has(p.grp)) problems.push(`${line}행: 그 Lab 의 그룹이 아닙니다`);
      if (p.challenge && p.challenge.length > 100) problems.push(`${line}행: 과제명은 100자까지`);
    } else {
      if (p.lab && !labs.has(p.lab)) problems.push(`${line}행: 알 수 없는 Lab`);
      if (p.grp && !allGroups.has(p.grp)) problems.push(`${line}행: 알 수 없는 그룹`);
    }
    if (p.role === 'master') {
      for (const a of p.assigned) if (!labs.has(a) && !allGroups.has(a)) problems.push(`${line}행: 담당 범위 코드를 알 수 없습니다`);
    } else p.assigned = [];
    people.push(p);
  });
  return { people, problems, dropped };
}
