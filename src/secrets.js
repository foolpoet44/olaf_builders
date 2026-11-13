// config\secrets.json — 첫 실행 때 앱이 만든다 (docs/06_SECURITY.md 4절)
import fs from 'node:fs';
import path from 'node:path';
import { randomBytes } from 'node:crypto';

export function loadOrCreateSecrets(configDir, now = new Date()) {
  const file = path.join(configDir, 'secrets.json');
  if (fs.existsSync(file)) {
    const s = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (!/^[0-9a-f]{64}$/.test(s.sessionKey ?? '')) throw new Error('secrets.json: sessionKey 형식 오류');
    return { sessionKey: s.sessionKey, created: false, file };
  }
  fs.mkdirSync(configDir, { recursive: true });
  const s = { version: 1, sessionKey: randomBytes(32).toString('hex'), createdAt: now.toISOString() };
  // wx: 동시에 두 프로세스가 만들려 해도 하나만 성공
  fs.writeFileSync(file, JSON.stringify(s, null, 2) + '\n', { encoding: 'utf8', flag: 'wx' });
  return { sessionKey: s.sessionKey, created: true, file };
}
