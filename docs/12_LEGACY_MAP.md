# 12. 기존 리포 대응표

기존: `foolpoet44/af-lab-community` @ `c38e29b` (2026-11-11) · 112개 파일.
**원칙:** 읽고 규칙을 옮긴다. 파일을 복사하지 않는다.

## 1. 즉시 보안 조치 (재구축과 별개)

| 발견 | 위치 | 조치 |
|---|---|---|
| SMTP 계정·앱 비밀번호, 관리자 비밀번호 평문 기본값 | `csv/windows_server.js` 36~38행 (다른 앱 `prihr-main`의 서버 소스 사본으로 보임) | 해당 비밀번호 **즉시 교체** · 파일 제거 · 이력 정리 여부 보안 담당 결정 (B7) |
| 서버 주소·원격 접속 포트가 과거 문서에 있었음 | git 이력 (STATUS.md 발견 기록) | 새 리포는 이력 없이 시작 · 기존 리포 보관(archive)·비공개 확인 |
| Vercel·Neon·Upstash·Supabase 비밀값 | STATUS.md "비밀값 재발급" 블로커 | 클라우드 정리 때 폐기 |

## 2. 가져가는 것 (규칙·문구)

| 기존 | 내용 | 새 위치 |
|---|---|---|
| `CLAUDE.md` | 불변 원칙 1~9 | `CLAUDE.md` A절 |
| (기존 리포) `docs/OPERATING_RULES.md` | 역할·공간·쓰지 말 것 | 화면 문구 · `config/app.json spaces` · 게시판 안내 |
| `config.yaml` brand·cohort·labs·roles·visibility·spaces·posts·moderation·question_cards·sessions·materials·privacy·content_scan·roster·auth | 기준값 | `config/app.json` (이식 완료 · 사람·비밀·Vercel 항목 제외) |
| `scripts/question_cards.py` `check_card` · `compose_sentence` · `read_seconds` | 질문 카드 검사 | `shared/qcard-rules.js` · `domain/qcard.js` |
| `scripts/spaces.py` `build_spaces` · `can` · `master_covers` | 공간 펼치기·권한 | `domain/spaces.js` (같은 판정표) |
| `scripts/board.py` SCHEMA·트리거 | 판·상태 | `schema/001_init.sql` posts 부분 |
| `scripts/roster_import.py` | 명단 검사 순서 | `domain/roster.js` (이메일 열은 버림으로 변경) |
| `scripts/materials.py` 워터마크 문구·쪽 상한 | 자료 | `tools/render-pdf` · `domain/materials.js` |
| `scripts/auth.py` 역할별 메뉴·코드 구조 | 로그인 | `routes/auth.js` (서명 토큰 → 서버 세션으로 변경) |
| `ui/*.html` | 화이트 톤 화면·문구 | `public/*.html` 시각 기준 (코드는 새로) |
| `docs/cards/O*.md` UAT 표 | 인수 항목 | `docs/09_TESTING.md`에 대응 |
| `vercel.json` headers | 보안 머리글 | `middleware/security.js` (CSP 강화) |
| `config.yaml` `demo_day_template` · `labs.items[].keywords` · `moderation` · `posts.hide_requires_reason` | Build Review 틀 · 태그 후보 · 신고 사유 | `spaces[].template` · `tags` · `moderation` (`docs/13`) |
| (기존 리포) `docs/OPERATING_RULES.md` 1장 "Master Q&A 답변 채택" | 채택 기능 | FR-EXT-07 |
| STATUS.md "W/S 운영 기록이 DB 에 없다 · 후속 답변 정리" | 질문 카드 후속 처리 | FR-EXT-08a (질문 카드 → Master Q&A 답변 글) |

## 3. 버리는 것

| 기존 | 이유 |
|---|---|
| `vercel.json` · `.vercelignore` · `api/*.py` 처리기 구조 | 서버리스 전용 |
| `scripts/olaf_app.py` (WSGI 덧대기) | 상주 서버로 대체 |
| `scripts/qcard_web.py` | 통합 앱으로 대체 |
| `scripts/pg_migrate.py` · `pg_qcard_store.py` · `pg_qcard_ops.py` · `pg_import_qcards.py` · `pg_sql_export.py` · `pg_transfer.py` · `db/postgres/*.sql` · `db/sqlite/*` | PostgreSQL·Neon 전용 |
| `sqlite_qcard_store.py` · Upstash KV 코드 · `qcard_bundle.py` · `api/bundle.json` | 저장소 단일화 |
| `audit_sync.py` | 감사 기록이 처음부터 DB 하나 |
| `rebuild_from_live.py` · `build_static.py` · `build_docs_html.py` · `smoke_prod.py` | 빌드·배포 우회 도구 · `/readyz`+`check.ps1`로 대체 |
| `c29_import.py` · `temp_assignment.py` · `csv_import*.py` | C29 확정 전 — P5에서 새로 (금지 키 목록만 참고) |
| `qcard_export.py` · `qcard_submit.py` | 사무국 화면 CSV·API로 대체 |
| `csv/windows_server.js` | 다른 앱 소스 · 비밀 포함 |
| 관리 토큰 `ADMIN_TOKEN` · 공용 열람 코드 · `MATERIALS_SIGNING_KEY` · `AUTH_SIGNING_KEY` | 개인 코드 + 자동 생성 키로 대체 |
| `data/private` 정션 구조 | 공유 폴더 표준 경로로 대체 |
| `docs/runbooks/local_server_hosting.md` · `db_migration_local.md` | 이 패키지 `docs/08`로 대체 |

## 4. 기존 데이터 가져오기 (선택 · 결정 B6)

원점 재시작이 기본이다. 가져오기로 결정하면 아래만 한다.

| 데이터 | 출처 | 방법 |
|---|---|---|
| 사람 (32명 + Master + 사무국) | 사무국 PC 명단 엑셀 | 새 명단 CSV 형식(`docs/01` FR-ADM-03)으로 정리 → `tools/admin.js import-roster`. **ID는 기존 질문 카드의 작성자 ID와 맞춘다**(기존 STATUS: 운영 DB는 `T-<그룹>-<순번>`, 엑셀은 `T-01~T-32` — 불일치 주의) |
| 질문 카드 44장 | Neon 콘솔 SQL Editor에서 `qcards`·`qcard_versions`를 JSON으로 내보내기(읽기만) | `tools/import-legacy.js qcards <json> --actor OP-01 --dry-run` → 빈 `qcards` 표에만 · 각 카드 최신판만 판 1로 · 상태(`followup` 등) 유지 · 감사 `import_legacy` 1줄 |
| 교육 자료 5건 | 사무국 PC의 원본 PDF | `tools/render-pdf`로 꾸러미 재생성 → 사무국 화면 업로드 (DB의 이미지 추출보다 단순) · 강사 동의(D2) 확인 후 공개 |
| 감사 기록 | Neon `audit_log` | 가져오지 않는다. 내보낸 파일을 `backups\legacy-audit-<날짜>.json`으로 보관만 |

가져오기 뒤 Neon·Upstash·Vercel 정리 시점은 사무국 결정(D1·D6). 사내 앱 개통 확인 전에는 지우지 않는다.

`import-legacy.js` 입력 JSON 형식(내보내기 SQL은 도구 README에 둔다):

```json
{ "qcards": [ { "legacy_id": 1, "author_id": "T-PA1-01", "session": "DT", "status": "followup",
               "created_at": "2026-10-21T09:00:00Z",
               "latest": { "format": "template", "situation": "…", "constraint": "…", "ask": "…" } } ] }
```

검사: `author_id`가 `people`에 있어야 함 · 세션 코드 존재 · 본문은 개인정보 검사(걸리면 그 카드만 보고하고 전체 중단).
