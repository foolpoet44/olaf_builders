# 18. 질문 접수·질문 카드 공유 (intake)

상태: **구현됨** (2026-11-18) · 확장 기능 `features.intake` · 스키마 005 · 테스트 135 PASS(+16)
목적 한 줄: **로그인·사전등록 없이** 개인이 소속·성명·직급·질문만 내고, 사무국이 **제출 현황**을 보고 **질문 카드를 골라 전체 화면으로 공유**한다.

## 1. 범위 (이것만)

| 누가 | 무엇 | 화면 |
|---|---|---|
| 누구나(사내망) | 소속·성명·직급·질문 4칸 제출. 이어서 여러 건 가능 | `/ask.html` |
| 사무국 | 제출 현황(총건수·소속별 건수·제출자 이름순 명단) · 카드 목록(접수순) · 카드 전체 화면 공유(←/→·Esc·`A`=작성자 가리기) · 숨김/해제 | `/admin/intake.html` |

**하지 않는 것:** 수정·철회(본인 식별 수단이 없다) · 마감 스위치 · CSV · 상태 분류·선정 · 순위·점수 · 명단 대조(미제출자 파악). 필요해지면 `STATUS.md` 「발견/제안」으로 올린다.
"등록된 학습자" = **제출한 적 있는 사람**(제출 행위가 곧 등록). 사전 명단과 대조하지 않는다.

## 2. 데이터 — `intake_questions` 한 표

`id · affiliation · name · title · body · dedupe_key · status(open|hidden) · created_at · updated_at`

- 사번·이메일·전화 칸 없음. 질문·성명·소속·직급에 사번(6~7자리 숫자)·이메일·휴대전화 패턴이 있으면 거부(기존 `privacy` 모듈).
- 본문·작성자 칸은 **불변**(UPDATE 트리거), 행 DELETE 금지(트리거) — 삭제 = `hidden`. 상태 변경 이력은 `audit_log`(`intake_create`(행위자 `ANON`)·`intake_status`).
- `dedupe_key = sha256(정규화 성명 | 정규화 본문)` 유일 → 더블클릭·재전송은 기존 접수번호로 200.

## 3. API

| 엔드포인트 | 권한 | 설명 |
|---|---|---|
| `GET /api/intake/form` | 공개 | `{rules:{bodyMin,bodyMax,nameMax,affiliationMax,titleMax}}` |
| `POST /api/intake` | 공개 | `{affiliation,name,title,body}` → 201 `{id,ref:"Q-0001"}` · 200(중복) · 400 `problems` · 429(`Retry-After`) |
| `GET /api/admin/intake` | office | `?affiliation=&name=&hidden=1` → `{summary:{total,submitters[],byAffiliation[]}, items[]}` (접수순 고정, 건수·이름순만) |
| `PATCH /api/admin/intake/:id` | office | `{"status":"open"|"hidden"}` |

기능이 꺼지면(`features.intake=false`) 전부 404.

## 4. 무로그인 방어 (사칭을 막지는 못하고 비용을 올린다)

사내망 한정(기존 배포 그대로) · IP별 횟수 제한(기본 10분 10건, 기존 `rate_hits` 재사용) · 같은 내용 중복 방지 · 길이 상한·제어문자 제거 · 화면은 `textContent`만 · 사무국 숨김.
**잔여 위험(UAT 확인):** 타인 이름으로 제출 가능 · 미제출자 파악 불가.

## 5. 설정 (`config/app.json`)

`features.intake: true` · `intake: { bodyMin:10, bodyMax:500, nameMax:20, affiliationMax:40, titleMax:20, rateLimit:{max:10, windowSec:600} }`

## 6. 파일

`src/schema/005_intake.sql` · `src/domain/intake.js` · `src/repo/intake.js` · `src/routes/ext/intake.js` · `public/ask.html` · `public/admin/intake.html` · `public/assets/js/{ask,admin-intake}.js` · `test/ext/intake.test.js`
기존 접점: `config/app.json` · `src/config.js`(허용 키·검증) · `src/routes/ext/index.js`(1줄) · `public/assets/js/admin-index.js`(메뉴 1줄) · `src/bootstrap.js`(조건부 스키마 검사를 `reactions` 표 존재 여부로 변경 — 005 번호가 intake 로 쓰이므로) · `test/repo/db.test.js`(최신 버전 단언).
`schema-optional/005_optional.sql`(B8·B9 조건부)은 승인 후 옮길 때 **006으로 번호를 바꾼다**.

## 7. 검증 범위

확인: 단위(경계·개인정보·dedupe) · HTTP(201/200/400/429/404·권한 401/403) · DB 불변성 · 판정 키 부재 · 기능 끔 · 실서버 기동 스모크(화면 정적 200·접수 201·관리 API 401).
**미확인:** 브라우저에서의 클릭·전체 화면(Fullscreen API)·키보드 동작(E2E 없음) · 대상 서버(NSSM·다른 PC 접속). UAT 때 사람이 확인.
결정 기록은 `docs/11` B13·ADR-13, API 표 `docs/04` 9절, 화면 `docs/05` 3·3-1절, 확장 명세 `docs/13` FR-EXT-15에 반영했다.
