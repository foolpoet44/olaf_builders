-- 003 · 커뮤니티 확장 2차 (docs/03_DATA_MODEL.md)
-- 연결 PRAGMA 는 src/db.js 가 트랜잭션 밖에서 설정한다.
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
