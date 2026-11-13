-- 002 · 커뮤니티 확장 1차 (docs/03_DATA_MODEL.md)
-- 연결 PRAGMA 는 src/db.js 가 트랜잭션 밖에서 설정한다.
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
