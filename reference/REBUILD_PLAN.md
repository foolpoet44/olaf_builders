# OLAF Builders 재구축 설계 — 사내 Windows 로컬 서버 전용 (원점 재시작)

버전 0.1 · 2026-11-13
대상: 빌드 담당 · 코딩 에이전트 · 서버 운영자
함께 읽을 문서: `DEPLOYMENT_ENVIRONMENT.md` (배포 제약 계약) · `PRI_Windows_WebApp_Manual.md` (운영 절차)
분석 원본: `foolpoet44/af-lab-community` @ `c38e29b` (2026-11-11)

> 이 문서는 **기존 리포를 옮기는 계획이 아니다.** 기존 리포는 요구사항·화면 문구·업무 규칙의 **참고 자료**로만 쓴다.
> 코드는 새 리포에서 처음부터 다시 만들고, 배포 대상은 처음부터 "사내 Windows PC 한 대"로 정한다.

---

## 1. 왜 마이그레이션이 어려웠나 (진단)

| # | 원인 | 리포의 증거 | 재구축에서의 처리 |
|---|---|---|---|
| 1 | **서버리스(Vercel) 구조에 맞춰 만든 코드** | `api/*.py`가 `BaseHTTPRequestHandler` 클래스 하나씩이고, `olaf_app.py`가 이를 메모리에서 흉내 내는 WSGI 덧대기(shim) | 처음부터 일반 상주 서버 하나로 만든다 |
| 2 | **운영용이 아닌 서버** | `wsgiref.simple_server` (단일 스레드 · 개발용) | Node 내장 HTTP 서버 + 프레임워크 |
| 3 | **저장소가 다섯 갈래** | Neon HTTPS SQL · psycopg 직접 접속 · SQLite(개발) · Upstash KV · `api/bundle.json` + 로컬 `audit.log` | **SQLite 파일 하나** |
| 4 | **이관 전용 도구가 코드의 절반** | `pg_transfer` · `pg_sql_export` · `pg_import_qcards` · `audit_sync` · `rebuild_from_live` · `qcard_bundle` · `build_static` 등 18개 스크립트 | 만들지 않는다. 기존 데이터는 1회 가져오기 하나로 끝낸다(선택) |
| 5 | **서버에 없는 런타임과 DB 서버 요구** | Python 3.11 설치 승인 + PostgreSQL 16 설치·계정·pg_hba·pg_dump 예약 작업 | 앱 폴더 안의 **포터블 Node** + DB 서버 없음 |
| 6 | **보안 장치가 층층이 쌓임** | 관리 토큰 + 공용 열람 코드 + 개인 코드 로그인 + 서명 키 2종 + PG 트리거 + CSP 해시 계산 | 로그인 한 종류, 비밀값은 첫 실행 때 자동 생성 |
| 7 | **설정 경로·데이터 경로가 리포 안에 있음** | `data/private` + 정션(`mklink /J`) | 데이터는 처음부터 `C:\ProgramData\PRI\olaf-builders\` |

**한 줄 결론:** 업무 기능 자체는 작다(참여자 32명 · 질문 카드 44장 · 자료 5건). 반면 클라우드↔사내 사이를 오가는 계층이 업무 코드보다 커졌다. 재구축하면 이 계층이 통째로 빠진다.

### 즉시 조치 필요 (재구축과 별개)

- `csv/windows_server.js`에 **SMTP 계정·앱 비밀번호와 관리자 비밀번호가 평문으로 들어 있다**(36~38행 기본값). GitHub 리포에 올라가 있다.
  → 해당 비밀번호를 즉시 바꾸고, 파일을 리포에서 빼며, 이력 정리 여부를 보안 담당과 결정한다. 새 리포에는 이 파일을 가져오지 않는다.
- STATUS.md에 따르면 서버 주소·원격 접속 포트가 git 이력에 남아 있다. 새 리포는 **이력 없이 새로 만든다**(`git init`). 기존 리포는 보관(archive)한다.

---

## 2. 설계 원칙

1. **설치 0, 서버 0.** 서버에 새로 "설치"하는 것은 없다. 런타임은 압축 해제한 포터블 Node, DB는 파일 하나다. 공용 Node·PATH·레지스트리를 건드리지 않는다.
2. **프로세스 하나 · 포트 하나 · NSSM 서비스 하나.**
3. **빌드 단계 없음.** 화면은 순수 HTML/CSS/JS로 만든다. `npm run build`·번들러·트랜스파일러를 두지 않는다.
4. **의존성 최소.** 운영 npm 패키지는 1~2개(순수 JS)까지만. 네이티브 모듈은 쓰지 않는다.
5. **비밀값을 사람이 다루지 않는다.** 세션 서명 키는 첫 실행 때 앱이 만들어 설정 폴더에 저장한다. DB 비밀번호는 존재하지 않는다.
6. **업무 원칙은 그대로 유지한다** (기존 CLAUDE.md 헌법): 판정·순위 금지 · 사번 저장 금지 · 이메일 화면 표시 금지 · 수정은 새 판, 삭제는 상태 변경 · 감사 기록 · 사내 전용 · 외부 AI 전송 금지.
   단, **강제 수단은 단순하게** 둔다(아래 7절).
7. **`DEPLOYMENT_ENVIRONMENT.md` 계약 준수:** 별도 폴더·포트·서비스, `PORT`/`HOST`/`APP_*` 환경변수, `/healthz`·`/readyz`, 릴리스 폴더 분리, 기존 `prihr-main`·`hrportal`·8080·8081 무접촉.

---

## 3. 기술 선택

| 항목 | 선택 | 이유 | 버린 대안 |
|---|---|---|---|
| 런타임 | **Node.js LTS 포터블 zip** (`node-v<LTS>-win-x64.zip`) — 앱 폴더 안에 압축 해제 | 서버 운영 체계(NSSM+Node)와 같다 · 설치 승인 불필요 수준 · 공용 Node 버전 미확인 문제를 피함 | Python 3.11: 설치 승인 필요, Windows 서비스 운영 경험 없음 |
| 버전 | 배포 시점 Active LTS · **22.13 이상**(내장 `node:sqlite`를 플래그 없이 쓰는 최소선) | 네이티브 모듈 없이 SQLite 사용 | — |
| 웹 | `node:http` + **Express 5** (직접 의존성 1개 · 하위 의존성도 전부 순수 JS) | 코딩 에이전트가 가장 안정적으로 다룸 | Next.js: 빌드·`.next`·standalone 계약이 무겁다 |
| DB | **SQLite** — 내장 `node:sqlite` · WAL 모드 · 파일 1개 | DB 서버·계정·포트·방화벽·pg_dump 모두 불필요. 동시 사용자 수십 명엔 충분 | PostgreSQL: 설치·계정·백업 도구·서비스 추가 |
| 화면 | 정적 HTML + 바닐라 JS (`fetch` 상대 URL) · Pretendard 글꼴 **로컬 포함** | 빌드 없음 · 사내망 CDN 차단 대비 | React/Vite: 빌드 단계 추가 |
| 설정 | `config/app.json` (비밀 아님 · 릴리스에 포함) + `APP_CONFIG_FILE` (운영값 덮어쓰기) | YAML 파서 의존성 제거 · Node 기본 `JSON.parse` | config.yaml + PyYAML |
| 테스트 | `node --test` (내장) | 추가 패키지 없음 | — |
| 자료 변환 | 사무국 PC용 **오프라인 도구**(PDF→워터마크 이미지). 서버는 이미지 파일만 받는다 | 서버에 poppler·Pillow·글꼴 불필요 | 서버 변환 |

> `node:sqlite`가 해당 LTS에서 실험 경고를 낸다면 그대로 써도 된다(기능은 안정적). 정책상 불가하면 `better-sqlite3`(win-x64 사전 빌드 제공)로 바꾼다. 이때는 반드시 Windows 개발 PC에서 `npm ci` 결과물을 반입한다. 저장소 접근은 `src/db.js` 한 파일에 모아 두어 교체 비용을 줄인다.

---

## 4. 기존 리포에서 가져갈 것 · 버릴 것

### 가져간다 (참고 자료로 읽고 새로 구현)

| 기존 | 새 구현에서 |
|---|---|
| `CLAUDE.md` 불변 원칙 1~9 | 새 리포 `CLAUDE.md`에 요약 이식 |
| `config.yaml`의 brand · cohort · labs · roles · question_cards 규칙 · sessions · materials 규칙 · privacy 패턴 | `config/app.json`으로 옮김(사람·비밀값 없음) |
| 질문 카드 검사 규칙 (`question_cards.py` `check_card` · 글자 수 · 물음표 1개 · 40초 낭독) | `src/domain/qcard.js` |
| 사번 패턴 `(?<![0-9#\[])[0-9]{6,7}(?![0-9\]])` | `src/domain/privacy.js` — 입력·출력에 공통 적용 |
| 화면 디자인 (`ui/*.html` · 화이트 톤 · `#a50034` · `#171717`) | `public/` 새 화면의 시각 기준 |
| UAT 표 (`docs/cards/O*.md`) | 새 테스트 목록의 체크리스트 |
| 커뮤니티 규칙 층 (`board.py` 판 관리 · `spaces.py` 열람 범위) | `src/domain/board.js` · `spaces.js` |

### 버린다 (새 리포에 만들지 않음)

`vercel.json` · `.vercelignore` · `api/` 처리기 구조 · `olaf_app.py` 덧대기 · Neon/Upstash/KV 코드 · psycopg · `db/postgres/*.sql` 트리거 · `pg_*.py` 전부 · `audit_sync` · `rebuild_from_live` · `qcard_bundle` · `build_static`/`build_docs_html` · `smoke_prod`(→ `/readyz` + 점검 스크립트로 대체) · 관리 토큰 · 공용 열람 코드 · `MATERIALS_SIGNING_KEY` · `csv/windows_server.js` · `data/private` 정션.

---

## 5. 폴더 구조

### 5.1 새 리포 (개발)

```text
olaf-builders/
├─ CLAUDE.md                 업무 헌법 요약 + 이 문서 링크
├─ DEPLOYMENT_ENVIRONMENT.md 배포 제약 계약 (현재 폴더의 문서 그대로)
├─ REBUILD_PLAN.md           이 문서
├─ README.md                 설치·기동·백업·롤백·제거 (실제 파일 트리 기준)
├─ package.json              "type": "module", scripts: start / test / check
├─ package-lock.json
├─ config/
│  └─ app.json               브랜드·Lab·역할·규칙 (비밀·사람 없음)
├─ src/
│  ├─ server.js              진입 파일 — PORT/HOST 읽고 listen, 종료 신호 처리
│  ├─ app.js                 Express 앱 조립 (라우트·미들웨어)
│  ├─ config.js              app.json + APP_CONFIG_FILE 병합·검증 (실패 시 시작 중단)
│  ├─ db.js                  SQLite 열기 · WAL · 스키마 적용 · 쓰기 직렬화
│  ├─ schema.sql             전체 스키마 (번호 붙은 마이그레이션 대신 user_version 1개)
│  ├─ auth.js                접속 코드 로그인 · 세션 쿠키 · 역할 검사 미들웨어
│  ├─ audit.js               감사 기록 1함수
│  ├─ backup.js              매일 VACUUM INTO 백업 + 보존 개수
│  ├─ domain/                업무 규칙 (HTTP 모름 → 단위 테스트 쉬움)
│  │  ├─ privacy.js  qcard.js  materials.js  board.js  spaces.js
│  └─ routes/
│     ├─ health.js  auth.js  qcards.js  materials.js  board.js  admin.js
├─ public/                   정적 화면만 (index · login · qcard · materials · board · admin)
│  ├─ assets/ (css · js · fonts/Pretendard)
├─ tools/                    운영 명령 (node 로 실행)
│  ├─ admin.js               사무국 계정 만들기 · 코드 발급/폐기 · 명단 CSV 가져오기
│  ├─ import-legacy.js       (선택) 기존 질문 카드·자료 1회 가져오기
│  └─ render-pdf/            사무국 PC 전용 PDF→이미지 도구 (서버 반입 안 함)
├─ deploy/                   PowerShell 5.1 스크립트
│  ├─ install.ps1  update.ps1  rollback.ps1  check.ps1  backup-copy.ps1
└─ test/                     node --test · 가짜 데이터(TEST-001)만
```

### 5.2 서버 (운영) — `DEPLOYMENT_ENVIRONMENT.md` 4절 구조 그대로

```text
C:\apps\olaf-builders\
   runtime\node-v<LTS>-win-x64\node.exe     포터블 Node (공용 Node 와 별개)
   releases\20261120-01\                    git archive + npm ci 결과
   releases\20261127-01\                    다음 릴리스 (덮어쓰기 금지)

C:\ProgramData\PRI\olaf-builders\
   config\app-settings.json                 운영값 덮어쓰기 (포트·허용 기능 등)
   config\secrets.json                      세션 서명 키 — 첫 실행 때 앱이 생성, SYSTEM·Administrators 만 읽기
   data\olaf.db (+ -wal, -shm)              유일한 업무 저장소
   uploads\materials\<자료ID>\p001.webp     자료 쪽 이미지
   logs\out.log  err.log
   backups\olaf-YYYYMMDD.db                 매일 자동 · 최근 14개 보존
```

---

## 6. 기능 범위와 단계

| 단계 | 내용 | 기존 카드 | 완료 기준 |
|---|---|---|---|
| **P0 뼈대** | 서버·설정 검증·SQLite·`/healthz`·`/readyz`·로그·종료 처리·NSSM 설치 스크립트 | — | 서버에서 서비스로 기동 · 재시작 후 DB 유지 |
| **P1 로그인·포털** | 개인 접속 코드 로그인 · 역할별 메뉴(Builder·Master·사무국) · 사무국 도구(`tools/admin.js`) · 명단 CSV 가져오기(사번 열 버림) | O02 · O15 · O16 | 코드 발급→로그인→역할 메뉴 · 권한 없는 API 403 |
| **P2 교육 자료** | 자료 목록·쪽 보기(워터마크 이미지) · 사무국 올리기/내리기 | O11 | 로그인 사용자만 열람 · 숨김 자료 404 |
| **P3 질문 카드** | 작성(로그인 신원으로 작성자 자동) · 마감 스위치 · 사무국 목록·한 장 보기·CSV 내보내기 · (선택) 기존 44장 가져오기 | O10 · O12 · O13 · O17 | 기존 검사 규칙 테스트 통과 · 마감 시 410 |
| **P4 커뮤니티** | 공간(공지·Lab 라운지·그룹 보드) · 글·댓글 · 새 판 수정 · 상태 삭제 · 운영자 숨김 | O03 · O04 | 열람 범위 규칙 테스트 · 원본 보존 |
| P5 이후 | 스킬 태그·Challenge 스레드·opt-in 프로필·지식 자산 | O05~O09 | 사무국 Q1 결정 뒤 |

P0~P2만으로 현재 Vercel 운영 기능(자료 열람·사무국 화면)을 대체할 수 있다. 질문 카드는 이미 마감되어 P3는 서두르지 않아도 된다.

---

## 7. 데이터 모델 (SQLite 하나)

```sql
PRAGMA journal_mode = WAL;  PRAGMA foreign_keys = ON;

people        (id TEXT PK /*케이스ID 또는 OP-01*/, name, title, lab, grp, role /*builder|master|office*/, active INTEGER)
access_codes  (id INTEGER PK, person_id, code_hash, salt, created_at, revoked_at)
sessions      (token_hash TEXT PK, person_id, role, expires_at)
qcards        (id INTEGER PK, uid TEXT UNIQUE, author_id, session_code, status, created_at)
qcard_versions(card_id, ver, body_json, created_at, PRIMARY KEY(card_id, ver))
materials     (id INTEGER PK, title, lecturer, session_code, pages, status /*draft|published|hidden*/, created_at)
spaces        (code TEXT PK, kind, lab, grp)            -- config 에서 시드
posts         (id INTEGER PK, space_code, author_id, parent_id /*댓글*/, status /*live|deleted|hidden*/, hide_reason, created_at)
post_versions (post_id, ver, title, body, created_at, PRIMARY KEY(post_id, ver))
rate_hits     (bucket TEXT, at INTEGER)                 -- 틀린 코드 횟수 제한
audit_log     (id INTEGER PK, at TEXT, actor, action, target, result)
```

- **사번·이메일 칸 없음.** 명단 CSV에 있어도 읽지 않는다. 화면 표시는 성명·직위·Lab·그룹까지다.
- **새 판·상태 삭제**는 앱 코드로 지킨다(UPDATE는 `status`만, 본문은 `*_versions`에 INSERT만).
- **감사 기록 보호**는 SQLite 트리거 2줄로 충분하다.
  `CREATE TRIGGER audit_no_upd BEFORE UPDATE ON audit_log BEGIN SELECT RAISE(ABORT,'append-only'); END;` (DELETE도 같다)
- **스키마 변경**은 `PRAGMA user_version` 숫자 하나로 관리한다. 시작 시 숫자가 낮으면 `schema.sql`의 다음 블록만 적용한다. 적용 전에 백업 파일을 자동으로 만든다.
- **쓰기 직렬화:** 프로세스가 하나이고 `node:sqlite`는 동기 API이므로 쓰기가 자연스럽게 직렬화된다. `busy_timeout = 5000`을 설정한다.
- **자료 이미지**는 DB가 아닌 `uploads\materials\`에 파일로 둔다. DB가 작아져 백업·복원이 빠르다.

---

## 8. 보안 — 과하지 않은 최소 세트

| 항목 | 이렇게 한다 | 일부러 하지 않는 것 |
|---|---|---|
| 로그인 | 사무국이 1인 1코드 발급(`tools/admin.js issue TEST-001`) → 사내 메일로 사람이 전달. 코드는 `crypto.scrypt` 해시로 저장 | SSO 연동 · 비밀번호 정책 · 이메일 인증 (2단계 SSO는 나중에) |
| 세션 | 무작위 토큰 → DB에는 해시 저장 · 쿠키 `HttpOnly; SameSite=Lax; Path=/` (+HTTPS일 때 `Secure`) · 참여자 8시간, 사무국 2시간 | JWT · 서명 키 회전 |
| 권한 | 라우트마다 `requireRole('office')` 같은 미들웨어 한 줄 | 화면 숨김만으로 보호 |
| CSRF | SameSite=Lax + 쓰기 요청에 `Origin`/`Host` 일치 검사 (미들웨어 1개) | 토큰 발급형 CSRF |
| 무차별 대입 | 접속 주소 해시당 10분에 틀린 코드 20회 | 캡차 · 계정 잠금 |
| 비밀값 | `secrets.json` 자동 생성 · 파일 ACL만 | 비밀 관리 시스템 · NSSM 환경변수에 비밀 넣기 |
| 응답 머리글 | `X-Frame-Options: DENY` · `nosniff` · `Referrer-Policy: no-referrer` · `Cache-Control: no-store`(API) · 기본 CSP `default-src 'self'` | 인라인 스크립트 해시 계산 (인라인 JS를 쓰지 않으면 필요 없음) |
| 개인정보 | 입력 검사에서 사번 패턴 거절 · 로그에 접속 주소·코드·본문 미기록 | 응답 전체 스캔 미들웨어 |
| 네트워크 | `HOST=0.0.0.0` + 방화벽 규칙 1개(포터블 node.exe · 승인 포트 · 승인 대역) | 앱 내 IP 허용 목록 |
| HTTPS | **1단계: 사내 HTTP**로 개통하되 저장 정보를 성명·직위·질문/글 본문으로 한정(사번·이메일·진단 값 없음). **2단계:** 승인된 리버스 프록시가 생기면 `HOST=127.0.0.1` + `TRUST_PROXY=1`로 전환(코드 변경 없음) | 앱이 직접 인증서 관리 |

> `DEPLOYMENT_ENVIRONMENT.md` 5·8절은 민감 데이터 운영 개통에 HTTPS를 요구한다. 1단계 HTTP 개통은 **"저장 정보의 민감도가 낮다"는 근거로 받는 별도 승인 항목**이다(11절 결정 표 B3). 승인이 나지 않으면 HTTPS 프록시가 준비될 때까지 사내 시범 운영(가짜 데이터)만 한다.

---

## 9. 설정 계약

### 환경변수 (NSSM `AppEnvironmentExtra` — 비밀 없음)

| 변수 | 값 | 비고 |
|---|---|---|
| `NODE_ENV` | `production` | |
| `PORT` | `8091` (제안) | 기존 리포가 8090(selection_agent)과 충돌을 피해 정한 값. 운영자 승인 필요 · 8080/8081 금지 |
| `HOST` | `0.0.0.0` → 프록시 도입 시 `127.0.0.1` | |
| `APP_DATA_DIR` | `C:\ProgramData\PRI\olaf-builders\data` | |
| `APP_UPLOAD_DIR` | `C:\ProgramData\PRI\olaf-builders\uploads` | |
| `APP_CONFIG_FILE` | `C:\ProgramData\PRI\olaf-builders\config\app-settings.json` | 없으면 기본값으로 동작, **형식 오류면 시작 중단** |
| `APP_RELEASE` | `20261120-01` | `/healthz` 응답용 |
| `TRUST_PROXY` | `0` | 프록시 뒤에서만 `1` |

### `app-settings.json` 예

```json
{
  "appId": "olaf-builders",
  "auth": { "sessionHours": 8, "officeSessionHours": 2 },
  "qcards": { "closed": true },
  "backup": { "keep": 14, "hourLocal": 3 }
}
```

### 헬스 계약

- `GET /healthz` → `200 {"status":"ok","app":"olaf-builders","release":"<APP_RELEASE>"}`
- `GET /readyz` → DB `SELECT 1` 성공 · `user_version` 일치 · 데이터/업로드 폴더 쓰기 가능 · `secrets.json` 읽힘 → `200 {"status":"ready",...}`. 하나라도 실패하면 `503 {"status":"not_ready","app":...,"release":...}`(사유 코드만, 경로·비밀 없음)

---

## 10. 배포 · 운영 흐름

### 10.1 개발 PC (Windows) — 릴리스 꾸러미 만들기

```powershell
git archive -o olaf-builders-<sha>.zip HEAD
# 같은 Node LTS 로 깨끗한 폴더에서: Expand → npm.cmd ci --omit=dev → node --test
# 결과 폴더(node_modules 포함, 순수 JS 라 OS 무관)를 다시 zip + SHA256 목록
```

반입물은 ① 앱 릴리스 zip ② 포터블 Node zip(최초 1회) ③ SHA256 목록, 이렇게 셋이다. 서버에 인터넷·npm 레지스트리가 없어도 된다.

### 10.2 서버 — `deploy\install.ps1` (최초 1회)

1. 사전 검사: 관리자 권한 · 포트 미사용 · 서비스명 `olaf-builders` 미존재 · 보호 이름·포트 거부 · NSSM 절대경로 존재 (`DEPLOYMENT_ENVIRONMENT.md` 매뉴얼 4.1의 검사 그대로)
2. 폴더 생성 · 포터블 Node 압축 해제 · 릴리스 압축 해제 · 해시 대조
3. **전경 실행 시험**: `node.exe src\server.js` → `/healthz`·`/readyz` 확인 → 종료 · 포트 해제 확인
4. NSSM 등록(수동 시작) — Application=포터블 node.exe, AppDirectory=릴리스, AppParameters=`src\server.js`, 로그·환경변수 설정
5. 첫 사무국 계정 만들기: `node.exe tools\admin.js bootstrap OP-01` → 코드는 화면에 **한 번만** 표시
6. 승인 후 자동 시작 전환 · 방화벽 규칙(-Program 포터블 node.exe · -RemoteAddress 승인 대역)
7. `-DryRun` 스위치는 위 단계를 출력만 한다. 실패하면 완료된 단계와 남은 단계를 표시하고 성공 메시지를 내지 않는다.

### 10.3 업데이트 · 롤백 · 백업

- `update.ps1 -Release 20261127-01`: 새 릴리스 폴더 준비 → 서비스 중지 → **DB 파일 백업**(중지 상태에서 파일 복사 · 가장 단순·확실) → AppDirectory 교체 → 시작 → `/readyz`와 release 일치 확인. 실패하면 자동으로 이전 AppDirectory로 되돌린다.
- `rollback.ps1`: 이전 AppDirectory 복원. 스키마가 올라간 릴리스였다면 업데이트 직전 백업 DB로 함께 복원한다.
- **백업:** 앱이 매일 03시에 `VACUUM INTO 'backups\olaf-YYYYMMDD.db'`를 실행한다(실행 중에도 일관된 사본). 14개 보존. `backup-copy.ps1`(예약 작업)이 `backups\`와 `uploads\`를 승인된 별도 저장소로 복사한다.
- **복원:** 서비스 중지 → `data\olaf.db` 교체(-wal/-shm 삭제) → 시작. 이 세 단계가 전부다.

### 10.4 기존 데이터 (선택 · 1회)

원점 재시작이므로 필수가 아니다. 필요하면 아래 순서로 한다.

1. 현재 운영 DB(Neon)에서 `qcards`·`qcard_versions`·`materials`(메타)·`material_pages`를 콘솔에서 **CSV/JSON으로 내보낸다**(읽기만).
2. `tools/import-legacy.js`가 빈 DB에만 넣는다(이미 있으면 거부). 감사 기록에 `import_legacy` 1줄을 남긴다.
3. 자료 쪽 이미지는 사무국 PC의 원본 PDF로 `render-pdf` 도구를 다시 돌리는 편이 DB 이미지 추출보다 단순하다.
4. 성공을 확인한 뒤 Neon·Upstash·Vercel 정리는 사무국 결정(기존 D1·D6)에 따른다.

---

## 11. 착수 전 결정이 필요한 것 (최소)

| # | 결정 | 누가 | 결정 전 기본값 |
|---|---|---|---|
| B1 | 포터블 Node를 `C:\apps\olaf-builders\runtime`에 두는 것 승인 | 서버 운영 | 승인 전에는 개발 PC에서만 개발·시험 |
| B2 | 포트 `8091` · 서비스명 `olaf-builders` · 허용 클라이언트 대역 | 서버 운영 · 보안 | 8091 · `127.0.0.1` 바인딩(외부 접근 없음) |
| B3 | 1단계 사내 HTTP 개통 허용 여부 (저장 정보: 성명·직위·본문, 사번·이메일 없음) | 보안 | 불허로 간주 → 가짜 데이터 시범 운영 |
| B4 | 서비스 실행 계정 (전용 계정 권장, 불가 시 LocalSystem 사유 기록) | 서버 운영 | LocalSystem + 수동 시작 |
| B5 | 별도 백업 저장소 위치 · 보존 기간 | 서버 운영 · 사무국 | 동일 PC 14일 (미검증으로 표시) |
| B6 | 기존 질문 카드·자료를 가져올지 | 사무국 | 가져오지 않음 · 자료는 PDF에서 다시 변환 |
| B7 | 기존 리포 보관(archive) 및 `csv/windows_server.js` 노출 비밀번호 교체 | 빌드 담당 · 보안 | **즉시 교체 권장** |

---

## 12. 일정 감 (1인 + 코딩 에이전트 기준 · 참고)

| 단계 | 예상 |
|---|---|
| P0 뼈대 + 배포 스크립트 + 서버 시범 기동 | 2~3일 |
| P1 로그인·포털·사무국 도구 | 2일 |
| P2 교육 자료 | 1~2일 |
| P3 질문 카드 | 2일 |
| P4 커뮤니티 기본 | 4~5일 |

---

## 13. 코딩 에이전트 시작 프롬프트 (복사용)

> 이 폴더의 `REBUILD_PLAN.md`와 `DEPLOYMENT_ENVIRONMENT.md`를 먼저 읽고 둘 다 제약으로 적용하라. 이것은 기존 `af-lab-community` 리포의 이관이 아니라 새 프로젝트다. 기존 리포는 업무 규칙·화면 문구·UAT 참고용으로만 읽고 코드는 가져오지 마라.
> 스택: 포터블 Node LTS(22.13+) · ES 모듈 · Express 5 · 내장 `node:sqlite`(WAL) · 정적 HTML/바닐라 JS(빌드 없음) · `node --test`. 운영 의존성은 express 하나를 원칙으로 하고 네이티브 모듈은 금지한다.
> 데이터·업로드·로그·설정은 `APP_DATA_DIR`·`APP_UPLOAD_DIR`·`APP_CONFIG_FILE` 경로에만 쓰고 릴리스 폴더에 쓰지 마라. `/healthz`·`/readyz` 계약, 사번 패턴 거절, 이메일 비표시, 새 판·상태 삭제, 추가만 하는 감사 기록을 지켜라. 세션 서명 키는 첫 실행 때 생성해 config 폴더에 저장하라.
> P0(뼈대·헬스·DB·종료 처리·`deploy/install.ps1` DryRun)부터 구현하고, 각 단계마다 테스트 결과와 미검증 범위를 보고하라. 대상 서버의 서비스·방화벽·계정 변경은 실행하지 말고 스크립트와 절차로만 제공하라.
