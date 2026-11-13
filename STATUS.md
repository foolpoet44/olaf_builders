# STATUS — OLAF Builders (재구축판)

- 완료: P0 · P1 · P2 · P3 · P4 커뮤니티 기본 · P4.5 확장 1차 · P4.6 확장 2차
- 진행: 릴리스 패키징 검증
- 블로커: 서버 설치 전 결정 B1~B5 (docs/11_DECISIONS.md) · 기존 리포 노출 비밀번호 교체 B7
- 다음: P1 → P2 → P3 → P4 → P4.5 → P4.6

## 단계 보드

| 단계 | 상태 | 테스트 | 비고 |
|---|---|---|---|
| P0 뼈대 | 완료 | 33 PASS | 전경 기동·강제 종료 후 재기동·DB 유지 확인 · install.ps1 DryRun 확인(개발 PC) |
| P1 로그인·포털 | 완료 | 누적 61 PASS | 코드 로그인·세션·횟수 제한·권한 자동 순회·CLI 7개 명령 |
| P2 교육 자료 | 완료 | 누적 70 PASS | 꾸러미 zip 검사·등록·공개·숨김·쪽 이미지·열람 건수 · 사무국 PC 변환 도구(render_pdf.py) 실제 PDF 로 확인 |
| P3 질문 카드 | 완료 | 누적 87 PASS | 규칙 공용 모듈(화면·서버) · 3장 제한 · 판 · 철회 · 선정 · CSV(BOM·수식 주입 방지) · 마감 스위치 · 사무국 화면 3종 |
| P4 커뮤니티 | 완료 | 누적 102 PASS | can() 판정표 · 새 판 · 상태 삭제 · 숨김(사유) · 이전 판(사무국) · 검색(권한 공간 안) · 저장 훅·목록 훅 |
| P4.5 확장 1차 | 완료 | 누적 110 PASS | 틀·디렉터리·고정·채택·카드 답변 글·알림 API + 기능 끔 회귀. 화면 directory.html·board-ext.js·portal-ext.js |
| P4.6 확장 2차 | 완료 | 누적 119 PASS + 라이브 스모크 | 일정·이번 주 새 글·안내 문안·자료 질문 스레드·저장함·태그·신고 + 화면(events·bookmarks·admin/reports·자료 패널·포털 블록) · 기능 끔 회귀 |

## 미검증 (대상 서버 필요)

- NSSM 등록·서비스 시작/중지·AppStopMethodConsole 정상 종료 · 서비스 계정 권한 · 방화벽 · 다른 PC 접속 · 재부팅 복구

## 발견/제안

- PowerShell 5.1 은 BOM 없는 UTF-8 스크립트의 한글을 시스템 코드 페이지로 읽어 구문 오류가 난다 → `deploy/*.ps1` 은 UTF-8 BOM + CRLF 로 저장한다(편집기 설정 주의).
- Windows 에서 `process.exit()` 를 진행 중인 fetch 직후 호출하면 libuv 단언 실패가 난다 → 도구는 `process.exitCode` 로 끝낸다.
- `install.ps1 -NssmExe` 매개변수 추가: 기본값은 서버의 NSSM 경로, 개발 PC 에서 DryRun 시험용으로만 바꾼다.
