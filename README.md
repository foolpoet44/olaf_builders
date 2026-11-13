# OLAF Builders

사내 Windows 로컬 서버 한 대에서 도는 OLAF Builders 웹앱. 진행 상황은 `STATUS.md`.

## 개발 실행

```powershell
npm.cmd install
npm.cmd test
$env:APP_RELEASE='dev'; npm.cmd start     # http://127.0.0.1:8091  (데이터는 .local 아래)
```

운영 배포는 `docs/08_DEPLOYMENT.md` · 스크립트 `deploy*.ps1`.

---

## 개발 문서 패키지 (v1.0 · 2026-11-13)

사내 Windows 로컬 서버 한 대에서 도는 **OLAF Builders** 웹앱을 원점에서 다시 만들기 위한 문서 묶음.
이 패키지를 새 리포 루트에 그대로 복사하고 코딩 에이전트에게 `prompts/00_kickoff.md`를 첫 지시로 준다.

> 보안 등급: LGE Internal Use Only. 이 패키지에는 서버 주소·비밀값·실명·사번·이메일이 없다.
> 기존 리포 `foolpoet44/af-lab-community`(@`c38e29b`)는 **업무 규칙 참고용**이다. 코드는 가져오지 않는다.

## 읽는 순서

| 순서 | 파일 | 누가 | 내용 |
|---|---|---|---|
| 1 | `CLAUDE.md` | 에이전트·개발자 | 불변 원칙 + 기술 제약 (모든 작업에 우선) |
| 2 | `docs/00_OVERVIEW.md` | 전원 | 왜 재구축인가 · 목표 · 범위 · 용어 |
| 3 | `docs/01_REQUIREMENTS.md` | 전원 | 기능·비기능 요구사항 (ID 부여) |
| 4 | `docs/02_ARCHITECTURE.md` | 개발 | 스택 · 프로세스 · 폴더 구조 · 모듈 경계 |
| 5 | `docs/03_DATA_MODEL.md` | 개발 | SQLite 스키마 전체 · 무결성 규칙 · 마이그레이션 |
| 6 | `docs/04_API_SPEC.md` | 개발 | HTTP API 전체 (요청·응답·오류) |
| 7 | `docs/05_UI_SPEC.md` | 개발 | 화면 목록 · 디자인 토큰 · 화면별 동작 |
| 8 | `docs/06_SECURITY.md` | 개발·보안 | 최소 보안 세트 · 하지 않는 것 |
| 9 | `docs/07_CONFIG.md` | 개발·운영 | 환경변수 · 설정 파일 스키마 · 비밀값 |
| 10 | `docs/08_DEPLOYMENT.md` | 운영 | 패키징 · 설치 · 업데이트 · 롤백 · 백업 · 제거 |
| 11 | `docs/09_TESTING.md` | 개발 | 테스트 전략 · 인수 테스트 표 |
| 12 | `docs/10_ROADMAP.md` | 전원 | 단계(P0~P4.6·P5) · 단계별 완료 기준 |
| 13 | `docs/11_DECISIONS.md` | 사무국·운영·보안 | 착수 전 결정 B1~B7 · 설계 결정 기록(ADR) |
| 14 | `docs/12_LEGACY_MAP.md` | 개발 | 기존 리포 → 새 구조 대응표 · 버리는 것 · 기존 데이터 가져오기 |
| 15 | `docs/13_COMMUNITY_EXTENSIONS.md` | 전원 | 커뮤니티 확장 14종 (추가형 · 기능 플래그) |
| — | `config/app.json` | 개발 | 기본 설정 원본 (릴리스에 포함) |
| — | `config/app-settings.example.json` | 운영 | 운영 덮어쓰기 예시 |
| — | `prompts/` | 에이전트 | 단계별 작업 지시문 (00 시작 · P0 · P1~P4 · P4.5~P4.6 확장) |
| — | `CHANGELOG.md` · `MANIFEST.txt` | 전원 | 판 기록 · 파일 목록과 SHA256 |
| — | `reference/` | 전원 | 배포 환경 계약 · 운영 매뉴얼 · 재구축 설계 원본 |

## 한 장 요약

| 항목 | 결정 |
|---|---|
| 배포 대상 | 사내망 Windows PC 1대 (기존 `prihr-main`:8080 · HR 포털:8081과 공존, 무접촉) |
| 런타임 | 앱 폴더 안 **포터블 Node.js LTS** (22.13 이상, 권장 24.x) — 공용 Node·PATH 무변경 |
| 웹 | Express 5 (직접 운영 의존성 1개) · 빌드 단계 없음 |
| DB | Node 내장 `node:sqlite` · WAL · 파일 1개 — DB 서버·계정·포트 없음 |
| 화면 | 정적 HTML + 바닐라 JS + 로컬 Pretendard |
| 로그인 | 사무국이 발급하는 1인 1코드 → HttpOnly 세션 쿠키 · 역할 3종(builder·master·office) |
| 서비스 | NSSM 서비스 `olaf-builders` · 포트 8091(제안) |
| 데이터 경로 | `C:\ProgramData\PRI\olaf-builders\{config,data,uploads,logs,backups}` |
| 백업 | 앱이 매일 `VACUUM INTO` · 14개 보존 · 별도 저장소 복사는 예약 작업 |
| 커뮤니티 | 공지·Lab 라운지·그룹 보드·Master Q&A·Build Review·자료 질문 + 확장 12종(알림·채택·질문 카드 답변·태그·신고 등) · `features`로 켜고 끔 |
| 단계 | P0 뼈대 → P1 로그인 → P2 자료 → P3 질문 카드 → P4 커뮤니티 → P4.5·P4.6 확장 → P5 |

## 이 패키지가 보장하지 않는 것

- 대상 서버의 실제 OS·포트·계정·방화벽 상태 (→ `reference/DEPLOYMENT_ENVIRONMENT.md` 3절 값을 운영자가 채운다)
- 사무국 미결 사항(Q1~Q6, D1~D7)의 결론 — 결정 전에는 `docs/11_DECISIONS.md`의 기본값으로 만든다
