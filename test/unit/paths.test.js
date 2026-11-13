import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { safeJoin, PathError } from '../../src/lib/paths.js';

const base = path.resolve('/srv/olaf/uploads');

test('safeJoin 정상 경로', () => {
  assert.equal(safeJoin(base, 'materials', 'abc', 'p001.webp'), path.join(base, 'materials', 'abc', 'p001.webp'));
});

test('safeJoin .. 이탈 거부', () => {
  assert.throws(() => safeJoin(base, '..', 'x'), PathError);
  assert.throws(() => safeJoin(base, 'a/../../x'), PathError);
});

test('safeJoin 절대경로·드라이브 문자·NUL 거부', () => {
  assert.throws(() => safeJoin(base, 'C:\\x'), PathError);
  assert.throws(() => safeJoin(base, '/etc/passwd'), PathError);
  assert.throws(() => safeJoin(base, 'a\0b'), PathError);
});
