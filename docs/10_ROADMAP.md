# 10. 로드맵

단계마다 **완료 기준을 모두 만족**해야 다음 단계로 간다. 단계 밖 기능은 `STATUS.md`「발견/제안」에만 적는다.
일정은 1인 + 코딩 에이전트 기준 참고값.

## P0 뼈대 (2~3일)

| 산출물 | 요구사항 |
|---|---|
| `package.json`(`type: module`, `engines.node >=22.13`, scripts: `start`·`test`) · lockfile · `.gitignore` · `.gitattributes` · `STATUS.md` | NFR-02·03 |
| `src/server.js` · `app.js` · `config.js` · `db.js` · `schema/001_init.sql` · `lib/*` · `middleware/security,errors` | FR-SYS-01~09 |
| `routes/health.js` · `public/404.html` · `public/assets/app.css` | FR-SYS-02·03 |
| 일일 백업 스케줄러 · 로그 정리 | FR-SYS-07 · NFR-12 |
| `tools/check.js` | — |
| `deploy/pack.ps1` · `install.ps1`(DryRun 포함) · `check.ps1` | `docs/08` 3·4·6절 |

**완료 기준:** 단위·저장소·HTTP 테스트 통과 · 개발 PC에서 `pack.ps1` → 다른 폴더에 `install.ps1 -DryRun` 정상 · 운영 모드 환경변수로 전경 기동 시 `/healthz`·`/readyz` 계약 일치 · 강제 종료 후 재기동 시 DB 유지.

## P1 로그인 · 포털 · 사무국 명령줄 (2일)

| 산출물 | 요구사항 |
|---|---|
| `repo/people,codes,sessions,rate,audit` · `middleware/session,require,origin` · `routes/auth,me` | FR-AUTH-01~08 |
| `domain/roster.js` · `tools/admin.js`(bootstrap·import-roster·set-credentials·deactivate·list) | FR-ADM-01~08 |
| `public/login.html` · `index.html` · `admin/index.html` · `assets/js/common.js` · Pretendard | FR-AUTH-07·08 |
| `/api/config/public` · `/api/admin/stats` | — |

**완료 기준:** 권한 자동 순회 테스트 통과 · 가짜 명단 가져오기 → 아이디/비밀번호 설정 → 세 역할 로그인 · 비활성화 즉시 차단.

## P2 교육 자료 (1~2일)

| 산출물 | 요구사항 |
|---|---|
| `lib/zip.js` · `domain/materials.js` · `repo/materials.js` · `routes/materials.js` + 사무국 라우트 | FR-MAT-01~07 |
| `public/materials.html` · `admin/materials.html` | — |
| (선택) `tools/render-pdf/` — 사무국 PC 전용 · 외부 도구(poppler·sharp 등) 허용 · **서버 꾸러미에 포함하지 않음**(`pack.ps1`이 제외) | FR-MAT-08 |

**완료 기준:** 꾸러미 업로드→공개→열람→숨김 · 거부 케이스 테스트 · 50쪽 자료 쪽 넘김 체감 지연 없음.
→ **이 시점에 Vercel 운영 중인 자료 열람을 사내로 대체 가능.**

## P3 질문 카드 + 사무국 화면 (2일)

| 산출물 | 요구사항 |
|---|---|
| `public/assets/js/shared/qcard-rules.js` · `domain/qcard.js` · `repo/qcards.js` · `routes/qcards.js` | FR-QC-01~12 |
| `public/qcard.html` · `admin/qcards.html` · `admin/people.html` · `admin/audit.html` | FR-ADM-09 |
| 마감 스위치 · 런타임 설정 저장소 | FR-QC-08 |
| (결정 B6) `tools/import-legacy.js` · 재현용 콘텐츠 스냅샷 | `docs/12` 4절 |

**완료 기준:** 질문 카드 규칙 테스트 전부(기존 리포 Q 시리즈 대응) · CSV 내려받기 엑셀에서 한글 정상 · 마감 동작.

## P4 커뮤니티 기본 (4~5일)

| 산출물 | 요구사항 |
|---|---|
| `domain/spaces.js` · `domain/board.js` · `repo/posts.js` · `routes/board.js` · 사무국 숨김·복구 | FR-BRD-01~11 |
| `public/board.html` | — |

**완료 기준:** `can()` 표 테스트 · 판·상태 규칙 · 숨김 사유 필수 · 검색이 권한 밖 공간을 보이지 않음.

## P4.5 커뮤니티 확장 1차 (4~5일) — `docs/13`

| 산출물 | 요구사항 |
|---|---|
| `src/schema/002_community_plus.sql` · `middleware/feature.js` · `routes/ext/index.js` · `app.js` 등록 한 줄 · `board.js` 저장 훅 | FR-EXT-00 |
| 글쓰기 틀 · `directory.html` · 공지 고정 · 답변 채택 · 질문 카드 답변 글 · 알림 배지 | FR-EXT-01·02·06·07·08a·09 |

**완료 기준:** 확장 테스트(`docs/09` 3-1) 통과 · **기능 전부 끈 상태에서 P0~P4 테스트 회귀 없음** · 001만 있는 DB 사본에 002 적용 후 데이터 동일.
→ 사람들이 다시 들어올 이유(새 글·답변 신호)와 첫 콘텐츠(질문 카드 44장의 후속 답변)가 생긴다.

## P4.6 커뮤니티 확장 2차 (4~5일)

| 산출물 | 요구사항 |
|---|---|
| `src/schema/003_community_more.sql` | FR-EXT-00 |
| `events.html` · 이번 주 새 글 · 안내 문안 · 자료 질문 스레드 · `bookmarks.html` · 태그 · 신고 + `admin/reports.html` | FR-EXT-03·04·05·08b·10·11·12 |

**완료 기준:** P4.5와 같음(003 기준) · 신고 시나리오 인수(A18).

## P5-조건부 (결정 B8·B9 승인 후, 각 0.5~2일)

| 산출물 | 요구사항 |
|---|---|
| `src/schema-optional/005_optional.sql`(이 단계에서 처음 릴리스에 포함) · 도움됐어요 | FR-EXT-13 (B8) |
| 사무국 간단 설문 · `surveys.html` · `admin/surveys.html` | FR-EXT-14 (B9) |

## P5 이후 (사무국 Q1·D3 결정 뒤)

| 후보 | 비고 |
|---|---|
| 스킬 태그(O05) | FR-EXT-11 `post_tags` 구조 재사용 · 값 출처만 C29 기준선으로 |
| 사내 SSO | `docs/02` 8절 확장 지점 |
| HTTPS 프록시 전환 | 코드 변경 없음 · 운영 작업 |
| 스킬 태그 · Challenge 스레드 · opt-in 프로필 · 지식 자산 이관 | 기존 O05~O09 |
| 첨부 파일 | 악성코드 검사 경로 결정 후 |
| C29 파일 가져오기 | C29 확정본(D5) 후 — 금지 키 목록은 기존 `config.yaml c29_import` 참고 |
| 보존 기간 만료 처리 | Q2 결정 후 · 2인 승인 |

## 진행 기록 형식 (`STATUS.md`)

```markdown
- 완료: …
- 진행: …
- 블로커: …
- 다음: …

## 단계 보드
| 단계 | 상태 | 테스트 | 비고 |
## 발견/제안
```
