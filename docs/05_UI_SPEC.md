# 05. 화면 명세

## 1. 원칙

- 정적 HTML 파일마다 한 화면. 공통 `assets/app.css`, 공통 `assets/js/common.js`(fetch 래퍼·로그인 확인·머리띠), 화면별 `assets/js/<화면>.js`.
- 인라인 스크립트·인라인 이벤트 속성 금지. 사용자 입력은 **`textContent`로만** 출력(`innerHTML`에 사용자 값 금지).
- 모든 화면 상단에 보안 띠: `LGE Internal Use Only`(설정 `meta.securityLabel`).
- 브랜드 문구·메뉴 이름·Lab 이름은 `/api/me`·`/api/config/public`에서 받아 그린다(하드코딩 금지).
- 데스크톱 우선, 360px 폭까지 무너지지 않게(현장에서 휴대폰 열람 가능).

## 2. 디자인 토큰 (`assets/app.css` `:root`)

```css
:root{
  --bg:#ffffff; --point:#a50034; --dark:#171717;
  --gray-50:#fafafa; --gray-100:#f4f4f5; --gray-300:#d4d4d8; --gray-500:#71717a;
  --ok:#15803d; --warn:#b45309; --err:#b91c1c;
  --radius:8px; --gap:16px;
  --font:'Pretendard', -apple-system, 'Malgun Gothic', sans-serif;
}
```

글꼴: `assets/fonts/PretendardVariable.woff2` 로컬 포함(OFL 라이선스 파일 동봉). 외부 CDN 금지.

## 3. 화면 목록

| 파일 | 단계 | 권한 | 주요 요소 |
|---|---|---|---|
| `login.html` | P1 | 공개 | 아이디·비밀번호 입력 · 로그인 버튼 · 오류 문구 · 429면 남은 시간 |
| `index.html` (포털) | P1 | 로그인 | 인사(성명·역할) · 역할별 메뉴 카드 · 로그아웃 · 브랜드 메시지 |
| `materials.html` | P2 | 로그인 | 목록(세션별 묶음) → 뷰어: 쪽 이미지 1장 · ←/→ 키 · 쪽 번호 입력 · 확대(맞춤/100%) |
| `qcard.html` | P3 | builder | 세션 선택 · 방식 탭(template/free) · 입력칸별 글자 수 · **실시간 낭독 문장 미리보기와 예상 초** · 검사 결과 목록 · 내 카드 목록(수정·철회) · 마감이면 안내만 |
| `board.html` | P4 | 로그인 | 왼쪽 공간 목록 · 가운데 글 목록(검색·페이지) · 글 보기(최신판·"수정됨"·댓글) · 쓰기/수정 폼 |
| `admin/index.html` | P1 | office | 사무국 메뉴 · 건수 요약(`/api/admin/stats`) |
| `admin/people.html` | P3 | office | 사람 표(ID순) · 로그인 아이디/비밀번호 설정 · 비활성화 |
| `admin/materials.html` | P2 | office | 꾸러미 업로드 · 자료 표(상태 변경·열람 건수) |
| `admin/qcards.html` | P3 | office | 필터(세션·Lab·상태) · 표 · 한 장 크게 보기(←/→ · 글자 크게) · 상태 변경 · 대표/예비 선정 · CSV 내려받기 · 마감 스위치 |
| `admin/audit.html` | P3 | office | 감사 기록 표(최신순) |
| `ask.html` | 확장(`intake`) | **공개(로그인 없음)** | 소속·성명·직급·질문 4칸 · 질문 글자 수 · 서버 검사 문장 목록 · 제출 뒤 접수번호 안내와 같은 화면에서 이어 쓰기(질문 칸만 비움) · 기능 꺼짐·오류면 안내만 |
| `admin/intake.html` | 확장(`intake`) | office | 제출 현황(총건수·소속별 건수·제출자 이름순 표) · 소속·제출자·숨김 포함 필터 · 질문 카드 격자(접수순, **정렬 선택 없음**) · 카드별 "전체 화면"·숨김/해제 · 전체 화면 공유(`←`/`→` 이동 · `Esc` 닫기 · `A` 작성자 가리기=화면 표시만) |
| `404.html` | P0 | 공개 | 안내 + 첫 화면 링크 |

### 3-1. 커뮤니티 확장 화면 (`docs/13`)

기능이 꺼져 있으면(`/api/me`의 `features.<키>`가 false) 해당 블록·메뉴를 그리지 않는다.

| 위치 | 단계 | 키 | 추가 요소 |
|---|---|---|---|
| `board.html` 새 글 폼 | P4.5 | `templates` | 공간 틀로 본문 미리 채움 · "틀 지우기" 버튼 |
| `directory.html` (새 파일) | P4.5 | `directory` | Lab 탭 · 그룹별 카드(성명·직위·과제명?) · 이름 검색(화면 필터) · **정렬 선택 없음** |
| `board.html` 글 목록 | P4.5 | `pin` | 📌 대신 텍스트 "고정" 띠 · 고정 글 위쪽 별도 묶음 · office 메뉴 "고정/해제" |
| `board.html` 글 보기 | P4.5 | `accept` | 댓글마다 "답변 채택"(작성자·office) · 채택 댓글 상단 강조 · 목록에 "해결됨" 표시 |
| `admin/qcards.html` · `qcard.html` | P4.5 | `qcardAnswer` | 사무국: 카드 보기에 "답변 글 쓰기"(본문 입력 모달) · 참여자: 내 카드에 "답변 보기" 링크 |
| `index.html` · `board.html` | P4.5 | `notifications` | 메뉴 카드·공간 목록 숫자 배지 · "내 글 소식 n" · 공간 열면 `POST /api/me/seen` |
| `events.html` (새 파일) · `index.html` | P4.6 | `events` | 월별 목록 · 포털 "다가오는 일정 3개" |
| `index.html` · `board.html?view=recent` | P4.6 | `digest` | 포털 "이번 주 새 글" 5건 · 전체 보기 |
| `materials.html` 뷰어 | P4.6 | `materialThreads` | 오른쪽 접이식 패널: 이 자료 질문 · "이 쪽에 질문" |
| `board.html` · `bookmarks.html`(새 파일) | P4.6 | `bookmarks` | 글 보기 "저장" 토글 · 내 저장함 목록 |
| `board.html` | P4.6 | `tags` | 글 폼 태그 선택(체크 목록 · Lab별 묶음) · 글에 태그 칩 · 칩 누르면 `?tag=` 필터 |
| `board.html` · `admin/reports.html`(새 파일) | P4.6 | `reports` | 글·댓글 "신고"(사유 선택 + 메모) · 사무국 처리 목록 · 포털 "처리 대기 n" 배지 |
| `board.html` 글 보기 | 조건부 | `helpful` | "도움됐어요 n" 버튼 — **상세에서만**, 목록·정렬 없음 |
| `ask.html` · `admin/intake.html`(새 파일) | 확장 | `intake` | 위 표 참고 · 사무국 첫 화면 메뉴 카드 "질문 접수"(`features.intake`가 꺼지면 숨김) · 참여자 포털 메뉴에는 넣지 않고 사무국이 주소(`/ask.html`)를 별도 전달 |
| `surveys.html`(새 파일) · `admin/surveys.html` | 조건부 | `surveys` | 진행 중 설문 응답 · 결과(건수 막대) · 사무국 만들기·마감 |

`menuItems`에 `directory`·`events`·`bookmarks`·`surveys`를 추가하고 `menus`의 역할 목록에서 켠다(`config/app.json`).

## 4. 화면별 동작 요점

### 공통 `common.js`

```js
// 예시 계약 (구현 지침)
export async function api(path, { method = 'GET', body } = {}) // JSON 송수신 · 401이면 /login.html?next=<현재경로>
export async function requireMe(roles)                          // /api/me → 역할 불일치면 포털로
export function el(tag, attrs, ...children)                     // textContent 기반 DOM 생성
export function banner()                                        // 보안 띠 + 머리글
```

### 질문 카드 미리보기

- 서버와 **같은 규칙**을 화면에서도 계산해 즉시 보여 준다(`/api/qcards/form`의 `rules`·`lead` 사용). 최종 판정은 서버.
- template 문장: `lead`의 `{challenge}`·`{situation}`·`{constraint}` 치환 + 공백 + `ask`.
- free 문장: `free.lead`(`{challenge}` 치환) + 공백 + `ask`.
- 예상 초 = `ceil(공백 제외 글자 수 / chars_per_second)` (서버 `readSeconds`와 동일 식 — `docs/09_TESTING.md` 고정 예제로 일치 확인).

### 자료 뷰어

- `<img>` 대신 `<canvas>`에 그리기 권장(우클릭 저장 억제) · `contextmenu`·`dragstart` 기본 동작 막기.
- 다음 쪽 1장 미리 불러오기. 쪽 이미지는 `fetch` → `createImageBitmap` → canvas.
- 화면 하단 고지: "화면 캡처는 막을 수 없습니다. 무단 배포 금지 — 쪽마다 워터마크가 있습니다."

### 게시판

- 본문은 일반 텍스트. 출력 시 줄바꿈은 CSS `white-space: pre-wrap`. 링크 자동 변환 없음(외부 공유 억제).
- 삭제된 글: 회색 안내 문구 · 댓글은 남김. 숨김 글: office에게만 붉은 띠 + 사유.
- 목록에 조회수·좋아요 없음.

## 5. 문구 기준

- 버튼·안내는 짧은 한국어 평서문. 오류는 "무엇을 어떻게 고치면 되는지".
- 서버 `problems` 문장은 그대로 보여 준다(서버가 개인정보·입력값을 되풀이하지 않도록 이미 보장).
- 판정을 암시하는 말(우수·상위·랭킹·추천) 금지.
