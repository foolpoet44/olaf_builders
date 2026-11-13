// 테스트용 가짜 사람·코드 시드
import fs from 'node:fs';
import { loadConfig } from '../src/config.js';
import { parseRosterCsv } from '../src/domain/roster.js';
import { upsertPerson, issueCode } from '../src/repo/people.js';
import { formatCode } from '../src/auth.js';
import { client } from './helpers.js';

const ROSTER = fs.readFileSync(new URL('./fixtures/roster_ok.csv', import.meta.url), 'utf8');

/** OP-01(사무국) + 명단 6명. 반환: { codes: {id: code}, login(id) → client } */
export function seedPeople(t) {
  const cfg = loadConfig({});
  const now = '2026-11-20T01:00:00Z';
  upsertPerson(t.db, { id: 'OP-01', role: 'office', name: '운영자', title: '' }, now);
  for (const p of parseRosterCsv(ROSTER, cfg).people) upsertPerson(t.db, p, now);
  const codes = {};
  for (const id of ['OP-01', 'OP-02', 'TEST-001', 'TEST-002', 'TEST-003', 'TEST-004', 'MS-01']) {
    codes[id] = formatCode(issueCode(t.db, { personId: id, actor: 'OP-01', key: t.deps.secrets.sessionKey, clock: t.clock }));
  }
  const login = async (id) => {
    const c = client(t.base);
    const r = await c.post('/api/auth/login', { code: codes[id] });
    if (r.status !== 200) throw new Error(`login ${id} failed ${r.status}`);
    return c;
  };
  return { codes, login };
}
