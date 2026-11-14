-- 005 · 조건부 (결정 B8·B9 승인 후 src/schema/ 로 옮긴다)
CREATE TABLE reactions (
  post_id    INTEGER NOT NULL REFERENCES posts(id),
  person_id  TEXT NOT NULL REFERENCES people(id),
  created_at TEXT NOT NULL,
  PRIMARY KEY (post_id, person_id)
);

CREATE TABLE surveys (
  id          INTEGER PRIMARY KEY,
  title       TEXT NOT NULL,
  roles       TEXT NOT NULL DEFAULT '["builder","master"]',
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
CREATE TABLE survey_votes (
  survey_id INTEGER NOT NULL REFERENCES surveys(id),
  person_id TEXT NOT NULL REFERENCES people(id),
  option_no INTEGER NOT NULL,
  at        TEXT NOT NULL,
  PRIMARY KEY (survey_id, person_id, option_no)
);
CREATE TRIGGER surveys_no_delete BEFORE DELETE ON surveys BEGIN SELECT RAISE(ABORT,'surveys rows are never deleted'); END;

PRAGMA user_version = 5;
