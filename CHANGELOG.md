# CHANGELOG

## v1.0 · 2026-11-13 — 최종 빌드 패키지

- **추가** `docs/13_COMMUNITY_EXTENSIONS.md` — 커뮤니티 확장 14종(추가형 · 기능 플래그 `features.*`)
  - P4.5: 글쓰기 틀 · 멤버 디렉터리 · 공지 고정 · 답변 채택 · 질문 카드 후속 답변 글 · 앱 안 알림
  - P4.6: 일정 · 이번 주 새 글 · 코드 안내 문안 · 자료 질문 스레드 · 내 저장함 · 키워드 태그 · 신고
  - 조건부(B8·B9): 도움됐어요 · 사무국 간단 설문 — 기본 꺼짐
- **추가** 마이그레이션 `002_community_plus` · `003_community_more` · `004_optional`(조건부) — 표·칸 추가만 (`docs/03` 2-1절, Node 24.19에서 적용·제약 검증)
- **추가** API 9절 · 화면 3-1절 · 요구사항 1.7절(FR-EXT) · 보안 7-1절 · 설정 키 · 테스트 3-1절 · 인수 A17~A19 · 로드맵 P4.5·P4.6·P5-조건부 · 결정 B8~B11 · ADR-10~12
- **변경** `config/app.json` v1.1 — `features` · `site` · `events` · `invite` · `tags` · `moderation` · `directory` · `qcardAnswer` · `notifications` · `digest` · `surveys` · Lab `keywords` · 공간 `template`·`acceptAnswers` · `material_qa` 공간 · 메뉴 4개 추가
- **추가** `prompts/P4_5_to_P4_6_extensions.md` · `MANIFEST.txt`

## v0.1 · 2026-11-13 — 초판

- 개발 문서 00~12 · `CLAUDE.md` · `config/app.json` · 에이전트 지시문(00 · P0 · P1~P4) · 참고 문서 3종
- 스키마 001 Node 24.19 / SQLite 3.53에서 적용·트리거·`VACUUM INTO` 검증
