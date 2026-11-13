# P1 ~ P4 · 단계별 지시문

각 단계는 이전 단계 완료 보고 뒤에 하나씩 지시한다. 공통: 단계 밖 기능 금지 · 요구사항 ID를 테스트 이름에 · 끝에 `npm test` 요약·미검증 범위·`STATUS.md` 갱신.

---

## P1 · 로그인 · 포털 · 사무국 명령줄

`docs/10_ROADMAP.md` P1을 구현하라. 요구사항 FR-AUTH-01~08 · FR-ADM-01~08.
- 코드 형식·저장·조회는 `docs/03_DATA_MODEL.md` 3절, 쿠키·CSRF·횟수 제한은 `docs/06_SECURITY.md` 1·2절.
- API는 `docs/04_API_SPEC.md` 3·7절(사람 목록·코드 발급은 API만, 화면은 P3).
- `tools/admin.js`는 라우트를 거치지 않고 `domain`+`repo`를 직접 쓰며 같은 감사 기록을 남긴다. 코드 원문은 표준출력에 한 번만.
- 권한 테스트는 앱의 라우트 목록을 뽑아 모든 `/api/admin/*`를 자동 순회하라.
- 화면: `login.html` · `index.html` · `admin/index.html` · `common.js` · Pretendard 로컬(라이선스 파일 포함).

## P2 · 교육 자료

`docs/10_ROADMAP.md` P2를 구현하라. 요구사항 FR-MAT-01~07 (FR-MAT-08은 별도 지시 시).
- zip 리더는 내장 `zlib.inflateRawSync`로 stored·deflate만 지원하는 최소 구현(`src/lib/zip.js`). zip64·암호화는 거부.
- 꾸러미 형식·검사는 `docs/04_API_SPEC.md` 4절. 파일을 먼저 `uploads\materials\<무작위 ASCII>\`에 쓰고 DB 등록은 트랜잭션, 실패 시 폴더 정리.
- 뷰어는 canvas 그리기 · 다음 쪽 미리 불러오기 · 우클릭/드래그 억제 · 캡처 불가 고지(`docs/05` 4절).

## P3 · 질문 카드 + 사무국 화면

`docs/10_ROADMAP.md` P3를 구현하라. 요구사항 FR-QC-01~12 · FR-ADM-09.
- 문장 조립·초 계산·글자 수 검사는 `public/assets/js/shared/qcard-rules.js` 하나에 두고 서버가 import한다. `docs/09_TESTING.md` 2절 고정 예제를 실제 값으로 채워 테스트하라.
- 마감 스위치는 런타임 설정 저장소 + `app-settings.json` 원자적 쓰기(`docs/07` 2절 5).
- CSV는 UTF-8 BOM · 열 순서 `docs/04` 5절.
- 사무국 화면: `admin/qcards.html`(한 장 크게 보기 ←/→) · `admin/people.html`(코드 재발급 모달 1회 표시) · `admin/audit.html`.

## P4 · 커뮤니티 기본

`docs/10_ROADMAP.md` P4를 구현하라. 요구사항 FR-BRD-01~11.
- `can()`은 기본 거부. 판정표는 `docs/01` FR-BRD-02·03과 기존 `scripts/spaces.py`의 규칙과 같아야 한다. 역할×공간×동작×설정 조합 표 테스트.
- 수정은 `post_versions` INSERT + `posts.ver/updated_at` 갱신을 한 트랜잭션으로. 판 번호 불일치 409.
- 본문은 일반 텍스트만, 출력은 `textContent` + `white-space: pre-wrap`. 링크 자동 변환 없음.
- 목록·검색은 읽기 권한 공간 안에서만. 사람·활동량 정렬 금지.
