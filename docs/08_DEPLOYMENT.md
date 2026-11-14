# 08. 배포 · 운영

상위 계약: `reference/DEPLOYMENT_ENVIRONMENT.md` · 절차 원본: `reference/PRI_Windows_WebApp_Manual.md` · 운영 실행 런북: `docs/15_WINDOWS_LOCAL_SERVER.md`.
이 문서는 그 계약을 OLAF Builders에 맞춰 구체화한 것이다. 이름·포트는 **제안값**(결정 B2).

## 1. 고정 값 (제안)

| 항목 | 값 |
|---|---|
| 앱 ID · 서비스명 | `olaf-builders` |
| 포트 | `8091` |
| 코드 | `C:\apps\olaf-builders\releases\<YYYYMMDD-NN>\` |
| 런타임 | `C:\apps\olaf-builders\runtime\node-v<버전>-win-x64\node.exe` |
| 공유 폴더 | `C:\ProgramData\PRI\olaf-builders\{config,data,uploads,logs,backups}` |
| NSSM | `C:\apps\meeting_recorder_v2\nssm.exe` (**읽기 전용 호출** · 복사·이동·덮어쓰기 금지) |
| 진입 | `AppParameters = src\server.js` |
| 방화벽 규칙 이름 | `PRI-olaf-builders-TCP-8091` |

## 2. 반입물

| # | 파일 | 만드는 곳 | 비고 |
|---|---|---|---|
| 1 | `node-v<LTS>-win-x64.zip` | nodejs.org 공식 배포본 | 최초 1회 · SHA256을 공식 `SHASUMS256.txt`와 대조 |
| 2 | `olaf-builders-<release>.zip` | 개발 PC `deploy/pack.ps1` | 소스 + `node_modules`(운영) + `RELEASE.json` |
| 3 | `olaf-builders-<release>.sha256.txt` | 같음 | zip 해시 + 파일별 해시 목록 |

서버에서 `npm`·인터넷이 필요 없다. `node_modules`는 순수 JS라 개발 PC(Windows x64)에서 만든 것을 그대로 쓴다(NFR-02가 이를 보장).

## 3. 개발 PC — `deploy/pack.ps1`

```powershell
param([Parameter(Mandatory)][string]$Release)        # 예: 20261120-01
$ErrorActionPreference = 'Stop'
# 1. git 작업 트리 깨끗한지 · 태그/커밋 기록
# 2. git archive → 임시 폴더 풀기 (추적 파일만 → 실데이터·.local 없음)
# 3. 임시 폴더에서: npm.cmd ci --omit=dev --ignore-scripts ; 종료코드 확인
# 4. node --test (개발 의존성 없으므로 같은 폴더에서 가능) ; 종료코드 확인
# 5. RELEASE.json {release, commit, node:<개발 PC node -v>, builtAt}
# 6. 금지 파일 검사: *.db, *.sqlite*, .env*, secrets.json, *.csv(test/fixtures 제외), *.xlsx → 있으면 중단
# 7. Compress-Archive → olaf-builders-<Release>.zip · Get-FileHash → .sha256.txt
```

## 4. 서버 — 최초 설치 `deploy/install.ps1`

```powershell
param(
  [Parameter(Mandatory)][string]$Release,
  [Parameter(Mandatory)][string]$PackageZip,
  [Parameter(Mandatory)][string]$NodeZip,
  [int]$Port = 8091,
  [string]$BindHost = '127.0.0.1',      # 결정 B3 승인 후 0.0.0.0
  [switch]$DryRun
)
```

| 단계 | 내용 | 실패 시 |
|---|---|---|
| 0 | 관리자 권한 · PowerShell 5.1+ 확인 | 중단 |
| 1 | 보호 값 거부: 포트 80·443·1234·3389·8080·8081 · 서비스명 `prihr-main`·`hrportal`·`HRPortal8081` | 중단 |
| 2 | 충돌 검사: `Get-Service olaf-builders` 없음 · `Get-NetTCPConnection -State Listen -LocalPort $Port` 없음 · 릴리스 폴더 없음 · NSSM 파일 존재 | 중단 |
| 3 | 해시 대조 (`.sha256.txt`) | 중단 |
| 4 | 폴더 생성: `C:\apps\olaf-builders\{runtime,releases}` · 공유 폴더 5개 | — |
| 5 | Node zip → `runtime\` 풀기 (이미 같은 버전 있으면 건너뜀) · `node.exe --version` 확인 | 중단 |
| 6 | 릴리스 zip → `releases\<Release>\` 풀기 · `src\server.js` 존재 확인 | 중단 |
| 7 | `config\` ACL: 상속 해제, SYSTEM·Administrators 전체 (+서비스 계정 읽기) | 중단 |
| 8 | **전경 시험:** 환경변수 설정 후 `node.exe src\server.js`를 `Start-Process -PassThru`로 → `/healthz`·`/readyz` 60초 대기(앱·릴리스 일치) → 프로세스 종료 → 포트 해제 확인 | 중단 (프로세스 정리) |
| 9 | NSSM 등록 (아래) · **수동 시작(SERVICE_DEMAND_START)** | 등록 취소 안내 |
| 10 | 첫 사무국: ID/비밀번호를 가려 입력해 `tools\admin.js bootstrap` 실행 | 중단 또는 재설정 안내 |
| 11 | 승인 콘텐츠 스냅샷 복원 (`-SkipContentRestore`로만 생략) | 중단 |
| 12 | 요약 출력: 완료 단계 · 남은 수동 단계(계정·자동 시작·방화벽) | — |

`-DryRun`: 사전 검사만 실제 수행하고 이후 설치 단계는 "할 일"로만 출력한다. 아무것도 만들지 않으며 "설치 완료"라고 출력하지 않는다.
모든 외부 실행 파일 호출 뒤 `$LASTEXITCODE` 확인. 실패하면 `[FAIL]` + 완료/미완료 목록 + 복구 안내, 종료코드 1.

### NSSM 설정

```powershell
$Nssm = 'C:\apps\meeting_recorder_v2\nssm.exe'
$Node = "C:\apps\olaf-builders\runtime\node-v$NodeVer-win-x64\node.exe"
$Rel  = "C:\apps\olaf-builders\releases\$Release"
$Sh   = 'C:\ProgramData\PRI\olaf-builders'
Invoke-Nssm install olaf-builders $Node
Invoke-Nssm set olaf-builders AppDirectory $Rel
Invoke-Nssm set olaf-builders AppParameters 'src\server.js'
Invoke-Nssm set olaf-builders DisplayName 'PRI olaf-builders (8091)'
Invoke-Nssm set olaf-builders Start SERVICE_DEMAND_START
Invoke-Nssm set olaf-builders AppStdout "$Sh\logs\out.log"
Invoke-Nssm set olaf-builders AppStderr "$Sh\logs\err.log"
Invoke-Nssm set olaf-builders AppRotateFiles 1
Invoke-Nssm set olaf-builders AppRotateBytes 10485760
Invoke-Nssm set olaf-builders AppExit Default Restart
Invoke-Nssm set olaf-builders AppRestartDelay 5000
Invoke-Nssm set olaf-builders AppStopMethodConsole 15000      # Ctrl+C(SIGINT) 먼저 → 정상 종료 기회
Invoke-Nssm set olaf-builders AppEnvironmentExtra `
  'NODE_ENV=production' "PORT=$Port" "HOST=$BindHost" `
  "APP_DATA_DIR=$Sh\data" "APP_UPLOAD_DIR=$Sh\uploads" `
  "APP_CONFIG_FILE=$Sh\config\app-settings.json" "APP_BACKUP_DIR=$Sh\backups" `
  "APP_RELEASE=$Release" 'TRUST_PROXY=0'
```

## 5. 운영자 수동 단계 (승인 후)

1. `services.msc`에서 `olaf-builders`만 선택 → 로그온 계정 지정(결정 B4). 전용 계정이면 공유 폴더 `data`·`uploads`·`logs`·`backups` 수정, `config` 읽기, 릴리스·런타임 읽기/실행 권한.
2. `Start-Service olaf-builders` → `deploy\check.ps1` PASS 확인.
3. 자동 시작 전환: `nssm set olaf-builders Start SERVICE_AUTO_START`.
4. (결정 B3 승인 시) `HOST=0.0.0.0`으로 바꾸고 방화벽:

```powershell
New-NetFirewallRule -Name 'PRI-olaf-builders-TCP-8091' -DisplayName 'PRI-olaf-builders-TCP-8091' `
  -Direction Inbound -Action Allow -Protocol TCP -LocalPort 8091 `
  -Program $Node -RemoteAddress '<승인 대역>' -Profile '<승인 프로필>'
```

5. 다른 사내 PC에서 `http://<서버>:8091/` 로그인 → 메뉴 확인. 미허용 PC에서 실패 확인.

## 6. 점검 `deploy/check.ps1`

| # | 점검 | PASS |
|---|---|---|
| C1 | `Get-Service olaf-builders` | Running |
| C2 | 8091 리스닝 프로세스 = 서비스 PID의 node.exe | 일치 |
| C3 | `/healthz` | 200 · app·release 일치 |
| C4 | `/readyz` | 200 |
| C5 | `node.exe tools\check.js --integrity` | `ok` |
| C6 | 최신 백업 파일 | 26시간 이내 |
| C7 | 디스크 여유 (공유 폴더 드라이브) | ≥ 2GB |
| C8 | `prihr-main`·`hrportal` 서비스 상태 | 점검 전과 동일 (조회만) |
| C9 | err.log 마지막 50줄 | 최근 `FATAL` 없음 |

## 7. 업데이트 `deploy/update.ps1 -Release <새> -PackageZip <zip>`

1. 해시 대조 → 새 릴리스 폴더에 풀기(기존 폴더 덮어쓰기 금지).
2. 현재 `AppDirectory`·`APP_RELEASE`를 `C:\apps\olaf-builders\deploy-history.log`에 기록.
3. `Stop-Service olaf-builders` → 중지·포트 해제 확인.
4. `data\olaf.db`(+wal·shm 있으면 함께) → `backups\pre-update-<옛릴리스>-<시각>.db` 복사.
5. `AppDirectory` 교체 · `AppEnvironmentExtra`의 `APP_RELEASE`만 교체(나머지 유지 — 전체 목록을 다시 씀).
6. `Start-Service` → `/readyz` + release 일치 60초 대기.
7. 실패하면 **자동 롤백**: 중지 → 이전 AppDirectory·APP_RELEASE 복원 → 스키마 버전이 바뀌었으면 4번 백업 DB로 복원 → 시작 → 결과 출력(`[ROLLED BACK]`).

## 8. 롤백 `deploy/rollback.ps1 -ToRelease <릴리스> [-RestoreDb <백업파일>] -Confirm ROLLBACK`

`deploy-history.log`의 직전 값으로 AppDirectory·APP_RELEASE 복원. 새 릴리스가 스키마를 올렸다면(`/readyz` 503 · 로그 `schema newer than code`) `-RestoreDb` 필수.

## 9. 백업 · 복원

| 작업 | 수단 |
|---|---|
| 일일 백업 | 앱 내부 (`docs/03_DATA_MODEL.md` 6절) |
| 별도 저장소 복사 | 승인된 예약 작업에서 `robocopy backups`·`uploads` /E · 종료코드 0~7 성공 |
| 복원 | `deploy/restore.ps1 -BackupFile <파일> -Confirm RESTORE`: 무결성 검사 → 서비스 중지 → 현재 DB 보존 → 교체 · wal/shm 삭제 → 시작 → `/readyz` |
| 복원 시험 | 분기 1회: 백업 파일로 개발 PC에서 `APP_DATA_DIR` 지정 기동 → 건수 대조 |

## 10. 제거 (별도 승인 · 파괴적)

제거는 별도 변경 승인 후 수동으로 수행한다. 서비스 중지 → `nssm remove olaf-builders confirm` → 앱 전용 방화벽 규칙만 제거하고, **파일은 삭제하지 않는다**. 공유 폴더 삭제는 보존 기간 경과·승인 뒤 사람이 한다. 공용 Node·NSSM·기존 서비스는 건드리지 않는다.

## 11. 장애 대응 요약

| 증상 | 먼저 볼 것 | 금지 |
|---|---|---|
| 서비스 즉시 종료 | `err.log` (설정 오류·포트 거부·스키마 버전) | 다른 node.exe 종료 |
| `/readyz` 503 | 응답 `checks` 이름 → 해당 폴더 권한·DB 파일 | DB 파일 삭제 |
| EADDRINUSE | 8091 소유 PID | 포트 소유 확인 없이 프로세스 종료 |
| 로그인 안 됨 (전원) | `secrets.json` 바뀌었는지 · 시계 | 키 파일 재생성(전원 코드 무효화) |
| DB 손상 의심 | `tools\check.js --integrity` | 실행 중 파일 복사 |
| 디스크 부족 | `uploads`·`backups`·`logs` 크기 | 승인 없는 일괄 삭제 |
