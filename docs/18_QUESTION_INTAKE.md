# 18. 질문 접수·질문 카드 리뷰 (intake) — 설계안

상태: **제안** (구현 전 · 결정 D1 회신 필요) · 확장 기능 `features.intake` · 요구사항 ID `FR-INT-nn`
성격: `docs/13` 1절의 추가 규칙을 따르는 **추가형 기능**. P3 질문 카드(`qcards`)는 고치지 않는다.

---

## 0. 한 문단 요약

이 기능은 두 개의 화면과 한 개의 표로 끝난다. 참여자는 **소속·성명·직급·질문** 네 칸만 채워 낸다. 사무국은 **제출 현황**(건수)을 보고, 질문을 **카드 한 장씩** 넘기며 검토한다. 서버는 이미 있는 것(Express 5 + `node:sqlite` + NSSM 서비스)을 그대로 쓴다. Vercel·Supabase 같은 외부 서비스는 필요 없고, 새 의존성은 0이다. CLAUDE.md B절(사내 전용·단일 프로세스·빌드 단계 없음)과도 처음부터 맞는다.

## 1. 설계 철학 — 접수의 마찰은 낮게, 검토의 시선은 공정하게

질문을 모으는 일은 두 개의 서로 다른 심리 순간을 다룬다.

**쓰는 순간**에는 마찰이 질문의 질을 깎는다. 칸이 많을수록 사람은 "무엇을 써야 하는지"를 고민하느라 정작 "무엇이 궁금한지"를 잃는다. 그래서 입력은 네 칸으로 제한하고, 질문 칸 하나에 모든 무게를 싣는다. P3의 3칸 템플릿(하려는 일·현재 제약·질문)은 낭독이라는 목적이 있어서 정당했지만, 이 기능의 목적은 *수집*이므로 구조화를 사무국의 리뷰 단계로 미룬다.

**읽는 순간**에는 질문자의 직급과 이름이 질문의 무게를 왜곡한다(후광 효과). 그래서 카드 리뷰 화면은 질문을 크게, 질문자를 작게 보여 주고, **작성자 가리기 토글**을 둔다. 가린 채로 한 바퀴 읽고, 다시 켜서 맥락을 확인하는 두 번의 읽기가 가능하다. 이것은 CLAUDE.md A1(판정 금지)의 정신과도 같은 방향이다 — 사람이 판단하되, 시스템은 판단을 부추기는 장치(순위·점수·정렬 가중)를 만들지 않는다.

## 2. 결정이 필요한 한 가지 (D1) — 로그인 여부

요청의 "소속/성명/직급과 질문만 입력"은 **참여자가 로그인하지 않고 신원을 직접 적는 형태**를 뜻하는 것으로 읽었다. P3는 로그인 신원을 작성자로 쓰므로(FR-QC-01) 모델이 다르다.

| | **A. 무로그인 공개 폼 (설계 기본안)** | B. 로그인 + 자동 채움 |
|---|---|---|
| 입력 | 소속·성명·직급·질문 | 질문만 (나머지는 로그인 정보) |
| 대상 | 명단 밖 사람도 가능 (외부 강사 세션·타 부서 청중 등) | 32명 Builder·Master |
| 사칭·도배 | 가능 → 6절의 완화책으로 *줄일* 뿐 막지는 못함 | 불가 |
| 미제출자 파악 | **불가** (명단을 모름) | 가능 (건수가 아니라 사람 단위 — 단, A1 위반 소지 주의) |
| 수정·철회 | 불가 (본인 식별 수단 없음) → 사무국 숨김만 | 가능 |
| 규칙 예외 | 새 접점(비로그인 쓰기 API) → **ADR 필요** (`docs/11` B13 신설) | 없음 |

사용자가 적은 입력 형태가 A이므로 이 문서는 **A를 기본안**으로 쓴다. B를 원하면 `POST /api/intake`에 `requireRole('builder')`를 걸고 3칸을 `req.user`로 채우는 것으로 바뀐다(나머지 설계 동일). **어느 쪽인지 알려 주면 확정한다.**

## 3. 원칙 점검 (CLAUDE.md A·B)

| 조항 | 이 설계의 대응 |
|---|---|
| A1 판정 금지 | 점수·별점·순위·"좋은 질문" 표시 없음. 카드 순서는 **접수순 고정**(보조: 소속→이름순). 집계는 건수만. 상태는 처리 상태(`new·reviewed·hold·hidden`)이지 평가가 아니다 |
| A4 개인정보 | 받는 것: 소속·성명·직급·질문. **사번·이메일·전화 칸 없음.** 질문 본문에 사번/이메일/휴대전화 패턴이 있으면 거부(`domain/privacy.js` 재사용). 표시는 성명·직위·소속까지 |
| A5 흔적 | 질문 본문은 **불변**(UPDATE 트리거 차단) · 행 DELETE 금지 · 삭제 = `hidden` 상태. 상태 변경 이력은 `audit_log`가 맡는다 |
| A6 감사 | `intake_create`(행위자 `ANON`)·`intake_status`·`intake_export`·`view_operator_screen` |
| A7 하드코딩 금지 | 소속 목록·직급 목록·글자 수·횟수 제한·마감 문구 전부 `config/app.json` |
| A8 사내 전용 | 외부 호출 0 · 폰트·CDN 없음 · 자동 발송 없음 |
| B2 | 의존성 추가 0 |
| B4 | SQL 자리표시자 · DB 접근은 `src/repo/intake.js`에서만 |
| B8 | 인라인 스크립트·이벤트 속성 없음 (`ask.js`·`admin-intake.js` 모듈) |

## 4. 데이터 (`src/schema/005_intake.sql`)

> 번호: 현재 최신이 004. `schema-optional/005_optional.sql`(B8·B9 조건부)은 승인되어 옮겨질 때 **006으로 바꾼다**(적용기는 번호 연속 전제).

```sql
CREATE TABLE intake_questions (
  id          INTEGER PRIMARY KEY,
  round       TEXT NOT NULL,                    -- config.intake.rounds[].code (회차가 1개면 사실상 상수)
  affiliation TEXT NOT NULL,                    -- config 목록의 값 (허용 목록 밖이면 서버가 거부)
  name        TEXT NOT NULL,
  title       TEXT NOT NULL,                    -- 직급
  body        TEXT NOT NULL,                    -- 질문 본문 (불변)
  dedupe_key  TEXT NOT NULL,                    -- sha256(round|정규화 성명|정규화 본문) — 더블클릭·재전송 방지
  status      TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new','reviewed','hold','hidden')),
  created_at  TEXT NOT NULL,
  updated_at  TEXT NOT NULL
);
CREATE UNIQUE INDEX intake_dedupe ON intake_questions(dedupe_key);
CREATE INDEX intake_order ON intake_questions(round, created_at, id);

CREATE TRIGGER intake_no_delete BEFORE DELETE ON intake_questions
  BEGIN SELECT RAISE(ABORT,'intake_questions rows are never deleted'); END;
CREATE TRIGGER intake_body_fixed BEFORE UPDATE OF round, affiliation, name, title, body, dedupe_key, created_at ON intake_questions
  BEGIN SELECT RAISE(ABORT,'intake_questions content is immutable; change status only'); END;
PRAGMA user_version = 5;
```

- 수정 기능이 없으므로 `*_versions` 표가 필요 없다(본문이 처음부터 불변). 나중에 수정을 허용하게 되면(D1=B) P3와 같은 `intake_versions`를 **추가**한다.
- 접수 번호 표시는 `Q-` + `id` 4자리 (예: `Q-0012`). 접수 완료 화면과 카드에 쓴다.

## 5. API (`docs/04`에 추가할 절 안)

| 엔드포인트 | 권한 | 설명 |
|---|---|---|
| `GET /api/intake/form` | 공개 | `{closed, message?, rounds, affiliations, titles, rules:{bodyMin,bodyMax,nameMax}}` |
| `POST /api/intake` | 공개 | `{round?, affiliation, name, title, body, website:""}` → 201 `{id, ref}` · 400 `problems` · 404(기능 꺼짐) · 410 `closed` · 429 |
| `GET /api/admin/intake` | office | `?round=&affiliation=&status=&order=seq|name` → `items:[{id,ref,affiliation,name,title,body,status,createdAt}]` · 감사 `view_operator_screen` |
| `GET /api/admin/intake/summary` | office | `{total, byStatus:{…}, byAffiliation:[{affiliation,count}], byDay:[{day,count}], submitters:[{name,title,affiliation,count}]}` — **건수와 이름순 명단만** |
| `PATCH /api/admin/intake/:id` | office | `{"status":"new|reviewed|hold|hidden"}` → 감사 `intake_status` |
| `GET /api/admin/intake/export.csv` | office | BOM + 수식 주입 방지(`csvCell` 재사용) · 숨김 제외 · 감사 `intake_export` |
| `PATCH /api/admin/settings/intake` | office | `{"closed":bool}` (qcards 마감과 같은 방식) |

- `summary`의 `submitters`는 이름순. 순위·비교 칸(`rank`·`score`·`top`)은 응답에 존재하면 안 된다(회귀 테스트로 고정).
- 서버 검증 순서: 기능 게이트 → 마감 → 횟수 제한 → 형식(허용 목록·길이) → 개인정보 패턴 → dedupe → INSERT.
- 오류 문장은 입력값을 되풀이하지 않는다(FR-QC-12와 동일).

## 6. 무로그인 접수의 방어선 (D1=A일 때)

사칭을 *원천 차단*할 수는 없다. 대신 비용을 올리고 흔적을 남긴다.

1. **사내망 한정** — 기존 서버 바인딩·방화벽 절차를 그대로 쓴다(새 설정 없음).
2. **횟수 제한** — 기존 `rate_hits` 재사용, `scope='intake'`, 버킷=접속 IP, 기본 10분에 10건(config). 초과 429 + `Retry-After`.
3. **허니팟** — 숨긴 `website` 칸이 채워지면 201을 돌려주되 저장하지 않는다(봇에게 실패를 알리지 않음).
4. **dedupe** — 같은 회차·같은 성명·같은 본문은 한 건(재전송이면 기존 `ref`로 200).
5. **허용 목록** — 소속·직급은 config 목록의 값만. 본문·성명은 길이 상한, 제어 문자 제거, 화면에서는 `textContent`로만 출력.
6. **마감 스위치** — `intake.closed`.
7. **숨김** — 사무국이 부적절한 건을 `hidden`으로(삭제 아님).

잔여 위험(문서에 남김): 타인 이름으로 제출 가능 · 미제출자 파악 불가. UAT 때 사무국 확인 항목으로 넣는다.

## 7. 화면

### 7.1 `public/ask.html` (참여자 · 로그인 없음)

- 필드: 소속(선택) · 성명 · 직급(선택) · 질문(글자 수 카운터) + 숨김 허니팟.
- 제출 후: 접수번호 `Q-0012` 확인 화면 + "질문 하나 더 쓰기"(소속·성명·직급은 유지, 질문만 비움). 유지는 메모리 안에서만(쿠키·저장소 없음).
- 마감 시: 안내 문구만.
- 입력 중 검사 목록(서버 `problems` 그대로)을 칸 아래에 보인다.

### 7.2 `public/admin/intake.html` (사무국)

한 화면에 세 영역.

1. **현황 띠** — 총 건수 · 상태별 건수 · 소속별 건수(막대 길이는 건수 비례일 뿐 정렬은 config 순서) · 일자별 건수 · 제출자 명단(이름순·건수). 마감 스위치와 CSV 버튼.
2. **필터** — 회차·소속·상태.
3. **보기 전환**
   - **표 보기**: 접수번호·소속·성명·직급·질문 앞 40자·상태.
   - **카드 격자**: 질문 카드 여러 장을 훑어보는 용도.
   - **카드 리뷰(한 장 크게)**: 질문 본문을 큰 글씨로, 하단에 소속·성명·직급·접수시각·접수번호를 작게. `←/→` 이동 · 진행 표시 `12 / 48` · 키 `1`=검토함 `2`=보류 `H`=숨김 · **작성자 가리기 토글**(화면 표시만 가림, 서버 응답은 동일).

카드 순서는 접수순 기본, 이름순 선택. 그 외 정렬 옵션은 만들지 않는다.

## 8. 설정 (`config/app.json` 추가분 · `src/config.js` 허용 키에 `intake` 추가)

```jsonc
"features": { "intake": true },
"intake": {
  "closed": false,
  "closedMessage": "질문 접수가 마감되었습니다.",
  "rounds": [ { "code": "R1", "title": "1차 질문 접수" } ],
  "affiliations": ["Physical AI", "Agentic AI", "Digital Twin", "사무국", "기타"],
  "titles": ["사원", "선임", "책임", "수석", "팀장", "임원", "기타"],
  "bodyChars": { "min": 10, "max": 500 },
  "nameChars": { "max": 20 },
  "rateLimit": { "max": 10, "windowSec": 600 }
}
```

`affiliations`는 Lab 이름에서 파생할지(`fromLabs: true`) 직접 적을지가 D2다. 기본안은 직접 적기(명단 밖 소속도 받기 위해).

## 9. 파일 목록 (기존 코드 접점은 4곳뿐)

새 파일: `src/schema/005_intake.sql` · `src/domain/intake.js`(검사·정규화 순수 함수) · `src/repo/intake.js`(SQL) · `src/routes/ext/intake.js` · `public/ask.html` · `public/admin/intake.html` · `public/assets/js/ask.js` · `public/assets/js/admin-intake.js` · `test/unit/intake.test.js` · `test/ext/intake.test.js`

기존 파일 접점: `config/app.json`(키 추가) · `src/config.js`(허용 키·검증) · `src/routes/ext/index.js`(등록 한 줄) · 사무국 메뉴 링크 1개. P3(`qcards*`)·게시판은 **변경 없음**.

`docs/13`의 "새 권한 체계 금지" 규칙에 비로그인 접수는 예외가 되므로 `docs/11_DECISIONS.md`에 **B13: 무로그인 접수 API**를 ADR로 먼저 적는다(D1=A일 때만).

## 10. 테스트 (`docs/09` 인수 항목에 추가)

| 구분 | 확인 |
|---|---|
| 단위 | 길이 경계(min−1·min·max·max+1) · 허용 목록 밖 소속·직급 거부 · 사번 6~7자리·이메일·휴대전화 거부 · 제어 문자 제거 · dedupe 키 정규화(공백·대소문자) |
| HTTP | 201 · 400(`problems`에 입력값 미포함) · 404(기능 끔) · 410(마감) · 429(11번째) · 허니팟 201+미저장 · dedupe 재전송 · 비로그인/builder가 admin API → 401/403 |
| 사무국 | 상태 변경 + 감사 한 줄 · 숨김 건이 CSV에서 빠짐 · CSV BOM·`=+-@` 선행 시 `'` 접두 |
| DB | 행 DELETE 시도 실패 · 본문 UPDATE 시도 실패 · 상태 UPDATE 성공 |
| **판정 금지 회귀** | admin 응답 JSON 어디에도 `rank·score·top·best·recommend` 키 없음 · `order` 허용값은 `seq·name`뿐 |
| 기능 끔 회귀 | `features.intake=false` → 두 화면 API 모두 404 · 기존 119건 테스트 그대로 통과 |

완료 정의(CLAUDE.md C): 위 테스트 전부 통과 + 인수 항목 확인 + **미검증 범위 명시** — 브라우저 클릭 E2E·대상 서버(NSSM·다른 PC 접속)는 이 단계에서 검증하지 않는다.

## 11. 구현 순서 (작게 잘라 매번 동작하는 상태로)

| 슬라이스 | 내용 | 끝나면 보이는 것 |
|---|---|---|
| S1 | 005 스키마 · `domain/intake.js` · `repo/intake.js` · 단위·DB 테스트 | 검사 규칙과 불변성이 테스트로 고정됨 |
| S2 | `POST /api/intake` · `GET /form` · `ask.html` · 횟수 제한·허니팟·dedupe | 참여자가 질문을 낼 수 있음 |
| S3 | admin 목록·`summary`·상태 변경 · 감사 | 사무국이 현황과 목록을 봄 |
| S4 | `admin/intake.html` 표 → 카드 격자 → 카드 리뷰(키보드·가리기) | 리뷰 UX 완성 |
| S5 | CSV · 마감 스위치 · 판정 금지·기능 끔 회귀 · docs 04/05/09/13 갱신 · STATUS 4줄 | 인수 가능 |

## 12. 남은 결정

| # | 질문 | 기본안 |
|---|---|---|
| **D1** | 로그인 여부 (2절) | A. 무로그인 공개 폼 |
| D2 | 소속 목록: Lab 파생 vs 직접 목록 | 직접 목록(+`기타`) |
| D3 | 직급: 선택 목록 vs 자유 입력 | 선택 목록(+`기타`) — 표기 흔들림 방지 |
| D4 | 회차(`round`) 필요 여부 | 설정에 1개만 두면 화면에서 자동으로 숨김 |
