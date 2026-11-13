-- 004 · 조건부 (결정 B8·B9 승인 후 src/schema/ 로 옮긴다) (docs/03_DATA_MODEL.md)
-- 연결 PRAGMA 는 src/db.js 가 트랜잭션 밖에서 설정한다.
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
