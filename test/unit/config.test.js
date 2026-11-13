import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { loadConfig, resolveEnv, deepMerge, ConfigError, createSettings } from '../../src/config.js';
import { tmpDir } from '../helpers.js';

const writeOver = (obj) => {
  const d = tmpDir();
  const f = path.join(d, 'app-settings.json');
  fs.writeFileSync(f, typeof obj === 'string' ? obj : JSON.stringify(obj));
  return f;
};

test('기본 config/app.json 이 검증을 통과한다', () => {
  const c = loadConfig({});
  assert.equal(c.appId, 'olaf-builders');
  assert.equal(c.features.helpful, false);
});

test('FR-SYS-04 덮어쓰기 파일 JSON 오류면 시작 거부', () => {
  assert.throws(() => loadConfig({ configFile: writeOver('{bad') }), ConfigError);
});

test('FR-SYS-04 모르는 최상위 키면 시작 거부', () => {
  assert.throws(() => loadConfig({ configFile: writeOver({ qcardz: {} }) }), /허용되지 않은 키: qcardz/);
});

test('FR-SYS-04 readAloudSeconds 0 이면 시작 거부 (키 경로만 보고)', () => {
  assert.throws(() => loadConfig({ configFile: writeOver({ qcards: { readAloudSeconds: 0 } }) }), /qcards.readAloudSeconds/);
});

test('덮어쓰기 파일이 없으면 기본값으로 동작', () => {
  const c = loadConfig({ configFile: path.join(tmpDir(), 'none.json') });
  assert.equal(c.qcards.closed, false);
});

test('깊은 병합: 객체는 병합, 배열은 교체', () => {
  assert.deepEqual(deepMerge({ a: { x: 1, y: 2 }, l: [1, 2] }, { a: { y: 3 }, l: [9] }), { a: { x: 1, y: 3 }, l: [9] });
});

test('알 수 없는 features 키 거부', () => {
  assert.throws(() => loadConfig({ configFile: writeOver({ features: { chat: true } }) }), /features.chat unknown/);
});

test('invite.template 에 {code} 가 없으면 거부', () => {
  assert.throws(() => loadConfig({ configFile: writeOver({ invite: { template: 'hello' } }) }), /invite.template/);
});

test('운영 모드에서 필수 환경변수 없으면 거부', () => {
  assert.throws(() => resolveEnv({ NODE_ENV: 'production' }), /APP_DATA_DIR/);
});

test('보호 포트 거부 (8080·8081·443 등)', () => {
  for (const p of ['8080', '8081', '443', '3389']) assert.throws(() => resolveEnv({ PORT: p }), /보호 포트/);
  assert.equal(resolveEnv({}).port, 8091);
  assert.equal(resolveEnv({}).host, '127.0.0.1');
});

test('마감 스위치는 덮어쓰기 파일에 원자적으로 쓴다', () => {
  const f = writeOver({ backup: { keep: 5 } });
  const s = createSettings(loadConfig({ configFile: f }), f);
  s.setQcardsClosed(true);
  assert.equal(s.cfg.qcards.closed, true);
  const saved = JSON.parse(fs.readFileSync(f, 'utf8'));
  assert.deepEqual(saved, { backup: { keep: 5 }, qcards: { closed: true } });
  assert.ok(Object.isFrozen(s.cfg));
});
