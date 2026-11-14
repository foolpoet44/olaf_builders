-- 004 · 접속 코드 제거, 아이디/비밀번호 인증
CREATE TABLE credentials (
  person_id      TEXT PRIMARY KEY REFERENCES people(id),
  username       TEXT NOT NULL UNIQUE COLLATE NOCASE,
  password_hash  TEXT NOT NULL,
  salt           TEXT NOT NULL,
  created_at     TEXT NOT NULL,
  updated_at     TEXT NOT NULL,
  updated_by     TEXT NOT NULL
);

DROP TABLE access_codes;
DELETE FROM sessions;

PRAGMA user_version = 4;
