# 02. 아키텍처

## 1. 전체 그림

```text
 사내 PC 브라우저 (Edge/Chrome)
        │  HTTP  (2단계: 승인된 HTTPS 프록시 → 127.0.0.1)
        ▼
 ┌──────────────── Windows PC (사내망) ─────────────────────────────────┐
 │  NSSM 서비스 "olaf-builders"                                         │
 │    C:\apps\olaf-builders\runtime\node-v24.x-win-x64\node.exe         │
 │      └ AppDirectory = C:\apps\olaf-builders\releases\<release>\      │
 │        src\server.js  (Express 5 · 프로세스 1개 · 포트 8091)          │
 │             │                                                        │
 │             ├─ public\        정적 화면 (읽기 전용)                   │
 │             └─ C:\ProgramData\PRI\olaf-builders\                     │
 │                  config\ app-settings.json · secrets.json            │
 │                  data\   olaf.db (+wal, shm)   ← node:sqlite         │
 │                  uploads\materials\<id>\pNNN.webp                    │
 │                  logs\   out.log · err.log (NSSM)                    │
 │                  backups\olaf-YYYYMMDD.db                            │
 │                                                                      │
 │  기존(무접촉): prihr-main :8080 · HR 포털 :8081 · 공용 Node · D:\https │
 └──────────────────────────────────────────────────────────────────────┘
```

외부 통신은 없다. DB 서버·캐시·큐·리버스 프록시(1단계)·외부 인증 서버 없음.

## 2. 기술 스택

| 층 | 선택 | 버전 기준 | 비고 |
|---|---|---|---|
| 런타임 | Node.js 포터블 zip (win-x64) | LTS, **22.13 이상**(권장 24.x) | `node:sqlite`를 플래그 없이 쓰는 최소선. 개발 PC 확인: 24.19.0 · SQLite 3.53 |
| HTTP | Express | 5.x (확인 시점 5.2.x) | 운영 의존성 유일 |
| DB | `node:sqlite` `DatabaseSync` | 내장 | 동기 API · WAL · `busy_timeout=5000` |
| 암호 | `node:crypto` | 내장 | `scrypt`(코드 해시) · `randomBytes`(토큰) · `timingSafeEqual` |
| zip 읽기 | 자체 구현 최소 리더 또는 `node:zlib` inflateRaw | 내장 | 자료 꾸러미 업로드용 (`src/lib/zip.js`) — 의존성 추가 금지 |
| 멀티파트 | 쓰지 않음 | — | 업로드는 `Content-Type: application/zip` 원문 본문으로 받는다 |
| 테스트 | `node --test` + `node:assert` | 내장 | HTTP 테스트는 `app.listen(0)` + `fetch` |
| 화면 | HTML + CSS + ES 모듈 JS | — | 빌드 없음 · Pretendard woff2 로컬 |

> `node:sqlite` 실험 경고(ExperimentalWarning)가 뜨는 버전이면 그대로 둔다(기능 정상). 정책상 불가하면 `better-sqlite3`로 교체(ADR-03 대안) — `src/db.js`만 바뀌도록 경계를 지킨다.

## 3. 프로세스 수명

```text
server.js
  1. loadConfig()       app.json + APP_CONFIG_FILE 병합 · 검증 → 실패 시 exit(1)
  2. ensureDirs()       data · uploads · logs · backups · config 생성
  3. loadSecrets()      config\secrets.json 없으면 생성(32바이트 키)
  4. openDb()           WAL · foreign_keys · busy_timeout · 스키마 적용(user_version)
  5. seedFromConfig()   spaces · sessions 표를 설정과 맞춤 (멱등)
  6. createApp(deps)    라우트 조립 (deps 주입 → 테스트에서 메모리 DB 사용)
  7. listen(PORT, HOST)
  8. scheduleBackup()   setTimeout 체인 · 매일 hourLocal
  9. on SIGINT/SIGTERM/SIGBREAK → server.close() → 10초 대기 → db.close() → exit(0)
```

`uncaughtException`·`unhandledRejection`은 err.log에 기록하고 exit(1) — NSSM이 5초 뒤 재시작한다.

## 4. 소스 구조와 모듈 경계

```text
src/
├─ server.js            진입 (위 3절) · 유일하게 process·env를 직접 읽는 곳
├─ app.js               createApp({cfg, db, secrets, clock}) → express 앱
├─ config.js            loadConfig(env) · validateConfig(obj) — 순수 함수 + 파일 읽기
├─ db.js                openDb(path) · migrate(db) · tx(db, fn) · backup(db, dest)
├─ schema/              001_init.sql · 002_*.sql  (user_version 순서)
├─ lib/
│  ├─ http.js           ok(res,obj) · fail(res,status,code,msg) · asyncWrap
│  ├─ log.js            log.info/error — 접속 주소·본문 미기록 · 요청 ID
│  ├─ paths.js          safeJoin(base, ...parts) — 기준 폴더 이탈 시 throw
│  ├─ zip.js            readZip(buffer) → [{name, data}] (stored·deflate만)
│  └─ clock.js          now() — 테스트에서 고정 가능
├─ domain/              업무 규칙 · HTTP·DB 모름 · 순수 함수
│  ├─ privacy.js        findPersonalInfo(text) → ['employee_id'|'email'|'phone']
│  ├─ roster.js         parseRosterCsv(text, cfg) → {people, problems, dropped}
│  ├─ spaces.js         buildSpaces(cfg) · can(person, action, space, cfg)
│  ├─ qcard.js          checkCard(card, ctx) → problems[] · composeSentence · readSeconds
│  ├─ board.js          checkPost(input, cfg) → problems[]
│  └─ materials.js      checkPackage(entries, cfg) → {manifest, pages, problems}
├─ repo/                SQL은 여기만 · 함수 하나 = 문장 하나 또는 트랜잭션 하나
│  ├─ people.js  codes.js  sessions.js  audit.js  rate.js
│  ├─ materials.js  qcards.js  posts.js
├─ middleware/
│  ├─ security.js       보안 머리글 · CSP
│  ├─ session.js        쿠키 → req.user (없으면 null)
│  ├─ require.js        requireLogin · requireRole(...roles)
│  ├─ origin.js         쓰기 요청 Origin/Host 검사
│  └─ errors.js         404 JSON · 500 JSON(내부 정보 없음)
└─ routes/
   ├─ health.js  auth.js  me.js  materials.js  qcards.js  board.js
   ├─ admin.js           사무국 전용 (/api/admin/*)
   └─ ext/               커뮤니티 확장 (docs/13) — 기능 하나 = 파일 하나
      ├─ index.js        registerExtensions(app, deps) — 아래 파일을 featureGate 와 함께 등록
      ├─ directory.js  pin.js  accept.js  qcard-answer.js  notifications.js        (P4.5)
      ├─ events.js  digest.js  material-threads.js  bookmarks.js  tags.js  reports.js (P4.6)
      └─ helpful.js  surveys.js                                                    (조건부)
   (확장용 middleware/feature.js · domain/ext/*.js · repo/ext/*.js 같은 규칙으로 추가)
tools/
├─ admin.js             명령줄: bootstrap · import-roster · issue · issue-all · revoke · deactivate · list
├─ import-legacy.js     (선택) 기존 데이터 1회 가져오기
├─ check.js             점검: /healthz·/readyz·DB 무결성(PRAGMA integrity_check)
└─ render-pdf/          사무국 PC 전용 PDF→webp 꾸러미 (서버 반입 안 함 · 외부 도구 의존 허용)
```

**의존 방향:** `routes → domain, repo, lib` · `repo → db, lib` · `domain → (없음)`. 거꾸로 금지.
`tools/admin.js`는 `routes`를 거치지 않고 `domain`+`repo`를 직접 쓴다(같은 규칙 · 같은 감사 기록).

## 5. 요청 처리 파이프라인

```text
요청 → requestId → security headers → express.json({limit:'64kb'}) (zip 라우트는 express.raw)
     → session(쿠키→req.user) → origin 검사(POST/PUT/PATCH/DELETE)
     → 라우트(requireRole) → domain 검사 → repo(트랜잭션) → audit
     → 응답 JSON  |  정적 파일(public/)  |  404/500 JSON
```

## 6. 화면 라우팅

| URL | 파일 | 접근 |
|---|---|---|
| `/` | `public/index.html` (포털) | 로그인 필요 — 화면 JS가 `/api/me` 401이면 `/login.html`로 |
| `/login.html` | 로그인 | 공개 |
| `/materials.html` | 자료 목록·뷰어 | 로그인 |
| `/qcard.html` | 질문 카드 작성·내 카드 | builder |
| `/board.html` | 공간 목록·글 목록·글 보기·쓰기 (쿼리 `?s=<space>&p=<post>`) | 로그인 |
| `/admin/*.html` | 사무국 화면 | office |
| `/directory.html` · `/events.html` · `/bookmarks.html` · `/surveys.html` | 확장 화면 (`docs/13`) — 기능 꺼지면 화면 JS가 포털로 보냄 | 로그인 |

SPA fallback 없음 — 화면마다 실제 파일. 없는 파일은 `public/404.html`(상태 404).

## 7. 동시성과 SQLite

- 프로세스 하나 + 동기 API → 모든 쓰기가 순서대로 실행된다(별도 락 불필요).
- 여러 문장 쓰기는 `tx(db, fn)`로 `BEGIN IMMEDIATE … COMMIT`(실패 시 ROLLBACK).
- 긴 작업(자료 꾸러미 저장)은 파일 쓰기를 먼저 끝내고 DB 등록만 트랜잭션으로 — 실패 시 파일 정리.
- `tools/admin.js`가 서비스 실행 중에 같은 DB를 열어도 WAL + busy_timeout으로 안전하다(짧은 쓰기).

## 7-1. 커뮤니티 확장의 연결 방식

기존 코드와의 접점은 **세 곳뿐**이다.

| 접점 | 변경 |
|---|---|
| `src/app.js` | `registerExtensions(app, deps)` 한 줄 (P4.5에서 추가) |
| `src/schema/` | `002`·`003`(·`004`) 파일 추가 — 기존 파일 수정 없음 |
| 기존 응답에 칸 추가 | `GET /api/spaces`(`template`), 글 목록(`pinned`·`solved`·`tags`), `GET /api/qcards/mine`·사무국 카드 목록(`answerPostId`), 코드 발급(`inviteText`), `/api/me`(`features`) — **칸 추가만**, 기존 칸 의미 변경 없음. 각 칸은 확장 모듈이 제공하는 `decorate*` 함수로 붙이고 기능이 꺼지면 붙이지 않는다 |

글 작성·수정 시 `tags`처럼 확장이 받는 입력은 `routes/board.js`가 확장 훅(`hooks.onPostSaved(tx, post, input)`)을 한 번 부르는 방식으로 처리한다. 훅이 없거나 기능이 꺼지면 아무것도 하지 않는다.
자동 숨김(신고)은 기존 `repo/posts.hide()`를 그대로 부른다 — 숨김 규칙을 두 곳에 두지 않는다.

## 8. 확장 지점 (지금은 만들지 않음)

| 나중 | 바꿀 곳 |
|---|---|
| HTTPS 프록시 뒤 | 환경변수 `HOST=127.0.0.1`, `TRUST_PROXY=1` — 코드 변경 없음 (`app.set('trust proxy', 1)`, 쿠키 `Secure`) |
| 사내 SSO | `routes/auth.js`에 로그인 방식 추가 · `people`에 외부 ID 칸 · 세션 구조 그대로 |
| 첨부 파일 | `attachments` 표 + `uploads/attachments/` · 악성코드 검사 훅 결정 후 |
| DB 교체 | `src/db.js` + `repo/` — 업무 규칙(`domain/`)은 그대로 |
