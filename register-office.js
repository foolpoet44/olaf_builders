// 사무국 사용자 등록 스크립트
import { resolveEnv } from './src/config.js';
import { bootstrap } from './src/bootstrap.js';
import { upsertPerson, setCredentials } from './src/repo/people.js';

const env = resolveEnv(process.env);
const ctx = bootstrap(env);
const { db, clock } = ctx.deps;
const now = clock.now().toISOString();

// 사번 242830을 사무국으로 등록
// people.id는 OP-01 형태 사용
const personId = 'OP-01';
const username = 'op-01';
const password = 'Op-242830!'; // 생성된 비밀번호

console.log('사용자 등록 중...');
console.log('- 사람 ID:', personId);
console.log('- 사용자명:', username);
console.log('- 비밀번호:', password);
console.log('- 역할: office');

try {
  // 1. 사람 등록
  const result = upsertPerson(db, {
    id: personId,
    role: 'office',
    name: '사무국',
    title: '',
    lab: null,
    grp: null,
    assigned: [],
    challenge: null,
    active: 1
  }, now);
  console.log('- 사람 등록 결과:', result);

  // 2. 자격증명 설정
  const registeredUsername = setCredentials(db, {
    personId,
    username,
    password,
    actor: personId,
    clock
  });
  console.log('- 자격증명 설정 완료:', registeredUsername);

  console.log('\n등록 완료! 첫 로그인에 다음 정보를 사용하세요:');
  console.log('사용자명:', username);
  console.log('비밀번호:', password);
} catch (e) {
  console.error('오류:', e.message);
  process.exit(1);
} finally {
  db.close();
}
