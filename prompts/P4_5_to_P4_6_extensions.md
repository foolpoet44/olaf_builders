# P4.5 · P4.6 · 커뮤니티 확장 지시문

공통 전제: P4 완료 보고가 끝난 뒤에만 진행한다. `docs/13_COMMUNITY_EXTENSIONS.md` 전체와 1절 **추가 규칙**을 먼저 읽어라.
- 기존 표·칸·트리거·스키마 파일을 고치지 마라. 새 마이그레이션 파일에 표·칸 **추가만** 한다.
- 기존 코드 접점은 `app.js`의 `registerExtensions(app, deps)` 한 줄, `routes/board.js`의 저장 훅 1개, 기존 응답에 칸을 붙이는 `decorate*` 함수뿐이다. 그 밖의 기존 파일 수정이 필요하면 구현 전에 묻는다.
- 기능 하나 = `routes/ext/<기능>.js` 하나(+필요 시 `domain/ext/`·`repo/ext/`). 모두 `featureGate('<키>')` 뒤에 둔다.
- 의존성 추가 금지. 판정 금지(정렬·사람별 집계·명단 금지) — `docs/06_SECURITY.md` 7-1절.
- 테스트는 `test/ext/`에, 이름에 `FR-EXT-xx`. 마지막에 **모든 기능을 끈 상태로 전체 테스트**를 돌려 회귀가 없음을 보고하라.

---

## P4.5 · 확장 1차

`docs/10_ROADMAP.md` P4.5를 구현하라. FR-EXT-00·01·02·06·07·08a·09.

1. `src/schema/002_community_plus.sql` — `docs/03_DATA_MODEL.md` 2-1절 그대로.
2. `src/middleware/feature.js` · `src/routes/ext/index.js` · `app.js` 등록 한 줄 · `/api/me`의 `features`.
3. 기능: 글쓰기 틀(`GET /api/spaces`에 `template`) · 멤버 디렉터리(`directory.html`) · 공지 고정 · 답변 채택 · 질문 카드 답변 글(`admin/qcards.html` 버튼 · `qcard.html` 링크) · 알림(`/api/me/notifications`·`/api/me/seen` · 포털·공간 목록 배지, 30초 이상 간격).
4. API 형식은 `docs/04_API_SPEC.md` 9절, 화면은 `docs/05_UI_SPEC.md` 3-1절.
5. 검증: 001만 적용된 DB 사본(가짜 데이터)에 002를 적용해 기존 글·카드가 그대로인지 테스트로 확인.

## P4.6 · 확장 2차

`docs/10_ROADMAP.md` P4.6을 구현하라. FR-EXT-03·04·05·08b·10·11·12.

1. `src/schema/003_community_more.sql` — `docs/03` 2-1절 그대로.
2. 기능: 일정(`events.html` · 포털 3개) · 이번 주 새 글 · 안내 문안(코드 발급 응답·`tools/admin.js issue` 출력에 `inviteText`, 저장·로그 금지) · 자료 질문 스레드(`material_qa` 공간 · 뷰어 패널) · 내 저장함(`bookmarks.html`) · 태그(설정 목록에서만 · 글 저장 훅) · 신고(`admin/reports.html` · 즉시 숨김은 기존 `repo/posts.hide()` 재사용).
3. 신고자 신원이 사무국 외 응답에 나타나지 않음을 테스트로 보장하라.

## P5-조건부 (지시가 있을 때만 · 결정 B8·B9 승인 후)

- B8 승인: `src/schema/004_optional.sql`을 릴리스에 추가하고 FR-EXT-13(도움됐어요). 목록·정렬·통계에 건수를 쓰는 코드가 없음을 `grep` 테스트로 보장.
- B9 승인: FR-EXT-14(설문). 결과 API에 응답자 정보가 없음을 테스트로 보장.
