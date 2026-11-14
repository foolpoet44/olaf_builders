# 06. 보안 — 최소 세트

원칙: **실재하는 위험만, 가장 단순한 수단으로.** 운영자가 관리할 비밀값·인증서·계정을 늘리지 않는다.
여기 없는 장치를 추가하려면 `docs/11_DECISIONS.md`에 ADR을 쓴다.

## 1. 위협과 대응

| 위협 | 대응 | 일부러 하지 않는 것 |
|---|---|---|
| 비참여자의 열람 | 개인 아이디·비밀번호 로그인 · 모든 API 권한 검사 · 방화벽 승인 대역 | SSO (P5) · 2단계 인증 |
| 비밀번호 추측 | scrypt 해시 · 로그인 실패 10분 20회 제한(접속 주소 해시 기준) | 캡차 · 계정 잠금(현장 혼선) |
| 세션 탈취 | HttpOnly · SameSite=Lax · 서버 저장 세션(즉시 폐기 가능) · 짧은 수명(8h/office 2h) · HTTPS 시 Secure | JWT · 기기 지문 |
| CSRF | SameSite=Lax + 쓰기 요청 Origin/Host 일치 검사 | 토큰형 CSRF |
| XSS | 사용자 값은 `textContent`만 · CSP `script-src 'self'` · 본문 HTML 불허 | HTML 정화 라이브러리 (HTML을 안 받으므로 불필요) |
| SQL 주입 | 자리표시자만 · SQL은 `repo/`에만 | ORM |
| 경로 이탈 | `safeJoin` · 업로드 파일명은 서버가 만든 ASCII · zip 항목 검사 | — |
| 권한 상승 | 역할은 DB 값만 신뢰 · 클라이언트가 보낸 역할·ID 무시 · 화면 숨김에 의존 안 함 | — |
| 개인정보 유입 | 사번·이메일·휴대전화 패턴 입력 거부 · 명단의 사번·이메일 열 버림 · 진단 값 열이면 거부 | 응답 전수 스캔 |
| 로그 유출 | 접속 주소·쿠키·비밀번호·본문·성명 미기록 | 중앙 로그 수집 |
| 대량 업로드·요청 | JSON 64KB · zip 상한 · 쪽 2MB · Express 기본 타임아웃 | WAF |
| 데이터 손실 | 일일 백업 + 업데이트 전 백업 + 별도 저장소 복사 | 복제 DB |

## 2. 쿠키

```text
Set-Cookie: olaf_session=<43자 base64url 토큰>; Path=/; HttpOnly; SameSite=Lax; Max-Age=<초>[; Secure]
```

- `Secure`는 `TRUST_PROXY=1`이고 `X-Forwarded-Proto=https`일 때(또는 직접 HTTPS일 때)만 붙인다.
- 토큰 원문은 쿠키에만. DB에는 `sha256(token)`.
- 만료 세션은 로그인 시점과 1시간 주기로 정리한다.

## 3. 보안 머리글 (`middleware/security.js`)

```text
X-Content-Type-Options: nosniff
X-Frame-Options: DENY
Referrer-Policy: no-referrer
Cross-Origin-Opener-Policy: same-origin
Content-Security-Policy: default-src 'self'; img-src 'self' blob: data:; style-src 'self'; script-src 'self'; font-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'
Permissions-Policy: camera=(), microphone=(), geolocation=()
```

`X-Powered-By` 끔(`app.disable('x-powered-by')`). HSTS는 HTTPS 2단계에서 프록시가 붙인다.

## 4. 비밀값

| 비밀 | 어디 | 누가 만듦 | 노출 범위 |
|---|---|---|---|
| 세션·HMAC 키 (`sessionKey`) | `config\secrets.json` | 앱이 첫 실행 때 `randomBytes(32)` | SYSTEM·Administrators(·서비스 계정) 읽기 |
| 로그인 비밀번호 원문 | 어디에도 저장 안 함 | 사용자가 입력 | 본인 |
| 비밀번호 해시 | SQLite `credentials` | scrypt + 개인별 salt | 서비스 계정 |
| DB 비밀번호 | **없음** (파일 DB) | — | — |

- `secrets.json` 형식: `{"version":1,"sessionKey":"<64 hex>","createdAt":"…"}`.
- 세션 키를 바꾸면 기존 쿠키 세션만 무효가 된다. 비밀번호 해시에는 세션 키를 사용하지 않는다.
- NSSM 환경변수에는 비밀을 넣지 않는다.
- 설치 스크립트가 `config\` 폴더 ACL을 상속 해제 후 SYSTEM·Administrators·(서비스 계정) 전체 권한으로 제한한다.

## 5. 네트워크 단계

| 단계 | 구성 | 조건 |
|---|---|---|
| 0 개발·시범 | `HOST=127.0.0.1` | 언제나 |
| 1 사내 HTTP | `HOST=0.0.0.0` + 방화벽 규칙 1개(포터블 node.exe · 8091 · 승인 대역 · 승인 프로필) | **결정 B3 승인** (저장 정보: 성명·직위·질문/글 본문, 사번·이메일·진단 값 없음) |
| 2 사내 HTTPS | 승인된 리버스 프록시(IIS ARR·Caddy 등, 운영 담당 관리) → `HOST=127.0.0.1`, `TRUST_PROXY=1` · 8091 방화벽 규칙 제거 | 인증서·도메인 승인 |

앱은 인증서를 다루지 않는다. 기존 80/443 바인딩을 건드리지 않는다.

## 6. 개인정보 검사 (`domain/privacy.js`)

```js
export const PATTERNS = {
  employee_id: /(?<![0-9#\[])[0-9]{6,7}(?![0-9\]])/,
  email: /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/,
  phone: /(?<![0-9])01[016789][- .]?[0-9]{3,4}[- .]?[0-9]{4}(?![0-9])/,
};
// findPersonalInfo(text) → 걸린 종류 이름 배열 (값은 돌려주지 않는다)
```

패턴은 설정 `privacy`에서 읽고 위 값은 기본값이다. 오탐(예: 6자리 부품 번호)은 사용자가 표기를 바꾸도록 안내한다(`"숫자 6~7자리는 사번으로 오인됩니다 — 하이픈 등으로 나눠 써 주세요"`).

## 7. 의존성·공급망

- 운영 의존성 `express` 하나 + 그 하위 의존성. `package-lock.json` 커밋, 설치는 `npm ci --omit=dev`.
- 릴리스 꾸러미 만들 때 `npm audit --omit=dev` 결과를 `RELEASE_NOTES.md`에 붙인다(차단 기준: high 이상은 판단 기록).
- `npm` 생명주기 스크립트가 있는 패키지를 추가하지 않는다(`npm ci --ignore-scripts`로 설치해도 동작해야 함).

## 7-1. 커뮤니티 확장 기능의 보안·개인정보 기준 (`docs/13`)

| 기능 | 기준 |
|---|---|
| 멤버 디렉터리 | 표시 칸 4개(+과제명 선택)만 · 이메일·코드·로그인 날짜·활동 건수 없음 · 비활성 사람 제외 |
| 알림 (`seen`) | 사람·키당 시각 1개만 — 열람 이력·읽은 글 목록 저장 금지 · 본인 API만 · 비활성화 시 삭제 |
| 답변 채택 · 도움됐어요 | 건수·상태만 · 사람별 합계·순위·정렬·누가 눌렀는지 표시 금지 (헌법 1조) |
| 안내 문안 | 코드 원문 포함 → 응답에만 · 저장·로그·감사 기록에 문안 원문 금지 |
| 신고 | 신고자는 사무국만 · 메모도 개인정보 검사 · 지정 사유는 즉시 숨김(오남용은 사무국이 `kept`로 복구) · 1인 하루 상한 |
| 설문 | 결과는 선택지별 건수 · `person_id`는 중복 응답 확인용, API로 내보내지 않음 · 사람·과제를 선택지로 쓰지 않음 |
| 태그 | 설정 목록에서만 — 자유 입력으로 이름·사번이 들어오는 경로 차단 |
| 공통 | 기능이 꺼지면 API 404 (존재 자체를 숨김) · 권한은 기존 `can()`·`requireRole` 재사용 |

## 8. 개통 전 보안 점검표

- [ ] 로그인 없이 `/api/*`(헬스·로그인·공개 설정 제외) 전부 401
- [ ] builder로 `/api/admin/*` 전부 403
- [ ] 다른 그룹 보드 읽기·쓰기 403 (설정 규칙대로)
- [ ] 숨김 자료·숨김 글 builder에게 404/안내
- [ ] Origin 다른 POST 403
- [ ] 틀린 코드 21회째 429
- [ ] 응답·로그에 사번·이메일·접속 주소 없음 (로그 파일 grep)
- [ ] `/src/`, `/config/`, `/package.json`, `/../` 요청 404
- [ ] `config\secrets.json` ACL 확인
- [ ] 방화벽 규칙: 프로그램·포트·대역·프로필 일치, 미허용 PC에서 접속 실패
- [ ] (확장) 꺼진 기능의 API 404 · 다른 사람의 알림·저장함 조회 불가 · 신고자 이름이 사무국 외 응답에 없음 · 디렉터리 응답에 표시 칸 외 값 없음
