# 03. 데이터 모델 (SQLite)

파일: `%APP_DATA_DIR%\olaf.db` 하나. 시각은 모두 **UTC ISO 8601 문자열**(`2026-11-20T03:00:00Z`).
스키마 버전은 `PRAGMA user_version`. 사람에 관한 칸은 성명·직위·Lab·그룹뿐 — **사번·이메일 칸 없음.**

## 1. 연결 설정 (`src/db.js` openDb)

```sql
PRAGMA journal_mode = WAL;
PRAGMA synchronous = NORMAL;
PRAGMA foreign_keys = ON;
PRAGMA busy_timeout = 5000;
```

## 2. 스키마 `src/schema/001_init.sql`

```sql
-- 사람 ---------------------------------------------------------------
CREATE TABLE people (
  id          TEXT PRIMARY KEY,                       -- 케이스ID(T-01·PE…) / MS-01 / OP-01
  role        TEXT NOT NULL CHECK (role IN ('builder','master','office')),
  name        TEXT NOT NULL,
  title       TEXT NOT NULL DEFAULT '',
  lab         TEXT,                                   -- builder 필수 · master/office NULL 가능
  grp         TEXT,                                   -- builder 필수
  assigned    TEXT NOT NULL DEFAULT '[]',             -- master 담당 범위 JSON 배열 (Lab 또는 그룹 코드)
  challenge   TEXT,                                   -- builder 개인 과제명 (질문 카드 맥락)
  active      INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0,1)),
  created_at  TEXT NOT NULL,
  updated_at  TEXT NOT NULL
);

-- 접속 코드 (원문 저장 안 함) -------------------------------------------
CREATE TABLE access_codes (
  id          INTEGER PRIMARY KEY,
  person_id   TEXT NOT NULL REFERENCES people(id),
  code_hash   TEXT NOT NULL,                          -- scrypt(code, salt) hex
  salt        TEXT NOT NULL,                          -- 16바이트 hex
  lookup      TEXT NOT NULL UNIQUE,                   -- 코드 앞 4자 HMAC (빠른 조회 · 아래 설명)
  created_at  TEXT NOT NULL,
  created_by  TEXT NOT NULL,
  revoked_at  TEXT
);
CREATE INDEX access_codes_person ON access_codes(person_id);

-- 세션 ------------------------------------------------------------------
CREATE TABLE sessions (
  token_hash  TEXT PRIMARY KEY,                       -- sha256(token) hex · 원문은 쿠키에만
  person_id   TEXT NOT NULL REFERENCES people(id),
  role        TEXT NOT NULL,
  created_at  TEXT NOT NULL,
  expires_at  TEXT NOT NULL
);
CREATE INDEX sessions_expiry ON sessions(expires_at);

-- 로그인 날짜 (시각·접속 주소 없음) ---------------------------------------
CREATE TABLE last_login (person_id TEXT PRIMARY KEY REFERENCES people(id), day TEXT NOT NULL);

-- 횟수 제한 --------------------------------------------------------------
CREATE TABLE rate_hits (
  scope   TEXT NOT NULL,                              -- 'auth'
  bucket  TEXT NOT NULL,                              -- hmac(접속 주소) 앞 16자
  at      INTEGER NOT NULL                            -- epoch 초
);
CREATE INDEX rate_hits_idx ON rate_hits(scope, bucket, at);

-- 감사 기록 (추가만) --------------------------------------------------------
CREATE TABLE audit_log (
  id      INTEGER PRIMARY KEY,
  at      TEXT NOT NULL,
  actor   TEXT NOT NULL,                              -- people.id 또는 'SYSTEM'
  action  TEXT NOT NULL,
  target  TEXT NOT NULL DEFAULT '',
  result  TEXT NOT NULL DEFAULT 'ok'
);
CREATE TRIGGER audit_no_update BEFORE UPDATE ON audit_log BEGIN SELECT RAISE(ABORT,'audit_log is append-only'); END;
CREATE TRIGGER audit_no_delete BEFORE DELETE ON audit_log BEGIN SELECT RAISE(ABORT,'audit_log is append-only'); END;

-- 교육 자료 ---------------------------------------------------------------
CREATE TABLE materials (
  id          INTEGER PRIMARY KEY,
  title       TEXT NOT NULL,
  lecturer    TEXT NOT NULL DEFAULT '',
  session     TEXT,                                   -- 세션 코드(선택)
  pages       INTEGER NOT NULL CHECK (pages BETWEEN 1 AND 150),
  folder      TEXT NOT NULL UNIQUE,                   -- uploads\materials\<folder> (ASCII 무작위)
  status      TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','published','hidden')),
  views       INTEGER NOT NULL DEFAULT 0,             -- 건수만 (사람별 기록 없음)
  sha256      TEXT NOT NULL,                          -- 꾸러미 지문
  created_at  TEXT NOT NULL,
  created_by  TEXT NOT NULL,
  updated_at  TEXT NOT NULL
);
CREATE TRIGGER materials_no_delete BEFORE DELETE ON materials BEGIN SELECT RAISE(ABORT,'materials rows are never deleted'); END;

-- 질문 카드 ---------------------------------------------------------------
CREATE TABLE qc_sessions (                            -- config.sessions 에서 시드
  code   TEXT PRIMARY KEY,
  title  TEXT NOT NULL,
  date   TEXT,
  lead_lab TEXT
);
CREATE TABLE qcards (
  id          INTEGER PRIMARY KEY,
  author_id   TEXT NOT NULL REFERENCES people(id),
  session     TEXT NOT NULL REFERENCES qc_sessions(code),
  lab         TEXT NOT NULL,                          -- 작성 시점 값 고정 (정렬·취합용)
  grp         TEXT NOT NULL,
  status      TEXT NOT NULL DEFAULT 'registered'
              CHECK (status IN ('registered','selected','asked','followup','withdrawn')),
  created_at  TEXT NOT NULL,
  updated_at  TEXT NOT NULL
);
CREATE INDEX qcards_order ON qcards(session, lab, grp, created_at);
CREATE TABLE qcard_versions (
  card_id     INTEGER NOT NULL REFERENCES qcards(id),
  ver         INTEGER NOT NULL,
  format      TEXT NOT NULL CHECK (format IN ('template','free')),
  situation   TEXT,
  constraint_ TEXT,
  ask         TEXT NOT NULL,
  sentence    TEXT NOT NULL,                          -- 낭독 문장 (저장 시점 조립 결과)
  seconds     INTEGER NOT NULL,
  created_at  TEXT NOT NULL,
  editor_id   TEXT NOT NULL,
  PRIMARY KEY (card_id, ver)
);
CREATE TABLE qcard_selections (
  id          INTEGER PRIMARY KEY,
  card_id     INTEGER NOT NULL REFERENCES qcards(id),
  session     TEXT NOT NULL,
  lab         TEXT NOT NULL,
  slot        TEXT NOT NULL CHECK (slot IN ('대표','예비')),
  active      INTEGER NOT NULL DEFAULT 1,
  created_at  TEXT NOT NULL,
  created_by  TEXT NOT NULL
);
CREATE UNIQUE INDEX qsel_one ON qcard_selections(session, lab, slot) WHERE active = 1;
CREATE TRIGGER qcards_no_delete BEFORE DELETE ON qcards BEGIN SELECT RAISE(ABORT,'qcards rows are never deleted'); END;
CREATE TRIGGER qcv_no_update BEFORE UPDATE ON qcard_versions BEGIN SELECT RAISE(ABORT,'qcard_versions is append-only'); END;
CREATE TRIGGER qcv_no_delete BEFORE DELETE ON qcard_versions BEGIN SELECT RAISE(ABORT,'qcard_versions is append-only'); END;

-- 커뮤니티 ----------------------------------------------------------------
CREATE TABLE spaces (                                 -- config.spaces 를 펼쳐 시드 (buildSpaces)
  id     TEXT PRIMARY KEY,                            -- notice · lab_lounge/PA · group_board/PA-1
  code   TEXT NOT NULL,
  label  TEXT NOT NULL,
  lab    TEXT,
  grp    TEXT,
  read_rule  TEXT NOT NULL,
  write_rule TEXT NOT NULL,
  sort   INTEGER NOT NULL
);
CREATE TABLE posts (
  id          INTEGER PRIMARY KEY,
  space_id    TEXT NOT NULL REFERENCES spaces(id),
  parent_id   INTEGER REFERENCES posts(id),           -- NULL 글 · 값 댓글(한 단계)
  author_id   TEXT NOT NULL REFERENCES people(id),
  status      TEXT NOT NULL DEFAULT 'live' CHECK (status IN ('live','deleted','hidden')),
  hide_reason TEXT CHECK (hide_reason IN ('confidential','personal_info','evaluative','other')),
  created_at  TEXT NOT NULL,
  updated_at  TEXT NOT NULL,                          -- 최신판 시각 (목록 정렬용)
  ver         INTEGER NOT NULL DEFAULT 1              -- 최신판 번호 (조회 단순화)
);
CREATE INDEX posts_list ON posts(space_id, parent_id, created_at);
CREATE TABLE post_versions (
  post_id     INTEGER NOT NULL REFERENCES posts(id),
  ver         INTEGER NOT NULL,
  title       TEXT,                                   -- 댓글은 NULL
  body        TEXT NOT NULL,
  created_at  TEXT NOT NULL,
  editor_id   TEXT NOT NULL,
  PRIMARY KEY (post_id, ver)
);
CREATE TRIGGER posts_no_delete BEFORE DELETE ON posts BEGIN SELECT RAISE(ABORT,'posts rows are never deleted'); END;
CREATE TRIGGER posts_fixed BEFORE UPDATE OF id, space_id, parent_id, author_id, created_at ON posts
  BEGIN SELECT RAISE(ABORT,'only status/hide_reason/updated_at/ver may change'); END;
CREATE TRIGGER pv_no_update BEFORE UPDATE ON post_versions BEGIN SELECT RAISE(ABORT,'post_versions is append-only'); END;
CREATE TRIGGER pv_no_delete BEFORE DELETE ON post_versions BEGIN SELECT RAISE(ABORT,'post_versions is append-only'); END;

PRAGMA user_version = 1;
```

> 위 스키마는 P0에서 한 번에 만든다(나중 단계 표도 빈 채로 존재). 단계별 마이그레이션 수를 줄이기 위함이다.
> 2026-11-13 개발 PC(Node 24.19 · SQLite 3.53)에서 이 블록 그대로 적용 · 감사/글 트리거 차단 · `status` 변경 허용 · `VACUUM INTO ?` 동작을 확인했다.

## 2-1. 커뮤니티 확장 마이그레이션 (`docs/13_COMMUNITY_EXTENSIONS.md`)

**추가만** 한다. 기존 표·칸·트리거는 그대로다. `posts_fixed` 트리거는 지정한 칸(`id`·`space_id`·`parent_id`·`author_id`·`created_at`)의 변경만 막으므로 새 칸 갱신과 충돌하지 않는다.

### `src/schema/002_community_plus.sql` — P4.5

```sql
-- 공지 고정 (FR-EXT-06)
ALTER TABLE posts ADD COLUMN pinned_at TEXT;
-- 답변 채택 (FR-EXT-07) — 댓글 id, 조회 시 live 여부 확인
ALTER TABLE posts ADD COLUMN accepted_comment_id INTEGER REFERENCES posts(id);
-- 다른 대상과 잇기 (FR-EXT-08a 질문 카드 · 08b 자료)
ALTER TABLE posts ADD COLUMN ref_kind TEXT CHECK (ref_kind IN ('qcard','material'));
ALTER TABLE posts ADD COLUMN ref_id   INTEGER;
ALTER TABLE posts ADD COLUMN ref_page INTEGER;
CREATE INDEX posts_ref    ON posts(ref_kind, ref_id);
CREATE INDEX posts_pinned ON posts(space_id, pinned_at);
CREATE UNIQUE INDEX posts_one_qcard_answer ON posts(ref_id) WHERE ref_kind = 'qcard' AND parent_id IS NULL;
CREATE TRIGGER posts_ref_fixed BEFORE UPDATE OF ref_kind, ref_id, ref_page ON posts
  BEGIN SELECT RAISE(ABORT,'post reference is fixed'); END;

-- 앱 안 알림 (FR-EXT-09) — 사람·키당 마지막 확인 시각 1개 (열람 이력 아님)
CREATE TABLE seen (
  person_id TEXT NOT NULL REFERENCES people(id),
  key       TEXT NOT NULL,                           -- 'space:<공간id>' | 'mine'
  at        TEXT NOT NULL,
  PRIMARY KEY (person_id, key)
);

PRAGMA user_version = 2;
```

### `src/schema/003_community_more.sql` — P4.6

```sql
-- 내 저장함 (FR-EXT-10) — 개인 정리 데이터, 실제 삭제 허용
CREATE TABLE bookmarks (
  person_id  TEXT NOT NULL REFERENCES people(id),
  post_id    INTEGER NOT NULL REFERENCES posts(id),
  created_at TEXT NOT NULL,
  PRIMARY KEY (person_id, post_id)
);

-- 키워드 태그 (FR-EXT-11) — 값은 설정 목록에서만 (앱 검사)
CREATE TABLE post_tags (
  post_id INTEGER NOT NULL REFERENCES posts(id),
  tag     TEXT NOT NULL,
  PRIMARY KEY (post_id, tag)
);
CREATE INDEX post_tags_tag ON post_tags(tag);

-- 신고 (FR-EXT-12) — 행 삭제 불가, 처리는 칸 갱신
CREATE TABLE reports (
  id          INTEGER PRIMARY KEY,
  post_id     INTEGER NOT NULL REFERENCES posts(id),
  reporter_id TEXT NOT NULL REFERENCES people(id),
  reason      TEXT NOT NULL CHECK (reason IN ('confidential','personal_info','evaluative','other')),
  note        TEXT,
  auto_hidden INTEGER NOT NULL DEFAULT 0,
  created_at  TEXT NOT NULL,
  resolved_at TEXT,
  resolved_by TEXT,
  outcome     TEXT CHECK (outcome IN ('hidden','kept'))
);
CREATE INDEX reports_open ON reports(resolved_at, created_at);
CREATE UNIQUE INDEX reports_once ON reports(post_id, reporter_id) WHERE resolved_at IS NULL;
CREATE TRIGGER reports_no_delete BEFORE DELETE ON reports BEGIN SELECT RAISE(ABORT,'reports rows are never deleted'); END;

PRAGMA user_version = 3;
```

### `src/schema/004_optional.sql` — 결정 B8·B9 승인 후에만

```sql
-- 도움됐어요 (FR-EXT-13) — 건수 표시용, 본인 취소 허용
CREATE TABLE reactions (
  post_id    INTEGER NOT NULL REFERENCES posts(id),
  person_id  TEXT NOT NULL REFERENCES people(id),
  created_at TEXT NOT NULL,
  PRIMARY KEY (post_id, person_id)
);

-- 사무국 간단 설문 (FR-EXT-14) — 결과는 선택지별 건수만 내보낸다
CREATE TABLE surveys (
  id          INTEGER PRIMARY KEY,
  title       TEXT NOT NULL,
  roles       TEXT NOT NULL DEFAULT '["builder","master"]', -- 대상 역할 JSON
  multi       INTEGER NOT NULL DEFAULT 0,
  result_open TEXT NOT NULL DEFAULT 'office' CHECK (result_open IN ('office','after_close')),
  closes_at   TEXT NOT NULL,
  status      TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','closed')),
  created_at  TEXT NOT NULL,
  created_by  TEXT NOT NULL
);
CREATE TABLE survey_options (
  survey_id INTEGER NOT NULL REFERENCES surveys(id),
  no        INTEGER NOT NULL,
  label     TEXT NOT NULL,
  PRIMARY KEY (survey_id, no)
);
CREATE TABLE survey_votes (                           -- person_id 는 1인 1회 확인용 · API 로 내보내지 않음
  survey_id INTEGER NOT NULL REFERENCES surveys(id),
  person_id TEXT NOT NULL REFERENCES people(id),
  option_no INTEGER NOT NULL,
  at        TEXT NOT NULL,
  PRIMARY KEY (survey_id, person_id, option_no)
);
CREATE TRIGGER surveys_no_delete BEFORE DELETE ON surveys BEGIN SELECT RAISE(ABORT,'surveys rows are never deleted'); END;

PRAGMA user_version = 4;
```

> 2026-11-13 Node 24.19에서 001→002→003→004를 각각 트랜잭션으로 적용하고 제약(답변 글 1개·연결 대상 고정·신고 중복/삭제 차단)과 `integrity_check = ok`를 확인했다. 연결 PRAGMA(1절)는 트랜잭션 밖에서 연결 시 실행하고, 마이그레이션 파일에는 넣지 않는다.
>
> 004를 적용하지 않은 DB에서 `features.helpful`·`features.surveys`를 켜면 **시작 거부**한다(`config.js`가 `user_version`과 기능 키를 대조).

## 3. 접속 코드 형식과 조회

- 코드: Crockford Base32 대문자 12자, 화면 표기 `XXXX-XXXX-XXXX`(입력 시 하이픈·공백·소문자 허용 → 정규화).
- 저장: `lookup = HMAC-SHA256(secret, code[0:4])` 앞 16자, `code_hash = scrypt(code, salt, 32)`.
  로그인 시 `lookup`으로 후보 1행을 찾고 `timingSafeEqual`로 비교. (`lookup` 충돌 시 재발급 — UNIQUE 제약)
- 이유: 코드 전체 해시를 모든 행과 비교하는 비용을 피하면서 원문을 저장하지 않는다.

## 4. 무결성 규칙 (앱 코드 + 트리거)

| 규칙 | 강제 수단 |
|---|---|
| 감사 기록 수정·삭제 불가 | 트리거 |
| 글·카드 본문은 판 추가만 | `*_versions` UPDATE/DELETE 트리거 · 앱은 INSERT만 |
| 글·카드·자료 행 삭제 불가 | DELETE 트리거 · 삭제는 `status` |
| 글 소유·공간 변경 불가 | `posts_fixed` 트리거 |
| Lab당 세션당 대표·예비 각 1개 | 부분 UNIQUE 인덱스 |
| 사번·이메일 저장 불가 | 칸 자체가 없음 + 입력 검사 (`domain/privacy.js`) |
| 글의 연결 대상(질문 카드·자료) 변경 불가 · 질문 카드당 답변 글 1개 | `posts_ref_fixed` 트리거 · 부분 UNIQUE 인덱스 (002) |
| 신고 행 삭제 불가 · 처리 전 중복 신고 불가 | `reports_no_delete` 트리거 · 부분 UNIQUE 인덱스 (003) |
| 실제 삭제 허용 표 | `seen` · `bookmarks` · `post_tags`(글 수정 시 교체) · `reactions`(본인 취소) · `sessions` · `rate_hits` — 개인 정리·운영 데이터라 흔적 보존 대상 아님 |
| 보존 기간 만료 물리 삭제 | **이번 범위 아님** — 필요 시 사무국 승인 절차와 함께 별도 도구(트리거를 잠시 내리는 마이그레이션) |

## 5. 마이그레이션 규칙

1. 새 파일 `src/schema/00N_<이름>.sql`, 끝에 `PRAGMA user_version = N;`.
2. 시작 시 `user_version < 최신`이면: **먼저 `backups\pre-migrate-v<현재>-<시각>.db`로 `VACUUM INTO`** → 각 파일을 트랜잭션으로 적용.
3. `user_version > 코드가 아는 최신`이면 시작 중단(구 릴리스로 롤백했는데 DB만 새것인 경우 — 백업 복원 필요 안내).
4. 칸 삭제·이름 변경은 하지 않는다(새 칸 추가 + 앱에서 옛 칸 무시).
5. 코드가 아는 최신 버전 = 릴리스에 들어 있는 스키마 파일 중 가장 큰 번호. `004_optional.sql`은 기본 릴리스에 **포함하지 않고**, B8·B9 승인 후 그 파일을 추가한 릴리스에서만 적용된다.

## 6. 백업과 복원

| 작업 | 방법 |
|---|---|
| 일일 백업 | 앱 내부 `VACUUM INTO '<backups>\olaf-YYYYMMDD.db'` (실행 중 일관된 사본) · 같은 날 파일 있으면 건너뜀 |
| 보존 | `olaf-*.db` 최신 N개(기본 14)만 남김 · `pre-migrate-*`는 자동 삭제 안 함 |
| 업데이트 전 | 서비스 중지 상태에서 `olaf.db` 파일 복사 (`deploy/update.ps1`) |
| 복원 | 서비스 중지 → `olaf.db` 교체 · `olaf.db-wal`·`olaf.db-shm` 삭제 → 시작 → `/readyz` |
| 별도 저장소 | `deploy/backup-copy.ps1`(예약 작업)이 `backups\`·`uploads\`를 승인된 위치로 복사 |
| 점검 | `node tools/check.js --integrity` → `PRAGMA integrity_check` = `ok` |
