# 17. 설치 가이드 — 릴리스 20261116-01 (Windows 로컬서버)

이 문서는 **설치하는 사람**을 위한 한 장짜리 순서표다. 구조·원칙은 `docs/15_WINDOWS_LOCAL_SERVER.md`, 결정 사항은 `docs/11_DECISIONS.md`.
대상: 사내 Windows PC 한 대 · 관리자 PowerShell 5.1 · 서비스명 `olaf-builders` · 기본 포트 `8091`.

> **아직 "운영 개통"이 아니다.** 결정 B1~B5(Node 반입·포트/대역·HTTP 개통·서비스 계정·백업 위치)가 미결이다. 아래 절차는 승인된 범위의 **시범 설치**까지다.

---

## 0. 꾸러미에 든 것

개발 PC의 `dist\` 폴더에 두 파일이 있다 (Git에는 들어 있지 않다 — `dist\`는 제외 대상).

| 파일 | 내용 |
|---|---|
| `olaf-builders-20261116-01.zip` (약 3.1MB) | 앱 코드 + 운영 의존성(`express`) + 스키마 001~004 + 사무국 CLI + 콘텐츠 스냅샷 + `deploy\*.ps1` + `docs\` |
| `olaf-builders-20261116-01.sha256.txt` | zip 전체 해시와 파일별 해시. 설치 스크립트가 반입 중 변조·손상을 검사한다 |

**들어 있지 않은 것:** DB·비밀번호·세션·`.env`·`secrets.json`(서버에서 처음 기동할 때 자동 생성) · 테스트 · 원본 CSV · 사무국 PC용 PDF 변환 도구 · 개발용 메모.
**따로 반입해야 하는 것:** 공식 **Node.js Windows x64 zip** (22.13 이상, 예: `node-v24.x.y-win-x64.zip`). 파일명 형식을 바꾸지 말 것.

콘텐츠 스냅샷(`data\legacy-content.json`)에는 Builder 26명(성명·직위·Lab·그룹)·질문 카드 44장·감사 기록 24건이 있다. 사번·이메일·비밀번호는 없다.

### 개발 PC에서 확인해 둔 것 (2026-11-16, Linux 개발 환경)

- 꾸러미를 새 폴더에 풀고 `NODE_ENV=production`으로 기동 → `/healthz`·`/readyz`가 릴리스 `20261116-01`과 일치
- 스키마 0→4 적용, `integrity_check=ok`
- 스냅샷 복원: 사람 26 · 카드 44 · 감사 24건 추가 (사무국 1명 포함 사람 27)
- 사무국 로그인 → 사무국 질문 카드 API 응답, 로그인 화면 200
- 금지 파일(DB·.env·secrets·csv·xlsx)·네이티브 모듈(`.node`) 없음

### 확인하지 못한 것 (서버에서 처음 확인된다)

- **`pack.ps1` 자체는 실행하지 못했다.** 이 꾸러미는 `pack.ps1`과 같은 규칙(추적 파일만 · 제외 목록 · `npm ci --omit=dev --ignore-scripts` · `RELEASE.json` · 해시 목록)으로 Linux에서 직접 만들었다. Windows에서 같은 릴리스를 다시 만들려면 `pack.ps1`을 쓰되 **릴리스 ID를 새로 정한다**(재사용 금지).
- PowerShell 5.1에서 `install.ps1` 실행, NSSM 등록·시작/정상 종료, 서비스 계정 권한, 방화벽, 다른 PC 접속, 재부팅 복구.
- zip을 Linux에서 만들었으므로 `Expand-Archive`로 푸는 단계가 문제없는지(경로 구분자)는 DryRun 뒤 실제 풀기에서 처음 확인된다.

---

## 1. 설치 전 확인 (서버 · 관리자 PowerShell)

기존 서비스·포트를 먼저 기록한다. **조회만 한다.**

```powershell
Get-Service prihr-main,hrportal,HRPortal8081,olaf-builders -ErrorAction SilentlyContinue
Get-NetTCPConnection -State Listen | Sort-Object LocalPort | Format-Table LocalPort,OwningProcess
Get-Volume | Select-Object DriveLetter,SizeRemaining
```

| 확인 | 기준 |
|---|---|
| 8091 포트 | 비어 있어야 한다. 사용 중이면 **설치하지 말고** 새 포트를 승인받는다 |
| 보호 포트 | 80·443·1234·3389·8080·8081은 쓰지 않는다 (스크립트도 거부) |
| 디스크 | C:·D: 여유 1GB 이상 권장 |
| NSSM | `C:\apps\meeting_recorder_v2\nssm.exe`를 **읽기 전용으로 호출**한다. 다르면 `-NssmExe`로 지정 |
| Node zip 해시 | nodejs.org `SHASUMS256.txt`와 직접 대조한다 (스크립트는 대조하지 않고 경고만 한다) |

---

## 2. 반입 · 풀기

서버의 `D:\in\`에 세 파일을 둔다.

```text
D:\in\olaf-builders-20261116-01.zip
D:\in\olaf-builders-20261116-01.sha256.txt      ← zip과 같은 폴더·같은 이름 규칙
D:\in\node-v24.x.y-win-x64.zip
```

설치 스크립트는 꾸러미 **안**의 `deploy\`에 있다. 설치용 임시 폴더에 한 번 풀어 스크립트만 쓴다(이 폴더는 설치 뒤 지워도 된다).

```powershell
Expand-Archive -LiteralPath D:\in\olaf-builders-20261116-01.zip -DestinationPath D:\in\olaf-builders
cd D:\in\olaf-builders\deploy
```

---

## 3. 사전 점검 (DryRun — 아무것도 만들지 않는다)

```powershell
.\install.ps1 `
  -Release 20261116-01 `
  -PackageZip D:\in\olaf-builders-20261116-01.zip `
  -NodeZip D:\in\node-v24.x.y-win-x64.zip `
  -NssmExe C:\apps\meeting_recorder_v2\nssm.exe `
  -OfficeUsername <사무국 로그인 아이디> `
  -Port 8091 `
  -BindHost 127.0.0.1 `
  -DryRun
```

통과해야 하는 검사: 관리자 권한 · 보호 포트/이름 · 서비스/포트/폴더 충돌 · NSSM·꾸러미·Node 파일 존재 · **zip 해시 일치**. 실패하면 메시지대로 고치고 DryRun을 다시 한다. 실패한 채 `-DryRun`만 빼지 않는다.

## 4. 실제 설치

DryRun을 통과했으면 `-DryRun`만 지우고 같은 명령을 **관리자 PowerShell**에서 실행한다.

수행 내용(자동):

1. 폴더 생성 — 코드 `C:\apps\olaf-builders\{runtime,releases}`, 데이터 `C:\ProgramData\PRI\olaf-builders\{config,data,uploads,logs,backups}`
2. Node 풀기 (22.13 미만이면 중단)
3. 릴리스 풀기 → `C:\apps\olaf-builders\releases\20261116-01`
4. `config` 폴더 접근 제한 (SYSTEM·Administrators만)
5. **전경 시험**: 앱을 잠깐 띄워 `/healthz`·`/readyz`·릴리스 일치 확인 → 종료 → 포트 해제 확인
6. NSSM 서비스 등록 — **수동 시작**
7. 사무국 계정 `OP-01` 생성 — 비밀번호는 화면에서 가려 입력한다(10자 이상 · 영문+숫자+특수문자). 명령줄·Git·로그에 남지 않는다
8. 콘텐츠 스냅샷 복원 (사람 26 · 카드 44 · 감사 24). 빈 설치가 필요할 때만 `-SkipContentRestore`

실패하면 스크립트가 어디까지 됐는지 알려 준다. 서비스가 이미 등록됐다면 `nssm remove olaf-builders confirm`으로 등록만 취소하고 릴리스 폴더를 지운 뒤 처음부터 다시 한다. **기존 서비스(`prihr-main`·`hrportal`)는 건드리지 않는다.**

---

## 5. 수동 단계 (스크립트가 하지 않는다)

| 순서 | 할 일 | 비고 |
|---|---|---|
| 1 | `services.msc` → `olaf-builders` → 로그온 계정 지정 | 결정 B4. 전용 계정 권장. 권한: 릴리스·runtime은 읽기·실행, `data`·`uploads`·`logs`·`backups`는 수정, `config`는 읽기. **전체 사용자 쓰기 권한 부여 금지** |
| 2 | 서비스 시작 후 점검 | 아래 명령 |
| 3 | 자동 시작 전환 | 점검이 끝나기 전에는 하지 않는다. `nssm set olaf-builders Start SERVICE_AUTO_START` |
| 4 | 다른 PC 접속 허용 | 결정 B3 승인 후에만. 아래 6절 |

```powershell
Start-Service olaf-builders
cd C:\apps\olaf-builders\releases\20261116-01
.\deploy\check.ps1 -Port 8091
Get-Content C:\ProgramData\PRI\olaf-builders\logs\err.log -Tail 50
```

브라우저(서버 PC에서 `http://127.0.0.1:8091/`)로 확인한다.

- [ ] 사무국 로그인 → 사무국 메뉴 노출
- [ ] 질문 카드 44장 목록 (`/admin/qcards.html`)
- [ ] 서비스 재시작(`Restart-Service olaf-builders`) 뒤에도 데이터 유지
- [ ] 기존 `prihr-main`(8080)·`hrportal`(8081) 상태 불변

---

## 6. 다른 PC에서 접속하게 하려면 (결정 B3 승인 후)

`127.0.0.1` 바인딩은 서버 PC 자신에서만 열린다. 학습자 PC에서 열려면:

1. NSSM `AppEnvironmentExtra`의 `HOST`를 `0.0.0.0`으로 바꾼다.
2. **앱 전용** 방화벽 규칙을 승인된 대역으로만 연다.
3. 서비스를 재시작하고, 허용 PC·미허용 PC에서 각각 접속 결과를 확인한다.

```powershell
New-NetFirewallRule -Name 'PRI-olaf-builders-TCP-8091' -DisplayName 'PRI-olaf-builders-TCP-8091' `
  -Direction Inbound -Action Allow -Protocol TCP -LocalPort 8091 `
  -Program 'C:\apps\olaf-builders\runtime\node-v24.x.y-win-x64\node.exe' `
  -RemoteAddress '<승인 CIDR>' -Profile '<승인 프로필>'
```

학습자에게 알려 줄 주소는 이때 확정된다: `http://<서버 PC 이름 또는 IP>:8091/`. 외부 인터넷에는 열지 않는다(원칙 A-8).
HTTP는 승인된 내부 시험 범위까지다. 비밀번호·개인정보 운영 개통은 승인된 HTTPS 종단이 전제다.

---

## 7. 설치 후 — 학습자 열기

1. 명단 CSV로 사람 등록, 사람마다 로그인 정보 설정 → `docs/16_LEARNER_ONBOARDING.md` 3절
2. 접속 안내문(주소 칸 채움)을 사무국이 직접 발송 → 같은 문서 2절
3. 질문 카드 화면의 개선 제안(어미 중복·빈 과제명 등)은 같은 문서 1절. **학습자에게 열기 전에** 어미 중복 안내만이라도 반영할지 사무국이 정한다

스냅샷의 Builder 26명은 사람 등록만 되어 있고 **로그인 정보가 없다.** 학습자가 들어오려면 사람마다 `set-credentials`가 필요하다.

---

## 8. 업데이트 · 롤백 · 복원

| 상황 | 명령 (모두 `-DryRun`으로 먼저) |
|---|---|
| 새 릴리스 반입 후 교체 | `.\deploy\update.ps1 -Release <새ID> -PackageZip D:\in\olaf-builders-<새ID>.zip -DryRun` |
| 이전 릴리스로 되돌리기 | `.\deploy\rollback.ps1 -ToRelease <이전ID> -RestoreDb <백업.db> -Confirm ROLLBACK -DryRun` |
| DB 백업 복원 | `.\deploy\restore.ps1 -BackupFile <백업.db> -Confirm RESTORE -DryRun` |

`update.ps1`은 서비스를 정상 종료하고 DB를 `pre-update-*`로 백업한 뒤 전환하며, 새 릴리스가 준비되지 않으면 자동으로 되돌린다. 스키마가 바뀌는 업데이트는 `docs/14_DB_MIGRATION.md`를 먼저 읽는다. **릴리스 ID는 재사용하지 않는다.**

## 9. 장애 시 원칙

- 다른 `node.exe`를 일괄 종료하지 않는다 (기존 앱도 Node일 수 있다).
- 실행 중인 DB 파일을 탐색기로 복사하지 않는다. 백업은 서비스가 만든 `backups\`를 쓴다.
- DB나 업로드를 지워 문제를 숨기지 않는다.
- 기존 서비스·포트·방화벽 규칙을 수정하지 않는다.
- 확인 순서: `err.log` → `/readyz` → 서비스 상태 → 포트 소유 PID.

## 10. 개통 전 남은 일

- 결정 B1~B5 회신, 그리고 B7(과거 리포의 `csv/windows_server.js`에 노출된 비밀번호 교체)
- 별도 백업 저장소 복사와 복원 시험
- 허용·미허용 클라이언트 방화벽 확인
- 재부팅 후 자동 시작 시험(승인된 점검 시간)
- 승인된 HTTPS 또는 운영 위험 수용 기록
