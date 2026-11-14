# Windows 로컬서버 운영 런북

이 문서가 OLAF Builders의 최종 배포 경로다. 대상은 사내 Windows PC 한 대이며, 앱은 별도 Node 런타임과 NSSM 서비스로 실행한다.

## 1. 운영 구조

```text
C:\apps\olaf-builders\
  runtime\node-v<version>-win-x64\node.exe
  releases\<YYYYMMDD-NN>\                 릴리스별 불변 코드
  deploy-history.jsonl

C:\ProgramData\PRI\olaf-builders\
  config\app-settings.json
  data\olaf.db
  uploads\
  logs\out.log, err.log
  backups\
```

- 서비스명: `olaf-builders`
- 기본 포트: `8091` (`8080`, `8081` 등 보호 포트 사용 금지)
- 운영 진입점: `node.exe src\server.js`
- 영구 데이터는 릴리스 폴더 밖에 둔다.
- 기존 `prihr-main`, `hrportal` 서비스는 조회 외에 변경하지 않는다.

## 2. 배포 전 확정할 값

| 항목 | 확인값 |
|---|---|
| 대상 Windows 버전·x64 여부 | 운영자가 실제 조회 |
| Node ZIP과 공식 SHA256 | 22.13 이상 승인 버전 |
| NSSM 경로·버전 | 기본 제안 `C:\apps\meeting_recorder_v2\nssm.exe` |
| 서비스 계정 | 최소 권한 전용 계정 또는 승인된 SYSTEM |
| 바인딩 | 서버 자체만이면 `127.0.0.1`, 다른 PC 접근이면 승인 후 `0.0.0.0` |
| 허용 클라이언트 대역 | 방화벽 규칙에 명시 |
| HTTPS 진입점 | 개인정보 운영 개통 전에 별도 승인 |
| 별도 백업 저장소 | 같은 PC `backups` 외 추가 위치 |

관리자 PowerShell에서 기존 서비스와 포트를 먼저 기록한다.

```powershell
Get-Service prihr-main,hrportal,olaf-builders -ErrorAction SilentlyContinue
Get-NetTCPConnection -State Listen | Sort-Object LocalPort
Get-Volume | Select-Object DriveLetter,SizeRemaining
```

## 3. 개발 PC에서 릴리스 만들기

작업 트리가 깨끗하고 `main`이 원격과 같은지 확인한 다음 실행한다.

```powershell
git status --short
git pull --ff-only origin main
npm ci
npm test
.\deploy\pack.ps1 -Release 20261114-01
```

생성물:

- `dist\olaf-builders-20261114-01.zip`
- `dist\olaf-builders-20261114-01.sha256.txt`

ZIP에는 운영 의존성, 스키마 v4, 관리자 CLI, 콘텐츠 스냅샷이 포함된다. 실제 DB·비밀번호·세션·CSV는 포함되지 않는다.

## 4. 서버 최초 설치

서버에 앱 ZIP, SHA256 파일, 공식 Node Windows x64 ZIP을 반입한다. 먼저 변경 없는 사전 점검을 실행한다.

```powershell
cd D:\in\olaf-builders\deploy
.\install.ps1 `
  -Release 20261114-01 `
  -PackageZip D:\in\olaf-builders-20261114-01.zip `
  -NodeZip D:\in\node-v24.19.0-win-x64.zip `
  -NssmExe C:\apps\meeting_recorder_v2\nssm.exe `
  -OfficeUsername dk.cho `
  -Port 8091 `
  -BindHost 127.0.0.1 `
  -DryRun
```

모든 사전 검사가 통과하면 `-DryRun`만 제거해 실행한다. 비밀번호는 화면에서 가려 입력되며 명령행·Git·로그에 남기지 않는다.

설치 스크립트는 다음을 수행한다.

1. 충돌·해시·Node·NSSM 확인
2. 릴리스와 영구 폴더 생성
3. 전경 기동으로 `/healthz`, `/readyz`, 릴리스 일치 확인
4. NSSM 서비스를 수동 시작으로 등록
5. `OP-01` 관리자 계정 생성
6. `data\legacy-content.json`의 작성자 26명·질문카드 44건·감사 24건 복원

콘텐츠 없이 빈 설치가 필요한 경우에만 `-SkipContentRestore`를 사용한다.

## 5. 서비스 계정과 ACL

설치 후 서비스를 시작하기 전에 `services.msc`에서 승인된 로그온 계정을 설정한다.

| 경로 | 필요한 권한 |
|---|---|
| `releases\<release>` | 읽기·실행 |
| `runtime\<node>` | 읽기·실행 |
| `config` | 읽기, 런타임 설정 변경 시 쓰기 |
| `data`, `uploads`, `logs`, `backups` | 수정 |

전체 사용자 쓰기 권한으로 해결하지 않는다. 계정 설정 후 서비스를 시작하고 점검한다.

```powershell
Start-Service olaf-builders
.\deploy\check.ps1 -Port 8091
```

점검이 끝나기 전에는 자동 시작으로 바꾸지 않는다.

## 6. 다른 PC에서 접속하게 할 때

`127.0.0.1` 바인딩은 서버 자체에서만 접속할 수 있다. 사내 다른 PC 접속 승인을 받은 뒤 다음을 수행한다.

1. NSSM `AppEnvironmentExtra`의 `HOST`를 `0.0.0.0`으로 변경한다.
2. 앱 전용 방화벽 규칙을 승인 대역으로 제한한다.
3. 서비스를 재시작한다.
4. 허용 PC와 미허용 PC에서 각각 접속 결과를 확인한다.

```powershell
New-NetFirewallRule `
  -Name 'PRI-olaf-builders-TCP-8091' `
  -DisplayName 'PRI-olaf-builders-TCP-8091' `
  -Direction Inbound -Action Allow -Protocol TCP -LocalPort 8091 `
  -Program 'C:\apps\olaf-builders\runtime\node-v24.19.0-win-x64\node.exe' `
  -RemoteAddress '<승인 CIDR>' -Profile '<승인 프로필>'
```

HTTP 직접 접속은 승인된 내부 시험 범위다. 비밀번호·개인정보 운영 개통은 승인된 HTTPS 종단을 전제로 한다.

## 7. 기존 설치 업데이트

새 릴리스 ZIP과 SHA256을 서버로 반입한 뒤 관리자 PowerShell에서 실행한다.

```powershell
.\deploy\update.ps1 `
  -Release 20261114-02 `
  -PackageZip D:\in\olaf-builders-20261114-02.zip `
  -DryRun
```

계획을 확인한 뒤 `-DryRun`을 제거한다. 스크립트는 서비스를 정상 종료하고 DB를 `pre-update-*`로 백업한 뒤 새 릴리스로 전환한다. 새 릴리스의 준비 상태 또는 릴리스 값이 맞지 않으면 이전 코드와 DB를 자동 복원한다.

스키마 v3→v4 업데이트에서는 기존 접속코드와 세션이 제거된다. 업데이트 후 관리자가 `tools\admin.js set-credentials`로 ID/비밀번호를 다시 설정해야 한다. 자세한 DB 절차는 `docs\14_DB_MIGRATION.md`를 따른다.

## 8. 릴리스 롤백

이전 릴리스 폴더가 남아 있어야 한다. 스키마가 바뀌었다면 해당 릴리스 시점의 DB 백업도 지정한다.

```powershell
.\deploy\rollback.ps1 `
  -ToRelease 20261114-01 `
  -RestoreDb C:\ProgramData\PRI\olaf-builders\backups\pre-update-20261114-01-20261114-120000.db `
  -Confirm ROLLBACK `
  -DryRun
```

검토 후 `-DryRun`을 제거한다. 실패하면 롤백 직전 코드와 DB로 다시 복구한다.

## 9. DB 백업 복원

복원할 DB가 `integrity_check=ok`인지 먼저 검사되며, 현재 DB는 `before-restore-*`로 보존된다.

```powershell
.\deploy\restore.ps1 `
  -BackupFile C:\ProgramData\PRI\olaf-builders\backups\olaf-20261114.db `
  -Confirm RESTORE `
  -DryRun
```

검토 후 `-DryRun`을 제거한다. 복원 DB로 서비스가 준비되지 않으면 복원 직전 DB로 자동 복구한다.

## 10. 운영 점검

```powershell
Get-Service olaf-builders
.\deploy\check.ps1 -Port 8091
Get-Content C:\ProgramData\PRI\olaf-builders\logs\err.log -Tail 50
```

브라우저에서 다음을 확인한다.

- `dk.cho` 관리자 로그인
- 관리자·사무국 메뉴 노출
- 질문카드 44건 및 전체 화면 보기
- 서비스 재시작 후 데이터 유지
- 기존 `prihr-main:8080`, `hrportal:8081` 상태 불변

## 11. 운영 개통 판정

다음이 모두 확인돼야 완료다.

- [ ] 관리자 PowerShell DryRun 통과
- [ ] 새 서비스만 등록되고 기존 서비스는 변경되지 않음
- [ ] `healthz`, `readyz`, release 일치
- [ ] DB `integrity_check=ok`, 스키마 v4
- [ ] 관리자 로그인과 역할 권한 정상
- [ ] 질문카드 44건·작성자 데이터 정상
- [ ] 별도 백업 저장소 복사와 복원 시험 완료
- [ ] 허용·미허용 클라이언트 방화벽 확인
- [ ] 승인된 HTTPS 또는 운영 위험 수용 기록
- [ ] 재부팅 후 자동 시작 시험은 승인된 점검 시간에 수행

## 12. 장애 시 원칙

- 다른 `node.exe`를 일괄 종료하지 않는다.
- 실행 중인 DB 파일을 탐색기에서 복사하지 않는다.
- DB나 업로드를 삭제해 문제를 숨기지 않는다.
- 기존 서비스·포트·방화벽 규칙을 수정하지 않는다.
- `err.log`, `/readyz`, 서비스 상태, 포트 소유 PID 순서로 확인한다.
