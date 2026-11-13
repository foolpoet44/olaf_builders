# 01. 요구사항

ID 규칙: `FR-<영역>-<번호>` 기능 · `NFR-<번호>` 비기능. 테스트는 같은 ID를 이름에 넣는다(`docs/09_TESTING.md`).
단계: 각 요구사항이 들어가는 로드맵 단계(`docs/10_ROADMAP.md`).

## 1. 기능 요구사항

### 1.1 플랫폼 (SYS) — P0

| ID | 요구사항 |
|---|---|
| FR-SYS-01 | `PORT`·`HOST` 환경변수로 listen한다. 기본값은 `8091`·`127.0.0.1` |
| FR-SYS-02 | `GET /healthz`는 프로세스가 살아 있으면 200과 `{status:"ok",app,release}`를 준다 |
| FR-SYS-03 | `GET /readyz`는 DB 열림·스키마 버전 일치·데이터/업로드 폴더 쓰기 가능·비밀 파일 읽힘을 확인해 200, 하나라도 실패하면 503 |
| FR-SYS-04 | 설정 파일 형식 오류·필수 값 누락이면 **시작을 중단**하고 원인(비밀값 제외)을 stderr에 쓴다 |
| FR-SYS-05 | 첫 실행 때 공유 폴더 하위 폴더와 `APP_CONFIG_FILE`과 같은 폴더의 `secrets.json`(세션 서명 키 · 리포 `config/`가 아님)을 만든다. 이미 있으면 건드리지 않는다 |
| FR-SYS-06 | SIGINT·SIGTERM·SIGBREAK(Windows) 수신 시 새 요청을 받지 않고, 진행 중 요청을 최대 10초 기다린 뒤 DB를 닫고 종료한다 |
| FR-SYS-07 | 매일 설정 시각(기본 03시)에 DB 백업 파일을 만들고 오래된 것을 보존 개수(기본 14) 밖에서 지운다 |
| FR-SYS-08 | 정적 파일은 `public/`에서만 제공한다. 그 밖의 폴더(소스·설정·데이터)는 어떤 URL로도 열리지 않는다 |
| FR-SYS-09 | 알 수 없는 `/api/*` 경로는 404 JSON. 화면 경로가 아닌 곳에 HTML을 200으로 돌려주지 않는다 |

### 1.2 인증·권한 (AUTH) — P1

| ID | 요구사항 |
|---|---|
| FR-AUTH-01 | 사용자는 접속 코드 하나로 로그인한다. 성공 시 HttpOnly 세션 쿠키를 받는다 |
| FR-AUTH-02 | 역할은 `builder`·`master`·`office` 셋. 세션 시간: builder·master 8시간, office 2시간(설정값) |
| FR-AUTH-03 | 틀린 코드는 접속 주소 해시당 10분에 20회까지. 넘으면 429. 맞는 시도는 세지 않는다 |
| FR-AUTH-04 | 로그아웃하면 세션을 서버에서 지운다 |
| FR-AUTH-05 | 비활성(`active=0`) 사용자·폐기된 코드로는 로그인할 수 없고, 기존 세션도 다음 요청에서 끊긴다 |
| FR-AUTH-06 | 모든 `/api/*`(로그인·헬스 제외)는 세션이 없으면 401, 역할이 맞지 않으면 403 |
| FR-AUTH-07 | 로그인 화면 외의 화면은 세션이 없으면 로그인 화면으로 보낸다 (화면 보호는 편의, 실제 보호는 API) |
| FR-AUTH-08 | 첫 화면(포털)은 역할별 메뉴를 보인다 |

### 1.3 사무국 도구 (ADM) — P1 (명령줄) · P3 (화면 일부)

| ID | 요구사항 |
|---|---|
| FR-ADM-01 | `tools/admin.js bootstrap OP-01 --name ...` — DB에 사무국이 한 명도 없을 때만 첫 사무국 계정+코드를 만든다 |
| FR-ADM-02 | `tools/admin.js import-roster <csv> --actor OP-01 [--dry-run]` — 명단 CSV를 검사해 사람을 추가·갱신한다. 오류가 하나라도 있으면 아무것도 저장하지 않는다 |
| FR-ADM-03 | 명단 검사: 필수 열 `person_id,role,name,title,lab,group`(lab·group **값**은 builder만 필수 · master는 `assigned`에 `;` 구분 담당 코드) · 인코딩 UTF-8(BOM 허용) · 사번 열(`employee_id`·`emp_no`·`사번`·`사원번호`)은 **버림** · 이메일 열도 **버림** · 진단 값 열(`gap`·`current`·`required`·`evidence`·`score`·`level`·`p2a`)이 있으면 **멈춤** · 값에 사번 패턴이 있으면 멈춤 · ID 형식(builder: 설정 패턴, master `^MS-\d{2,3}$`, office `^OP-\d{2,3}$`) · Lab·그룹 코드는 설정에 있어야 함 · 중복 ID 금지 |
| FR-ADM-04 | `issue <person_id>` — 새 접속 코드 발급(기존 코드 자동 폐기). 코드는 **화면에 한 번만** 출력 |
| FR-ADM-05 | `issue-all --role builder --out <파일>` — 대상 전원 발급, 결과를 지정 파일(공유 폴더 밖 금지 경고)로. 감사 기록 1줄 |
| FR-ADM-06 | `revoke <person_id>` · `deactivate <person_id>` |
| FR-ADM-07 | `list` — 사람 목록(ID순) · 코드 발급 여부 · 마지막 로그인 날짜(시각 아님). 코드 원문은 없음 |
| FR-ADM-08 | 모든 쓰기 명령은 `--actor`를 요구하고 감사 기록을 남긴다 |
| FR-ADM-09 | 화면에서 사무국은 사람 목록 보기·코드 재발급·비활성화를 할 수 있다 (P3) |

### 1.4 교육 자료 (MAT) — P2

| ID | 요구사항 |
|---|---|
| FR-MAT-01 | 로그인한 모든 역할은 `published` 자료 목록(제목·강사·세션·쪽 수)을 본다 |
| FR-MAT-02 | 쪽 보기는 쪽 이미지(webp)만 보낸다. PDF 원본은 서버에 없다 |
| FR-MAT-03 | 쪽 이미지 응답에 `Cache-Control: no-store`·`Content-Disposition: inline` · 화면은 우클릭 저장·드래그를 막는다(완전 차단 아님을 문서에 명시) |
| FR-MAT-04 | 사무국은 자료 꾸러미(zip: `manifest.json` + `p001.webp`...)를 올려 `draft`로 등록하고, `published`·`hidden`으로 바꾼다 |
| FR-MAT-05 | 꾸러미 검사: 쪽 수 ≤ 150 · 쪽 이미지 ≤ 2MB · 파일명 `p\d{3}\.webp`만 · webp 서명 확인 · zip 안 경로 이탈 거부 |
| FR-MAT-06 | `hidden`·`draft` 자료는 builder·master에게 404 |
| FR-MAT-07 | 자료별 열람 건수는 사무국만 본다. 사람별 열람 기록은 남기지 않는다 |
| FR-MAT-08 | 사무국 PC용 `tools/render-pdf`가 PDF → 워터마크 쪽 이미지 꾸러미를 만든다(서버 반입 안 함 · P2 후반, 선택) |

### 1.5 질문 카드 (QC) — P3

| ID | 요구사항 |
|---|---|
| FR-QC-01 | builder는 세션을 고르고 카드를 쓴다. **작성자는 로그인 신원**(성명 직접 입력 없음). 과제는 본인 과제로 자동 |
| FR-QC-02 | 방식 두 가지: `template`(하려는 일 5~120자 · 현재 제약 5~120자 · 확인할 질문 8~200자) · `free`(15~200자) |
| FR-QC-03 | 물음표(`?`·`？`)는 카드 전체에 1개까지 |
| FR-QC-04 | 낭독 문장(설정 `template.lead` 또는 `free.lead` + 질문)이 40초(초당 5자 환산)를 넘으면 거부 |
| FR-QC-05 | 사번 패턴·이메일·휴대전화 번호가 있으면 거부 |
| FR-QC-06 | 세션당 1인 3장까지 |
| FR-QC-07 | 본인은 자기 카드를 수정(새 판)·철회(상태 `withdrawn`)할 수 있다. 마감 뒤에는 불가 |
| FR-QC-08 | 마감 스위치(`qcards.closed=true`)면 작성·수정 API는 410, 화면은 마감 안내 |
| FR-QC-09 | 사무국은 세션 → Lab → 그룹 → 접수순으로 목록·한 장 크게 보기(←/→)를 쓴다. 순위 없음 |
| FR-QC-10 | 사무국은 카드 상태(`registered`·`selected`·`asked`·`followup`)와 Lab별 대표·예비 선정을 기록한다 |
| FR-QC-11 | 사무국은 취합본을 CSV(UTF-8 BOM)로 내려받는다. 감사 기록 `export` |
| FR-QC-12 | 검사 오류 메시지는 화면에 그대로 보여도 되는 문장만. 입력값을 되풀이하지 않는다 |

### 1.6 커뮤니티 (BRD) — P4

| ID | 요구사항 |
|---|---|
| FR-BRD-01 | 공간은 설정에서 펼친다: `notice`(1) · `lab_lounge/<Lab>`(Lab마다) · `group_board/<그룹>`(그룹마다) · `master_qa`(1) · `build_review`(1). (`challenge`·`knowledge`는 P5) · `material_qa`는 확장 `materialThreads`가 켜졌을 때만(P4.6 · 설정 `spaces[].feature`) |
| FR-BRD-02 | 열람·쓰기 판정은 `can(person, action, space)` 한 함수. **기본 거부**. 규칙: `all` · `lab` · `group` · `lab_scope`(설정 `lab_lounge_cross_lab_read`가 true면 전원 읽기) · `operator`(사무국만) |
| FR-BRD-03 | office는 모든 공간 읽기·쓰기. master는 담당 범위(설정 `master_scope`: lab·group·all)에 닿는 공간만 |
| FR-BRD-04 | 글 = 제목(≤200자) + 본문(≤20,000자, 일반 텍스트 · 줄바꿈 보존 · HTML 불허). 댓글 = 본문만, 한 단계 |
| FR-BRD-05 | 수정은 새 판. 화면은 최신판과 "수정됨" 표시 |
| FR-BRD-06 | 작성자 삭제 → 상태 `deleted`, 화면은 "작성자가 삭제한 글입니다." · 원본은 사무국만 |
| FR-BRD-07 | 사무국 숨김 → 상태 `hidden` + 사유 코드(`confidential`·`personal_info`·`evaluative`·`other`) 필수 · 복구 가능 |
| FR-BRD-08 | 목록 정렬은 최신순 또는 작성순만. 사람·활동량 정렬 없음. 좋아요·조회수 랭킹 없음 |
| FR-BRD-09 | 본문 검사(사번·이메일·휴대전화)에 걸리면 저장 거부 |
| FR-BRD-10 | 목록은 페이지당 20건, 제목·본문 단순 검색(`LIKE`) — 읽기 권한이 있는 공간 안에서만 |
| FR-BRD-11 | 이전 판 보기는 사무국만 |

### 1.7 커뮤니티 확장 (EXT) — P4.5 · P4.6 · 조건부

상세 명세는 `docs/13_COMMUNITY_EXTENSIONS.md` 3절. 모든 기능은 `features.<키>`로 켜고 끈다(꺼지면 API 404).

| ID | 키 | 요구사항 | 단계 |
|---|---|---|---|
| FR-EXT-01 | `templates` | 공간별 글쓰기 틀로 새 글 본문을 미리 채운다 | P4.5 |
| FR-EXT-02 | `directory` | 활성 멤버를 Lab→그룹→이름순으로 성명·직위·Lab·그룹(+과제명 선택)만 보인다 | P4.5 |
| FR-EXT-06 | `pin` | 사무국이 글을 공간 상단에 고정한다(공간당 상한) | P4.5 |
| FR-EXT-07 | `accept` | Q&A 공간에서 작성자·사무국이 답변 댓글을 채택하고 "해결됨"을 표시한다. 채택 집계·통계 금지 | P4.5 |
| FR-EXT-08a | `qcardAnswer` | 사무국이 질문 카드에서 Master Q&A 답변 글을 만들고, 카드와 글을 잇는다(카드당 1개) | P4.5 |
| FR-EXT-09 | `notifications` | 본인에게만 공간별 새 글 수·내 글 새 댓글 수를 보인다(사람·공간당 마지막 확인 시각만 저장) | P4.5 |
| FR-EXT-03 | `events` | 설정의 일정·세션을 날짜순으로 보인다 | P4.6 |
| FR-EXT-04 | `digest` | 읽기 가능 공간의 최근 글을 최신순으로 모아 보인다(사람별 묶음 금지) | P4.6 |
| FR-EXT-05 | `inviteText` | 코드 발급 시 복사용 안내 문안을 만든다(발송·저장 없음) | P4.6 |
| FR-EXT-08b | `materialThreads` | 공개 자료마다 쪽 번호를 지정할 수 있는 질문 스레드를 연다 | P4.6 |
| FR-EXT-10 | `bookmarks` | 본인 전용 글 저장함 | P4.6 |
| FR-EXT-11 | `tags` | 설정 키워드 목록에서만 고르는 글 태그 · 태그 필터 | P4.6 |
| FR-EXT-12 | `reports` | 글·댓글 신고 · 지정 사유는 즉시 숨김 · 사무국 처리(숨김 유지/복구) · 신고자는 사무국만 봄 | P4.6 |
| FR-EXT-13 | `helpful` | 1인 1회 "도움됐어요" · 상세에서 건수만 · 정렬·통계·명단 금지 | 조건부(B8) |
| FR-EXT-14 | `surveys` | 사무국 간단 설문 · 결과는 선택지별 건수만 · 사람·과제 선택지 금지 | 조건부(B9) |
| FR-EXT-00 | — | 확장 기능 추가는 새 마이그레이션(표·칸 추가만)·새 라우트 파일·설정 키로만 한다. 기존 표·칸·트리거·라우트 동작을 바꾸지 않는다 | 공통 |

## 2. 비기능 요구사항

| ID | 요구사항 |
|---|---|
| NFR-01 | 서버에 설치 프로그램을 실행하지 않는다. 포터블 Node zip + 릴리스 zip 압축 해제만 |
| NFR-02 | 운영 npm 의존성 `express` 하나. 네이티브 모듈 0 |
| NFR-03 | 빌드 단계 0. `npm ci --omit=dev` 뒤 바로 실행 |
| NFR-04 | 동시 사용자 50명에서 일반 API p95 300ms 이하(같은 PC 기준 · 쪽 이미지 제외) |
| NFR-05 | 서비스 재시작·릴리스 교체 후 데이터·업로드·설정 유지 |
| NFR-06 | 복구 목표: 마지막 일일 백업 시점(RPO ≤ 24h) · 복원 작업 15분 이내(RTO) |
| NFR-07 | 한글·공백 포함 입력, UTF-8 응답, 새로고침·직접 URL 정상 |
| NFR-08 | 로그에 접속 주소·쿠키·코드·본문·성명을 남기지 않는다. 오류는 요청 ID와 오류 종류만 |
| NFR-09 | 오프라인 동작: 외부 URL(CDN·폰트·API) 호출 0 |
| NFR-10 | 브라우저: 사내 표준 Edge/Chrome 최신. IE 미지원 |
| NFR-11 | 모든 업무 규칙 함수는 HTTP 없이 단위 테스트 가능 (`src/domain/`) |
| NFR-12 | 로그 파일은 NSSM 회전(10MB) + 앱 시작 시 30일 넘은 회전 파일 정리 |
