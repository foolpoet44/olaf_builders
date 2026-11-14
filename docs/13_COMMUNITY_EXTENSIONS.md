# 13. 커뮤니티 확장 기능 (추가형)

P4(커뮤니티 기본) 위에 **기존 구조를 고치지 않고 더하기만** 해서 붙이는 기능 14종.
요구사항 ID `FR-EXT-<번호>` · 단계 P4.5(1차) · P4.6(2차) · P5-조건부(승인 후).

## 1. 추가 규칙 (모든 확장 기능 공통)

| 층 | 규칙 |
|---|---|
| DB | 새 마이그레이션 파일만(`002`·`003`·`004`). **표 추가·칸 추가만** — 기존 칸 삭제·이름 변경·기존 트리거 수정 금지 |
| 서버 | 새 `routes/<기능>.js`(+필요 시 `domain/<기능>.js`·`repo/<기능>.js`). `app.js`에는 등록 한 줄씩만 |
| 화면 | 기존 화면에 블록 추가 또는 새 파일 1개. 공통 `common.js`의 `api`·`el` 재사용 |
| 켜고 끄기 | `config/app.json`의 `features.<키>`. 꺼지면 해당 API **404**(`featureGate` 미들웨어), `/api/me`의 `features`가 false라 화면 블록 숨김 |
| 권한 | 기존 `can()`·`requireRole`·`requireLogin`만 사용. 새 권한 체계 금지 |
| 기록 | 기존 `audit()` 함수. 동작 이름은 4절 표 |
| 의존성 | 추가 0 |
| 원칙 | 판정 금지 · 개인정보 최소 · 흔적 보존 · 자동 발송 금지 (CLAUDE.md A절) |

```js
// src/middleware/feature.js — 확장 기능 공통 게이트
export const featureGate = (key) => (req, res, next) =>
  req.app.locals.settings.feature(key) ? next() : res.status(404).json({ ok:false, error:{ code:'not_found', message:'없는 주소입니다' } });
```

## 2. 기능 목록

| # | 키 (`features.*`) | 기능 | DB | 단계 | 기본값 |
|---|---|---|---|---|---|
| 1 | `templates` | 공간별 글쓰기 틀 | 없음 | P4.5 | on |
| 2 | `directory` | 멤버 디렉터리 | 없음 | P4.5 | on |
| 6 | `pin` | 공지 고정 | 002 칸 | P4.5 | on |
| 7 | `accept` | Q&A 답변 채택·해결 표시 | 002 칸 | P4.5 | on |
| 8a | `qcardAnswer` | 질문 카드 → 후속 답변 글 | 002 칸 | P4.5 | on |
| 9 | `notifications` | 앱 안 새 글·새 댓글 알림 | 002 표 | P4.5 | on |
| 3 | `events` | 일정·여정 페이지 | 없음 | P4.6 | on |
| 4 | `digest` | 이번 주 새 글 모아보기 | 없음 | P4.6 | on |
| 8b | `materialThreads` | 자료별 질문 스레드 | 002 칸(공용) | P4.6 | on |
| 10 | `bookmarks` | 내 저장함 | 003 표 | P4.6 | on |
| 11 | `tags` | 키워드 태그 | 003 표 | P4.6 | on |
| 12 | `reports` | 신고·사무국 처리 | 003 표 | P4.6 | on |
| 13 | `helpful` | "도움됐어요" (건수만) | 005 표 | P5-조건부 | **off** · 결정 B8 |
| 14 | `surveys` | 사무국 간단 설문 | 005 표 | P5-조건부 | **off** · 결정 B9 |

> 마이그레이션 002·003은 해당 단계에서 적용한다. 기능이 꺼져 있어도 표·칸은 존재해도 된다(빈 채로). 004는 B8 또는 B9 승인 후에만 만든다.

## 3. 기능별 명세

### FR-EXT-01 글쓰기 틀 (`templates`)
- 설정 `spaces[].template`(제목 배열)이 있으면 새 글 폼의 본문을 `【제목】\n\n` 블록으로 미리 채운다. 사용자가 지워도 된다(서버 검사 없음).
- 기본 틀: `build_review` = Problem·Solution·Evidence·Business Impact·Next Scale(기존 `demo_day_template`) · `group_board` = 이번 주 한 일·막힌 점·도움 필요 · `master_qa`·`material_qa` = 내 과제 맥락·궁금한 점·시도해 본 것.
- API 변경 없음: `GET /api/spaces` 항목에 `template` 배열을 싣는다.

### FR-EXT-02 멤버 디렉터리 (`directory`)
- `GET /api/directory` (로그인) — 활성 사람만. 정렬 **Lab → 그룹 → 이름(`localeCompare('ko')`)** 고정. Master는 담당 범위, 사무국은 "사무국" 묶음.
- 표시 칸: 성명·직위·Lab·그룹(+`features.directory` 하위 설정 `showChallenge: true`면 개인 과제명). 이메일·코드·마지막 로그인·활동 건수 **없음**.
- 화면: `directory.html` — Lab 탭 · 이름 검색(화면 안 필터).
- 감사 기록 없음(일반 열람).

### FR-EXT-06 공지 고정 (`pin`)
- `posts.pinned_at`. `POST /api/admin/posts/:id/pin` · `DELETE …/pin` (office). 글(댓글 아님)·`live`만.
- 공간당 최대 `posts.maxPinnedPerSpace`(기본 3) — 넘으면 409.
- 목록: 고정 글(고정 시각 최신순) → 일반 글. 감사 `post_pin`·`post_unpin`.

### FR-EXT-07 답변 채택·해결 표시 (`accept`)
- `posts.accepted_comment_id`. 설정 `spaces[].acceptAnswers: true`인 공간(기본 `master_qa`·`material_qa`)에서만.
- `POST /api/posts/:id/accept` `{"commentId": n}` · `DELETE /api/posts/:id/accept` — 글 작성자 또는 office. 댓글은 그 글의 `live` 댓글이어야 함.
- 화면: 글 목록에 "해결됨" 표시 · 채택 댓글 맨 위 고정 표시.
- **금지:** 채택 건수 집계, Master별·사람별 채택 통계, 채택 수로 정렬. 감사 `post_accept`·`post_unaccept`.
- 채택된 댓글이 나중에 삭제·숨김되면 채택 표시는 자동으로 무시(조회 시 `live` 확인).

### FR-EXT-08a 질문 카드 후속 답변 (`qcardAnswer`)
- `posts.ref_kind='qcard'`, `ref_id=<카드 id>`.
- `POST /api/admin/qcards/:id/answer-post` (office) `{"title"?: "…", "body": "…"}` → 설정 `qcardAnswer.space`(기본 `master_qa`)에 글 생성. 본문 앞에 `【질문】 <카드 낭독 문장>`을 자동 인용. 작성자 = 요청한 사무국.
  - 질문자 성명은 넣지 않는다(설정 `qcardAnswer.showAsker: false` 기본). 카드 상태가 `registered`·`selected`·`asked`면 `followup`으로 바꾼다.
  - 같은 카드에 답변 글이 이미 있으면 409(하나만).
- `GET /api/qcards/mine` 항목에 `answerPostId` 추가 → "답변 보기" 링크. 사무국 카드 목록에도 표시.
- 마감(`qcards.closed`)과 무관하게 동작. 감사 `qcard_answer`.

### FR-EXT-09 앱 안 알림 (`notifications`)
- 표 `seen(person_id, key, at)` — 키 `space:<공간id>` 또는 `mine`. **공간당·사람당 마지막 확인 시각 1개**만(열람 이력 아님).
- `GET /api/me/notifications` → `{"spaces":[{"id","newPosts"}], "newCommentsOnMine": n}`
  - 새 글 = 읽기 가능 공간의 `live` 글, 작성자≠나, `created_at > seen.at`(행이 없으면 최근 7일).
  - 새 댓글 = 내 글에 달린 `live` 댓글, 작성자≠나, `created_at > seen('mine').at`.
- `POST /api/me/seen` `{"key":"space:notice"}` 또는 `{"key":"mine"}` — 공간 목록을 열 때·"내 글 소식"을 열 때 화면이 호출.
- 화면: 포털 메뉴 카드와 `board.html` 공간 목록에 숫자 배지. 30초 이상 간격으로만 다시 조회(폴링 최소).
- **본인만** 조회. 사무국 API·통계에 노출 금지. 사람 비활성화 시 그 사람의 `seen` 행 삭제(개인 데이터 · 감사 대상 아님).

### FR-EXT-03 일정·여정 (`events`)
- 설정 `events[]`: `{date:"YYYY-MM-DD", title, kind:"launch|lab|session|review|demo|other", note?}`. 설정 `sessions[]`의 날짜도 함께 보인다.
- `GET /api/events` (로그인) → 날짜순. 화면 `events.html` + 포털에 "다가오는 일정 3개".
- 바꾸려면 `app-settings.json`의 `events`를 고치고 앱 재시작(허용 키 추가 — `docs/07`).

### FR-EXT-04 이번 주 새 글 (`digest`)
- `GET /api/feed/recent?days=7` (로그인, `days` 1~30) → 읽기 가능 공간의 `live` 글을 **작성 시각 최신순**, 최대 50건 + 공간별 건수.
- 화면: 포털 "이번 주 새 글" 블록(5건) + `board.html?view=recent`.
- 사람별 묶음·작성자 건수 표시 금지.

### FR-EXT-08b 자료별 질문 스레드 (`materialThreads`)
- 공간 `material_qa`(설정 `spaces`에 추가 · 읽기 all · 쓰기 all · `acceptAnswers: true`).
- `posts.ref_kind='material'`, `ref_id=<자료 id>`, `ref_page=<쪽, 선택>`.
- `GET /api/materials/:id/threads` (로그인) · `POST /api/materials/:id/threads` `{"title","body","page"?}` — 자료가 `published`일 때만(아니면 404). 쪽 번호는 1..pages.
- 뷰어 옆 패널: 이 자료 질문 목록 · "이 쪽에 질문" 버튼(현재 쪽 자동 입력). 글은 `board.html`의 `material_qa`에서도 보인다.
- 감사: 일반 글과 같은 `post_create`.

### FR-EXT-10 내 저장함 (`bookmarks`)
- 표 `bookmarks(person_id, post_id, created_at)`.
- `GET /api/me/bookmarks` · `PUT /api/me/bookmarks/:postId` · `DELETE /api/me/bookmarks/:postId` — 읽기 권한 있는 글만 저장. 나중에 권한을 잃거나 글이 삭제·숨김되면 목록에 안내 문구로 표시.
- 본인만. 개인 정리 데이터라 실제 삭제 허용(감사 대상 아님).

### FR-EXT-11 키워드 태그 (`tags`)
- 표 `post_tags(post_id, tag)`. 고를 수 있는 태그 = 설정 `labs[].keywords` 합집합 + `tags.extra`. **자유 입력 없음.**
- 글 작성·수정 본문에 `"tags": ["Robot","Vision"]`(최대 `tags.maxPerPost` 기본 5). 수정 시 태그 목록은 통째로 교체(본문 판과 별개 · 메타데이터).
- `GET /api/tags` → 태그 목록과 Lab · `GET /api/spaces/:sid/posts?tag=Robot` · `GET /api/feed/recent?tag=`.
- 태그별 건수 표시는 허용(사람 아님). 나중 O05 스킬 태그가 같은 구조를 쓴다.

### FR-EXT-12 신고 (`reports`)
- 표 `reports`. `POST /api/posts/:id/report` `{"reason":"confidential|personal_info|evaluative|other","note"?: "≤500자"}` — 읽기 권한 있는 글·댓글. 같은 사람이 같은 글을 처리 전 중복 신고 불가(409). 1인 하루 10건(설정).
- 사유가 `moderation.immediateHideReasons`(기본 `confidential`·`personal_info`)면 즉시 `hidden`(+`hide_reason`=사유) · 감사 `post_auto_hide`.
- 사무국: `GET /api/admin/reports?open=1` · `POST /api/admin/reports/:id/resolve` `{"outcome":"hidden|kept","reason"?}` — `kept`면 자동 숨김을 복구. 감사 `report_create`·`report_resolve`.
- 신고자 신원은 **사무국만** 본다. 작성자에게는 "운영 규칙에 따라 숨김" 안내만. `note`도 개인정보 검사.
- 포털(office)에 "처리 대기 신고 n건" 배지.

### FR-EXT-13 도움됐어요 (`helpful`) — 결정 B8 후
- 표 `reactions(post_id, person_id, created_at)` 1인 1회 · 본인 취소 가능.
- `PUT|DELETE /api/posts/:id/helpful` · 글 **상세에서만** 건수 표시(목록에 없음).
- **금지(코드 리뷰 탈락 기준):** 건수로 정렬·필터 · "인기 글" · 작성자별 합계 · 누가 눌렀는지 표시 · 사무국 통계에 사람별 값.

### FR-EXT-14 사무국 간단 설문 (`surveys`) — 결정 B9 후
- 표 `surveys`·`survey_options`·`survey_votes`. 사무국이 만들고(제목·선택지 2~10개·마감 시각·복수 선택 여부), 대상 역할이 1회 응답(마감 전 변경 가능).
- 결과는 **선택지별 건수만**. 누가 무엇을 골랐는지 API로 내보내지 않는다(1인 1회 확인용으로만 `person_id` 저장). 결과 공개: 사무국만 / 마감 후 전원(설문별 설정).
- 선택지에 사람 이름·과제를 넣지 않는다(화면 경고 + 개인정보 패턴 검사). 평가·투표로 사람을 고르는 용도 금지.
- 화면 `surveys.html` + 포털 "진행 중 설문". 감사 `survey_create`·`survey_close`.

## 4. 감사 기록 동작 이름 (추가분)

`post_pin` · `post_unpin` · `post_accept` · `post_unaccept` · `qcard_answer` · `post_auto_hide` · `report_create` · `report_resolve` · `survey_create` · `survey_close`

(감사 기록하지 않는 것: 디렉터리 열람 · 알림 확인 · 저장함 · 태그 조회 · 도움됐어요 · 설문 응답 — 개인 행동 기록을 늘리지 않는다.)

## 5. 넣지 않는 것 (재확인)

| 기능 | 이유 |
|---|---|
| 좋아요 랭킹·인기 글·배지·포인트·레벨 | 헌법 1조 판정 금지 |
| 1:1 쪽지·채팅·실시간 접속자 표시 | WebSocket 등 구조 변경 · 사적 대화 관리 · Teams로 충분 |
| 파일·이미지 첨부 | 악성코드 검사 경로 미정 (헌법 8조) |
| 메일·메신저·푸시 알림 | 자동 발송 금지 · SMTP 비밀값 재등장 |
| AI 요약·추천·자동 분류 | 외부 AI 전송 금지 (Q6) |
| 사람별 활동 통계·출석률 | 개인 평가로 이어짐 |
| @멘션 | 알림 대상이 사람 단위로 늘고 명단 노출 경로가 됨 — 필요 시 별도 결정 |
