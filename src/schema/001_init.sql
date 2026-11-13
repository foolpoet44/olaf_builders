-- 001 · 기본 스키마 (docs/03_DATA_MODEL.md)
-- 연결 PRAGMA 는 src/db.js 가 트랜잭션 밖에서 설정한다.
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
