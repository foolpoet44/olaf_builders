# 04. API 명세

## 1. 공통 규칙

- 기준 URL: 같은 출처 상대 경로 `/api/...`. 요청·응답 본문은 `application/json; charset=utf-8`(자료 업로드·이미지·CSV 제외).
- 인증: 쿠키 `olaf_session`. 표의 **권한** 칸: `공개` · `로그인` · 역할 이름(`office` 등).
- 쓰기 요청(POST/PUT/PATCH/DELETE)은 `Origin`(없으면 `Referer`)의 호스트가 `Host`와 같아야 한다. 다르면 403 `bad_origin`.
- JSON 본문 상한 64KB(자료 업로드 제외). 초과 413.
- 응답 공통 머리글: `Cache-Control: no-store`(API) · 보안 머리글(`docs/06_SECURITY.md`).

### 성공 응답

```json
{ "ok": true, "data": { ... } }
```

### 오류 응답

```json
{ "ok": false, "error": { "code": "validation", "message": "화면에 보여도 되는 문장", "problems": ["..."] } }
```

| 상태 | code | 언제 |
|---|---|---|
| 400 | `validation` | 입력 검사 실패 (`problems` 배열) |
| 400 | `bad_request` | JSON 파싱 실패 · 필수 파라미터 없음 |
| 401 | `login_required` | 세션 없음·만료 |
| 401 | `bad_code` | 로그인 코드 틀림 |
| 403 | `forbidden` | 역할·공간 권한 없음 |
| 403 | `bad_origin` | 출처 검사 실패 |
| 404 | `not_found` | 없음 (권한 없는 숨김 자원 포함 — 존재를 숨긴다) |
| 409 | `conflict` | 동시 수정(판 번호 불일치) · 중복 |
| 410 | `closed` | 질문 카드 마감 |
| 413 | `too_large` | 본문 상한 초과 |
| 429 | `rate_limited` | 횟수 제한 (`Retry-After` 초) |
| 500 | `internal` | 예외 (메시지 고정: "일시적인 오류입니다", 요청 ID 포함) |
| 503 | `not_ready` | DB·설정 미준비 |

목록 페이지네이션: 쿼리 `page`(1부터) · 응답 `data.items` · `data.page` · `data.pageSize`(20) · `data.total`.

## 2. 헬스 (P0)

| 메서드·경로 | 권한 | 응답 |
|---|---|---|
| `GET /healthz` | 공개 | 200 `{"status":"ok","app":"olaf-builders","release":"20261120-01"}` (`ok` 래퍼 없음 — 배포 계약 형식) |
| `GET /readyz` | 공개 | 200 `{"status":"ready","app":…,"release":…}` · 503 `{"status":"not_ready","app":…,"release":…,"checks":["db"]}` (실패 항목 **이름만**) |

`checks` 이름: `config` · `db` · `schema` · `data_dir` · `upload_dir` · `secrets`. 경로·오류 원문은 넣지 않는다.

## 3. 인증 (P1)

| 메서드·경로 | 권한 | 요청 | 응답 |
|---|---|---|---|
| `POST /api/auth/login` | 공개 | `{"code":"ABCD-EFGH-JKLM"}` | 200 `data:{id,name,role,menu}` + `Set-Cookie` · 401 `bad_code` · 429 |
| `POST /api/auth/logout` | 로그인 | — | 200 (쿠키 삭제) |
| `GET /api/me` | 로그인 | — | 200 `data:{id,name,title,role,lab,grp,menu,features:{qcardsClosed}}` |
| `GET /api/config/public` | 공개 | — | 200 `data:{securityLabel, brand:{community,messages}, cohort:{name}, labs:[{code,name,groups}]}` — 비밀·사람 없음, 로그인 화면용 |

`menu` 예: `[{"key":"materials","label":"교육 자료","href":"/materials.html"}, …]` — 역할별 목록은 설정 `menus`에서.

## 4. 교육 자료 (P2)

| 메서드·경로 | 권한 | 응답·동작 |
|---|---|---|
| `GET /api/materials` | 로그인 | `published`만. `items:[{id,title,lecturer,session,pages}]` (office는 `?all=1`로 전 상태 + `status,views`) |
| `GET /api/materials/:id` | 로그인 | 한 건 메타. 비공개면 builder·master 404. 호출 시 `views+1` (office 제외) |
| `GET /api/materials/:id/pages/:n` | 로그인 | `image/webp` 원본 바이트. `Content-Disposition: inline` · `Cache-Control: no-store` · `Cross-Origin-Resource-Policy: same-origin` |
| `POST /api/admin/materials` | office | 본문 `application/zip`(≤ 300MB 설정값) — 꾸러미 등록, 201 `data:{id,pages,status:"draft"}` · 400 `problems` |
| `PATCH /api/admin/materials/:id` | office | `{"status":"published"|"hidden"|"draft","title"?,"lecturer"?,"session"?}` |

### 자료 꾸러미 형식 (zip)

```text
manifest.json   {"title":"…","lecturer":"성명 (소속)","session":"DT","pages":33}
p001.webp … p033.webp
```

검사: `manifest.pages` = 실제 쪽 수 · 파일명 패턴 · webp 서명(`RIFF....WEBP`) · 쪽당 ≤ 2MB · 디렉터리 항목·`..`·절대경로 거부 · 그 밖의 파일 거부.

## 5. 질문 카드 (P3)

| 메서드·경로 | 권한 | 요청·응답 |
|---|---|---|
| `GET /api/qcards/form` | builder | `data:{closed, sessions:[{code,title,date}], me:{challenge,lab,grp}, rules:{…글자 수·초…}, formats, lead}` · 마감이면 `{closed:true, message}`만 |
| `GET /api/qcards/mine` | builder | 내 카드 최신판 목록 |
| `POST /api/qcards` | builder | `{"session":"DT","format":"template","situation":"…","constraint":"…","ask":"…"}` → 201 `data:{id,sentence,seconds}` · 400 `problems` · 410 |
| `PUT /api/qcards/:id` | builder(본인) | 위 본문 + `"ver": <현재판>` → 새 판 · 판 불일치 409 · 410 |
| `POST /api/qcards/:id/withdraw` | builder(본인) | 상태 `withdrawn` · 410 |
| `GET /api/admin/qcards` | office | `?session=&lab=&status=` · 정렬 세션→Lab→그룹→접수순 고정 · `items:[{id,author:{id,name,title},lab,grp,status,sentence,seconds,ver,createdAt}]` |
| `GET /api/admin/qcards/:id/versions` | office | 판 전체 |
| `PATCH /api/admin/qcards/:id` | office | `{"status":"selected"|"asked"|"followup"|"registered"}` |
| `POST /api/admin/qcards/:id/select` | office | `{"slot":"대표"|"예비"}` — 같은 세션·Lab·칸의 기존 선정은 `active=0` |
| `GET /api/admin/qcards/export.csv` | office | `text/csv; charset=utf-8` + BOM · 열: 세션,Lab,그룹,접수시각,케이스ID,성명,직위,상태,선정,낭독문장 · 감사 `export` |
| `PATCH /api/admin/settings/qcards` | office | `{"closed":true|false}` → `app-settings.json` 갱신(원자적 쓰기) · 감사 `setting_change` |

## 6. 커뮤니티 (P4)

| 메서드·경로 | 권한 | 요청·응답 |
|---|---|---|
| `GET /api/spaces` | 로그인 | 읽기 가능한 공간만 `items:[{id,label,canWrite,postCount}]` (설정 순서 고정) |
| `GET /api/spaces/:sid/posts` | 읽기 권한 | `?page=&q=` · `items:[{id,title,author:{id,name},status,createdAt,updatedAt,edited,commentCount}]` · `deleted`는 제목 대신 안내 문구, `hidden`은 office에게만 보임 |
| `POST /api/spaces/:sid/posts` | 쓰기 권한 | `{"title":"…","body":"…"}` → 201 |
| `GET /api/posts/:id` | 읽기 권한 | 글 최신판 + 댓글(작성순) |
| `PUT /api/posts/:id` | 작성자 | `{"title"?,"body","ver"}` → 새 판 · 409 |
| `DELETE /api/posts/:id` | 작성자 · office | 상태 `deleted` (행 유지) |
| `POST /api/posts/:id/comments` | 공간 쓰기 권한 | `{"body":"…"}` → 201 · 댓글의 댓글 불가(400) |
| `POST /api/admin/posts/:id/hide` | office | `{"reason":"confidential"|"personal_info"|"evaluative"|"other"}` |
| `POST /api/admin/posts/:id/restore` | office | `live`로 |
| `GET /api/admin/posts/:id/versions` | office | 판 전체 (삭제·숨김 포함) |

`:sid`에는 `/`가 들어가므로 URL 인코딩(`lab_lounge%2FPA`)으로 받는다.

## 7. 사무국 공통 (P1·P3)

| 메서드·경로 | 권한 | 내용 |
|---|---|---|
| `GET /api/admin/people` | office | ID순 · `items:[{id,role,name,title,lab,grp,active,hasCode,lastLoginDay}]` · 감사 `view_operator_screen` |
| `POST /api/admin/people/:id/code` | office | 새 코드 발급 → `data:{code}` **한 번만** · 감사 `code_issue` |
| `POST /api/admin/people/:id/deactivate` | office | `active=0` · 코드 폐기 · 세션 삭제 |
| `GET /api/admin/audit` | office | `?page=` 최신순 · 감사 `view_operator_screen` |
| `GET /api/admin/stats` | office | 건수만: 사람(역할별)·자료·카드(세션·Lab별)·글(공간별) — **사람별 표 없음** |

## 8. 감사 기록 동작 이름

`login_fail_limited` · `code_issue` · `code_revoke` · `person_deactivate` · `roster_import` · `material_upload` · `material_status` · `qcard_create` · `qcard_edit` · `qcard_withdraw` · `qcard_status` · `qcard_select` · `export` · `setting_change` · `post_create` · `post_edit` · `post_delete` · `post_hide` · `post_restore` · `view_operator_screen` · `migrate` · `backup` · `import_legacy`

확장 기능(9절): `post_pin` · `post_unpin` · `post_accept` · `post_unaccept` · `qcard_answer` · `post_auto_hide` · `report_create` · `report_resolve` · `survey_create` · `survey_close`

로그인 성공·실패 자체는 감사에 쓰지 않는다(`last_login` 날짜만). 횟수 제한에 걸리면 `login_fail_limited` 1줄(대상 없음).

## 9. 커뮤니티 확장 API (P4.5 · P4.6 · 조건부)

상세 동작·금지 사항은 `docs/13_COMMUNITY_EXTENSIONS.md`. 모든 경로는 `featureGate('<키>')` 뒤에 있다 — 기능이 꺼져 있으면 **404**.
`/api/me` 응답의 `features` 객체에 켜진 기능 키가 모두 실린다(`{qcardsClosed, templates, directory, …}`).

### P4.5

| 키 | 메서드·경로 | 권한 | 요청·응답 |
|---|---|---|---|
| `templates` | (`GET /api/spaces` 항목에 `template: ["Problem", …]` 추가) | 로그인 | — |
| `directory` | `GET /api/directory` | 로그인 | `groups:[{label:"Physical AI · PA-1", people:[{id,name,title,lab,grp,challenge?}]}]` — Lab→그룹→이름 고정, 활성만 |
| `pin` | `POST /api/admin/posts/:id/pin` · `DELETE …/pin` | office | 글·`live`만 · 공간당 상한 초과 409 |
| `pin` | (`GET /api/spaces/:sid/posts` 응답에 `pinned:[…]` 별도 배열 추가 · 일반 `items`에서는 제외) | 읽기 권한 | — |
| `accept` | `POST /api/posts/:id/accept` `{"commentId":n}` · `DELETE /api/posts/:id/accept` | 글 작성자 · office | `acceptAnswers` 공간만(아니면 400) · 그 글의 `live` 댓글만 · 목록 항목에 `solved:true`, 상세에 `acceptedCommentId` |
| `qcardAnswer` | `POST /api/admin/qcards/:id/answer-post` `{"title"?,"body"}` | office | 201 `data:{postId}` · 이미 있으면 409 · 본문 앞 `【질문】 <낭독 문장>` 자동 · 카드 상태 `followup` |
| `qcardAnswer` | (`GET /api/qcards/mine`·`GET /api/admin/qcards` 항목에 `answerPostId` 추가) | — | — |
| `notifications` | `GET /api/me/notifications` | 로그인 | `data:{spaces:[{id,newPosts}], newCommentsOnMine}` — 본인만 |
| `notifications` | `POST /api/me/seen` `{"key":"space:<id>"|"mine"}` | 로그인 | 200 · 읽기 권한 없는 공간 키 403 |

### P4.6

| 키 | 메서드·경로 | 권한 | 요청·응답 |
|---|---|---|---|
| `events` | `GET /api/events` | 로그인 | `items:[{date,title,kind,note?}]` 날짜순 (설정 `events` + `sessions`) |
| `digest` | `GET /api/feed/recent?days=7&tag=` | 로그인 | `items:[{id,spaceId,spaceLabel,title,author:{id,name},createdAt}]` 최신순 ≤50 · `counts:{<spaceId>:n}` |
| `inviteText` | (`POST /api/admin/people/:id/code` 응답에 `inviteText` 추가) | office | 저장하지 않음 |
| `materialThreads` | `GET /api/materials/:id/threads` | 로그인 | 그 자료의 `material_qa` 글 목록(`page` 포함) · 비공개 자료 404 |
| `materialThreads` | `POST /api/materials/:id/threads` `{"title","body","page"?}` | 로그인 | 201 · `page` 1..pages · 본문 검사 동일 |
| `bookmarks` | `GET /api/me/bookmarks` · `PUT /api/me/bookmarks/:postId` · `DELETE …/:postId` | 로그인 | 읽기 권한 없는 글 PUT 404 |
| `tags` | `GET /api/tags` | 로그인 | `items:[{tag,lab,count}]` (`count`는 읽기 가능 공간 기준 글 수) |
| `tags` | (글 작성·수정 본문에 `tags: []` · 목록 쿼리 `?tag=`) | 쓰기 권한 | 목록 밖 태그·상한 초과 400 |
| `reports` | `POST /api/posts/:id/report` `{"reason","note"?}` | 읽기 권한 | 201 `data:{autoHidden}` · 처리 전 중복 409 · 하루 상한 429 |
| `reports` | `GET /api/admin/reports?open=1&page=` | office | `items:[{id,post:{id,spaceId,title},reporter:{id,name},reason,note,autoHidden,createdAt,outcome}]` |
| `reports` | `POST /api/admin/reports/:id/resolve` `{"outcome":"hidden"|"kept","reason"?}` | office | `kept`면 자동 숨김 복구 · 같은 글의 다른 미처리 신고도 함께 처리 |

### 조건부 (B8 · B9 승인 후)

| 키 | 메서드·경로 | 권한 | 요청·응답 |
|---|---|---|---|
| `helpful` | `PUT /api/posts/:id/helpful` · `DELETE …/helpful` | 읽기 권한 | `data:{count, mine}` · 상세 응답에만 `helpful:{count,mine}` — 목록·정렬·통계에 없음 |
| `surveys` | `GET /api/surveys` | 로그인 | 내 역할 대상 설문 · `{id,title,closesAt,status,multi,options,myChoice}` |
| `surveys` | `PUT /api/surveys/:id/vote` `{"options":[1]}` | 대상 역할 | 마감 후 410 |
| `surveys` | `GET /api/surveys/:id/result` | office · (`after_close`면 마감 후 대상 역할) | `options:[{no,label,count}]` · 응답자 목록 **없음** |
| `surveys` | `POST /api/admin/surveys` · `POST /api/admin/surveys/:id/close` | office | 선택지 2~10 · 개인정보 패턴 검사 |
