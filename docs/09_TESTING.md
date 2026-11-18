# 09. 테스트

## 1. 전략

| 층 | 도구 | 대상 | 데이터 |
|---|---|---|---|
| 단위 | `node --test` | `src/domain/*` · `src/config.js` · `src/lib/*` | 순수 입력 |
| 저장소 | `node --test` | `src/repo/*` · 트리거 · 마이그레이션 | `:memory:` DB 또는 임시 파일 |
| HTTP | `node --test` + `fetch` | 라우트·권한·오류 형식 | `createApp`에 메모리 DB 주입 · `listen(0)` |
| 배포 스크립트 | 수동 + `-DryRun` | `deploy/*.ps1` | Windows 개발 PC |
| 인수 | 체크리스트 (4절) | 대상 서버 | 가짜 데이터 |

규칙
- 테스트 이름에 요구사항 ID를 넣는다: `test('FR-QC-03 물음표 2개면 거부', …)`.
- 가짜 사람만: `TEST-001`·`TEST-002`(builder), `MS-01`, `OP-01` · 이름 `가나다`·`라마바` 같은 명백한 가명.
- 픽스처에 6~7자리 숫자를 그대로 쓰지 않는다(사번 검사 테스트는 `'1'.repeat(7)`처럼 실행 중 만든다).
- 시계는 `clock` 주입으로 고정. 실제 시간·네트워크·외부 파일에 의존하지 않는다.
- `npm test` = `node --test test/`. Windows·개발 PC에서 통과해야 한다.

```text
test/
├─ helpers.js            makeApp({cfgOverride}) → {base, db, close, loginAs(id)}
├─ fixtures/roster_ok.csv · roster_bad_*.csv · material_ok.zip(작은 webp 2장)
├─ unit/ privacy · qcard · spaces · roster · board · materials · config · paths · zip
├─ repo/ triggers · migrate · backup
├─ http/ health · auth · materials · qcards · board · admin · security
└─ ext/  directory · pin · accept · qcard-answer · notifications · digest · invite · material-threads · bookmarks · tags · reports · (helpful · surveys) · feature-off
```

## 2. 필수 단위 테스트 (고정 예제)

### 질문 카드 낭독 시간 — 서버·화면 일치 확인용

설정 기본값(`charsPerSecond: 5`), 과제명 `"설비 예지보전"`:

| 입력 | 문장 | 공백 제외 글자 수 | 초 |
|---|---|---|---|
| free · ask=`"현장 데이터가 부족할 때 시뮬레이션으로 보완한 사례가 있나?"` | `내 과제 「설비 예지보전」 관련 — 현장 데이터가 부족할 때 시뮬레이션으로 보완한 사례가 있나?` | **40** | **8** |

(2026-11-13 Node 24.19로 계산 확인: 공백 제외 `s.replace(/\s/g,'').length` = 40 → `ceil(40/5)` = 8.)
경계 테스트용으로 공백 제외 200자 문장 → 40초 통과, 201자 → 41초 거부를 함께 고정한다.

> 권장: 낭독 문장 조립·초 계산·글자 수 검사는 **`public/assets/js/shared/qcard-rules.js` 하나**에 두고 서버(`src/domain/qcard.js`)가 이를 import한다. 화면과 서버 규칙이 갈라지지 않는다. (`public/`이므로 비밀·DB 접근이 없어야 한다.)

### 기타 필수

| ID | 케이스 |
|---|---|
| FR-QC-03 | `?` 2개 · `？` 1개+`?` 1개 → 거부 |
| FR-QC-04 | 경계: 정확히 40초 통과 · 41초 거부 |
| FR-QC-05 | 사번 7자리·6자리 거부 · `#171717` 통과 · 8자리 날짜 `20261020` 통과 · 이메일 · `010-1234-5678` 거부 |
| FR-ADM-03 | 사번 열 → 버림(경고) · 이메일 열 → 버림 · `gap` 열 → 전체 거부 · 값에 사번 패턴 → 거부 · 모르는 Lab → 거부 · 중복 ID → 거부 · BOM 있는 UTF-8 읽기 |
| FR-BRD-02 | `can()` 표 테스트: 역할 3 × 공간 5종 × read/write × `labLoungeCrossLabRead` true/false × master scope lab/group/all |
| FR-MAT-05 | `../p001.webp` · 절대경로 · 폴더 항목 · `p1.webp` · png 내용을 webp 이름으로 · 151쪽 · 2MB 초과 → 거부 |
| FR-SYS-04 | 덮어쓰기 파일 JSON 오류 · 모르는 최상위 키 · `readAloudSeconds: 0` → 시작 거부 |
| 경로 | `safeJoin(base,'..','x')` throw · Windows 드라이브 문자 `C:\x` throw |

## 3. 필수 저장소·HTTP 테스트

| ID | 케이스 |
|---|---|
| 트리거 | `audit_log` UPDATE/DELETE 실패 · `post_versions` UPDATE 실패 · `posts` DELETE 실패 · `posts.author_id` UPDATE 실패 |
| 마이그레이션 | 빈 DB → 최신 · 최신 → 그대로 · 코드보다 높은 `user_version` → 시작 거부 · 적용 전 백업 파일 생성 |
| 백업 | `VACUUM INTO` 파일 열림·건수 같음 · 보존 개수 초과분 삭제 · `pre-migrate-*` 유지 |
| FR-SYS-02/03 | `/healthz` 형식 · DB 닫으면 `/readyz` 503 + `checks:["db"]` |
| FR-SYS-08 | `/src/server.js` · `/config/app.json` · `/package.json` · `/%2e%2e/` → 404 |
| FR-SYS-09 | `/api/없음` → 404 JSON |
| FR-AUTH-01/03 | 로그인 성공 쿠키 속성 · 틀린 코드 20회 401, 21회 429 · 맞는 코드는 미집계 |
| FR-AUTH-05 | 비활성화 후 기존 쿠키로 `/api/me` 401 |
| FR-AUTH-06 | 권한 표: 모든 `/api/admin/*`를 builder·master로 → 403 · 무세션 → 401 (라우트 목록을 앱에서 뽑아 자동 순회) |
| 출처 | `Origin: http://evil` POST → 403 |
| FR-QC-06 | 4번째 카드 400 |
| FR-QC-08 | 마감 후 POST·PUT → 410 · `/api/qcards/form` → `{closed:true}` |
| FR-QC-07 | 남의 카드 PUT → 403 · 판 번호 불일치 409 |
| FR-BRD-06/07 | 삭제 글 builder 목록에 안내 문구 · 숨김 글 builder에게 안 보임 · office에게 사유와 보임 |
| FR-MAT-06 | draft·hidden 자료 builder `GET /api/materials/:id` → 404 |
| NFR-08 | 테스트 중 수집한 로그 출력에 접속 주소·코드·본문 문자열 없음 |
| 감사 | 각 쓰기 동작 뒤 `audit_log` 1줄 (동작 이름 표 `docs/04_API_SPEC.md` 8절) |

## 3-1. 커뮤니티 확장 테스트 (`docs/13`)

| ID | 케이스 |
|---|---|
| FR-EXT-00 | 모든 확장 기능 키를 false로 → 확장 경로 전부 404 · 기존 P0~P4 테스트 전부 그대로 통과(회귀 없음) · 기존 응답에 확장 칸이 붙지 않음 |
| FR-EXT-00 | 마이그레이션 001만 있는 DB 사본 → 002·003 적용 → 기존 글·카드 건수·내용 동일 · `integrity_check` ok |
| FR-EXT-01 | `template` 있는 공간의 `GET /api/spaces` 항목에 배열 · 없는 공간엔 없음 |
| FR-EXT-02 | 정렬 Lab→그룹→이름 고정 · 비활성 제외 · 응답 칸이 허용 목록과 정확히 같음(키 집합 비교) · `showChallenge:false`면 과제명 없음 |
| FR-EXT-06 | builder 고정 시도 403 · 댓글 고정 400 · 공간당 4번째 409 · 고정 글은 `pinned`에만 |
| FR-EXT-07 | `acceptAnswers` 아닌 공간 400 · 다른 글의 댓글 채택 400 · 남의 글 채택 403 · 채택 댓글 삭제 후 `solved:false` |
| FR-EXT-08a | 답변 글 본문이 `【질문】 <카드 문장>`으로 시작 · 질문자 성명 없음 · 카드 상태 `followup` · 두 번째 요청 409 · 참여자 `mine`에 `answerPostId` |
| FR-EXT-09 | 남의 글만 집계 · `seen` 뒤 0 · 읽기 권한 없는 공간 미포함 · 다른 사람 알림 조회 경로 없음 · 비활성화 시 `seen` 삭제 |
| FR-EXT-04 | 권한 밖 공간 글 미포함 · 최신순 · `days` 범위 밖 400 |
| FR-EXT-05 | 문안에 코드 포함 · `audit_log`·로그에 코드 없음 |
| FR-EXT-08b | 비공개 자료 스레드 404 · `page` 0·초과 400 · 글이 `material_qa`에 생김 |
| FR-EXT-10 | 읽기 권한 없는 글 저장 404 · 삭제된 글은 안내 문구로 |
| FR-EXT-11 | 목록 밖 태그 400 · 6개 400 · 수정 시 교체 · `?tag=` 필터가 권한 밖 공간을 보이지 않음 |
| FR-EXT-12 | `personal_info` 신고 즉시 `hidden` · `other`는 그대로 · 중복 409 · 11번째 429 · `kept` 처리 시 복구 · builder 응답에 신고자 없음 |
| FR-EXT-13 | (B8 후) 목록 응답에 `helpful` 없음 · 정렬 파라미터 무시 · 누가 눌렀는지 응답 없음 |
| FR-EXT-14 | (B9 후) 결과에 응답자 정보 없음 · 마감 후 투표 410 · 선택지 개인정보 패턴 400 · 004 미적용 DB에서 기능 켜면 시작 거부 |
| FR-EXT-15 | (`test/ext/intake.test.js` 8건) 단위: 길이 경계(min−1·min·max·max+1)·필수 칸·성명 길이·사번 7자리·이메일 거부 · 오류 문장에 입력값 미포함 · dedupe 키 정규화(공백·대소문자) |
| FR-EXT-15 | 로그인 없이 `POST /api/intake` 201 · 같은 성명·본문 재전송 200 + 같은 `ref` · 행 1건 · 400 시 저장 안 됨(길이·필수·휴대전화) · 표에 `email`·`employee_id`·`phone` 칸 없음 · 감사 `intake_create` 행위자 `ANON` |
| FR-EXT-15 | 권한: 비로그인 `GET /api/admin/intake` 401 · builder 조회·`PATCH` 403 · 현황 `total`·제출자 이름순 건수 · `items` id 오름차순(접수순) · `?affiliation=` 필터 · 응답 JSON에 `rank·score·top·best·recommend` 키 없음 |
| FR-EXT-15 | 숨김: `PATCH status=hidden` 200 · 잘못된 값 400 · 목록·건수에서 제외 · `?hidden=1`이면 포함 · 감사 `intake_status` · DB 직접 본문 `UPDATE`·`DELETE` 거부(트리거) |
| FR-EXT-15 | `intake.rateLimit.max=2`로 3번째 429 + `Retry-After` · `features.intake=false` → `POST /api/intake`·`GET /api/intake/form` 404 |
| 원칙 | 코드 정적 검사: `ORDER BY`에 `count`·`helpful`·`reactions`가 들어간 사람·글 목록 쿼리 없음 (`grep` 기반 테스트) |

## 4. 인수 테스트 (대상 서버 · 운영자와 함께)

`reference/DEPLOYMENT_ENVIRONMENT.md` 11절을 OLAF에 맞춘 표. 결과는 `ACCEPTANCE_<release>.md`에 PASS/FAIL/미검증으로 기록한다.

| # | 항목 | PASS 기준 |
|---|---|---|
| A1 | `install.ps1 -DryRun` | 변경 없음 · 검사 결과 정확 |
| A2 | 설치·전경 시험 | 단계 8 통과 |
| A3 | 서비스 시작 · `check.ps1` | C1~C9 PASS |
| A4 | 로그인(사무국·builder·master) · 역할별 메뉴 | 일치 |
| A5 | 권한 거부 | builder로 사무국 화면·API 거부 |
| A6 | 자료 업로드·공개·열람·숨김 | 동작 · 숨김 후 404 |
| A7 | 질문 카드 작성·수정·마감 | 규칙대로 · 마감 410 |
| A8 | 글·댓글·수정·삭제·숨김 | 판·상태 규칙대로 |
| A9 | 한글·공백·이모지 입력 · 새로고침 · 직접 URL | 정상 |
| A10 | 서비스 재시작 후 데이터·업로드·설정 유지 | 유지 |
| A11 | 업데이트 → 실패 유도 → 자동 롤백 | 이전 릴리스로 복귀 |
| A12 | 백업 파일 생성 · 복원 스크립트로 복원 | 건수 일치 |
| A13 | 다른 허용 PC 접속 · 미허용 PC 차단 | (B3 승인 시) |
| A14 | 기존 `prihr-main`·HR 포털 | 서비스·포트·대표 화면 전후 동일 |
| A15 | 로그 점검 | 접속 주소·코드·본문 없음 |
| A16 | 재부팅 복구 | 승인된 점검 시간에만 · 미수행이면 "미검증" |
| A17 | (확장) 002·003 마이그레이션 업데이트 | `pre-migrate` 백업 생성 · 기존 데이터 유지 · 실패 유도 시 자동 롤백 |
| A18 | (확장) 알림 배지·답변 채택·질문 카드 답변 글·신고 처리 | 시나리오대로 동작 · 사무국 외 신고자 비노출 |
| A19 | (확장) 기능 하나 끄고 재시작 | 메뉴·블록 사라짐 · API 404 · 다른 기능 정상 |
| A20 | (확장) 질문 접수: 다른 허용 PC 브라우저에서 `/ask.html`(로그인 없음)로 제출 → 사무국 `/admin/intake.html`에서 현황·카드 확인 | 접수번호 표시 · 현황 건수 일치 · 한글·이모지 정상 · 비로그인으로 사무국 API 401 |
| A21 | (확장) 카드 전체 화면 공유(브라우저 Fullscreen API) | `←`/`→` 이동 · `Esc` 닫기 · `A` 작성자 가리기 · 숨김 후 목록에서 빠짐 — **E2E 자동 시험이 없으므로 사람이 확인** |
| A22 | (확장) 무로그인 위험 확인(B13) | 11번째 연속 제출 429 · 사내망 밖 접속 차단(A13과 함께) · 타인 이름 제출 가능함을 사무국이 인지 · 미허용이면 `features.intake:false`로 개통 |

"Running" · "200 응답"만으로 PASS를 매기지 않는다.
