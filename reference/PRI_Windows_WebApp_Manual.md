# PRI 로컬 윈도우 서버 웹앱 구축·배포·운영 매뉴얼

버전 1.0 · 작성일 2026-11-13 · 대상: 서버 운영자 및 웹앱 개발자

> 이 문서는 첨부된 한 대의 로컬 PC 현황과 프로젝트 소스를 바탕으로 만든 **신규 웹앱용 권장 운영 절차**다. 실제 윈도우 PC에 접속하거나 설치 명령을 실행하지 않았다. 서비스 등록·방화벽·계정·재부팅은 승인 후 서버에서 운영자가 수행한다. 명령 예제의 앱명 `pri-webapp`과 포트 `8082`는 신규 제안값이며 현재 설치·사용 가능이 확인된 값이 아니다.

## 1. 먼저 이해할 환경과 금지사항

| 구분 | 첨부 자료 기준 환경 | 해석 |
|---|---|---|
| 서버 | 10.164.202.198, 로컬 윈도우 PC 1대 | 새 PC나 Azure VM이 아님 |
| OS | Windows Server 2025 Standard로 문서에 기재 | 실측 버전·아키텍처는 배포 전 확인 |
| 사내 이름 | lgprihr.lge.com | 실제 DNS와 대상 IP는 별도 확인 |
| 원격 접속 | 운영 문서 RDP 1234, 초기 기록 3389 | 1234 우선 참고, 담당자에게 현행 값 확인 |
| 기존 메인 | prihr-main / C:\apps\meeting_recorder_v2 / windows_server.js / 8080 | 수정·재시작·중복 실행 금지 |
| HR 포털 | C:\apps\hr-portal / hrportal_server.js / 기본 8081 | hrportal 서비스 또는 HRPortal8081 예약 작업 실제 조회 |
| Node | C:\Program Files\nodejs\node.exe | 설치 버전 미확인, 공용 런타임 임의 교체 금지 |
| NSSM | C:\apps\meeting_recorder_v2\nssm.exe | 절대경로로 사용, 파일 이동·덮어쓰기 금지 |
| 자동배포 입력 | D:\https | 외부 Hosting API로 전송하는 입력 폴더, 앱 실행 폴더가 아님 |
| 기타 기존 영역 | D:\save, D:\tech | 신규 앱 데이터 저장에 전용하지 않음 |
| 외부 연계 | Azure VM / prihr.com / Cloudflare Pages | 로컬 PC와 구분, 신규 앱에서 자동 사용하지 않음 |

**절대 하지 않을 작업:** `pm2 start windows_server.js`, 기존 서비스 일괄 중지, 공용 Node 전역 업그레이드, 윈도우 방화벽 전체 해제, 승인 없는 RDP·80·443 설정 변경, 운영 소스에 비밀값 삽입, 실제 HR 자료를 D:\https에 시험 투입.

IIS·PM2는 초기 구축 이력에 등장한다. 현행 메인 실행 기준은 NSSM이다. 로컬 80/443→8080의 연결과 Caddy 위치는 확정되지 않았으므로 새 앱의 라우팅 기반으로 가정하지 않는다. [근거 S1~S5]

## 2. 배포 방식을 고른다

| 앱 유형 | 권장 경로 | 주의 |
|---|---|---|
| 단일 HTML 보고서 | 승인된 경우 D:\https 자동배포 | 외부 전송 승인, 새 파일명, 결과 URL 확인 |
| HTML/CSS/JS로 된 SPA | 별도 Node 정적 서버와 서비스 | dist만으로 프로세스는 생기지 않음. SPA 새로고침 fallback 구현 |
| Node.js API·Express | 별도 폴더·포트·NSSM 서비스 | 명시적인 운영 진입 파일 필요 |
| Next.js SSR·API | Windows에서 의존성 설치·빌드 후 next start를 서비스화 | next dev 금지, 정적 자동배포와 혼동 금지 |

본 매뉴얼의 기본 경로는 **Node 또는 Next.js 앱을 별도 서비스로 배포**하는 것이다. Docker·WSL·IIS 프록시·DB 서버가 이미 있다고 가정하지 않는다. HTTP 직접 접속은 비민감 테스트에 한정하며 개인정보·비밀번호·세션이 오가는 운영 개통은 승인된 HTTPS 경로 확보를 전제로 한다.

## 3. 배포 전에 기록할 값과 사전 점검

배포 작업표에 앱 식별자, 담당자, 릴리스 번호, 승인 포트, Node 경로·버전, 실행 파일, 서비스 계정, 허용 클라이언트 범위, HTTPS 진입점, 인증 방식, 데이터 백업 위치를 기록한다. CPU·RAM·디스크 여유와 기존 앱의 부하도 확인한다. 포트가 비어 있어도 조직 내 할당 승인이 필요하다.

### 3.1 읽기 전용 조회 — 서버의 관리자 PowerShell

```powershell
Get-CimInstance Win32_OperatingSystem |
  Select-Object Caption, Version, OSArchitecture, FreePhysicalMemory
Get-CimInstance Win32_ComputerSystem |
  Select-Object Name, TotalPhysicalMemory, NumberOfLogicalProcessors
Get-Volume | Select-Object DriveLetter, Size, SizeRemaining
$PSVersionTable.PSVersion
Get-Command node, npm.cmd -ErrorAction SilentlyContinue
& 'C:\Program Files\nodejs\node.exe' --version
& 'C:\Program Files\nodejs\npm.cmd' --version
Get-Service -Name prihr-main,hrportal -ErrorAction SilentlyContinue
Get-ScheduledTask -TaskName HRPortal8081 -ErrorAction SilentlyContinue
Get-NetTCPConnection -State Listen |
  Select-Object LocalAddress,LocalPort,OwningProcess |
  Sort-Object LocalPort
Get-NetConnectionProfile
Resolve-DnsName lgprihr.lge.com
Get-ItemProperty 'HKLM:\SYSTEM\CurrentControlSet\Control\Terminal Server\WinStations\RDP-Tcp' |
  Select-Object PortNumber
```

조회 결과에 누락·오류가 있으면 원인을 기록하고 해당 선행조건을 해결한다. DNS가 다른 IP를 가리키면 임의 hosts 수정으로 숨기지 않는다. 방화벽 네트워크 프로필도 임의 변경하지 않는다. RDP 확인은 조회만 하며 포트를 바꾸지 않는다.

### 3.2 기존 서비스 기준선 보관

```powershell
$Nssm = 'C:\apps\meeting_recorder_v2\nssm.exe'
if (!(Test-Path -LiteralPath $Nssm)) { throw 'NSSM 경로 확인 필요' }
& $Nssm get prihr-main Application
& $Nssm get prihr-main AppDirectory
& $Nssm get prihr-main AppParameters
& $Nssm get prihr-main ObjectName
curl.exe --max-time 15 -I http://127.0.0.1:8080
```

기존 앱의 200 응답은 Azure 프록시 응답일 수 있다. 기준선은 서비스·포트·대표 화면을 함께 확인한다. 환경변수 전체 출력은 비밀값을 노출할 수 있으므로 금지한다. 현재 런타임이 앱 요구조건을 충족하지 못하면 배포를 중단하고 별도 승인된 런타임 경로를 설계한다. 운영용 Node는 배포 시점에 지원 중인 LTS를 선택하되 공용 설치를 덮어쓰지 않는다. [S6]

## 4. 신규 앱 폴더와 배포 계약

아래는 기존 앱과 충돌하지 않도록 제안한 구조다. `C:\ProgramData\PRI`는 기존 현황이 아니라 새로 승인·생성할 영역이다.

```text
C:\apps\pri-webapp\
  releases\
    20261113-01\       소스, package.json, lockfile, 빌드 결과, node_modules
    20261113-02\       다음 릴리스; 실행 중 릴리스 덮어쓰기 금지

C:\ProgramData\PRI\pri-webapp\
  config\             접근 제한된 설정·비밀정보
  data\               릴리스 교체에도 유지되는 업무 데이터
  uploads\            승인된 업로드 파일
  logs\               out.log, err.log
  backups\            동일 PC의 단기 복구본; 별도 승인 저장소 백업도 필요
```

**앱이 구현해야 할 환경변수 계약:** `NODE_ENV=production`, `PORT`, `HOST`, `APP_DATA_DIR`, `APP_UPLOAD_DIR`, `APP_CONFIG_FILE`. 이 값들은 기존 HR 포털의 변수와 다르며 **새 앱에서 읽도록 구현해야 한다**. 환경변수를 지정하기만 해서는 자동으로 기능이 생기지 않는다. 비밀 파일은 웹 루트 밖에 두고 앱이 명시적으로 읽는다. 일반 Node는 .env를 자동으로 읽는다고 가정하지 않는다.

**포트·서비스 예제:** 신규 `pri-webapp`, `8082`. 기존 `prihr-main`, `hrportal`, `HRPortal8081`, `8080`, `8081`은 사용 금지. 직접 사내 테스트는 `HOST=0.0.0.0`; 승인된 로컬 프록시 뒤에 배치할 때는 `127.0.0.1`과 외부 접근 차단을 별도 설계한다.

### 4.1 작업 변수 — 예제값 검토 후 동일 PowerShell 창에서 실행

```powershell
$ErrorActionPreference = 'Stop'
$AppId = 'pri-webapp'           # 신규 예제명, 실제 승인명으로 교체
$Port = 8082                    # 승인·충돌 확인 후 확정
$ReleaseId = '20261113-01'      # 실제 배포마다 변경
$Base = Join-Path 'C:\apps' $AppId
$Release = Join-Path (Join-Path $Base 'releases') $ReleaseId
$Shared = Join-Path 'C:\ProgramData\PRI' $AppId
$Node = 'C:\Program Files\nodejs\node.exe'
$Npm = 'C:\Program Files\nodejs\npm.cmd'
$Nssm = 'C:\apps\meeting_recorder_v2\nssm.exe'
$RuleName = "PRI-$AppId-TCP-$Port"

if ($AppId -in @('prihr-main','hrportal','HRPortal8081')) { throw '기존 이름 사용 금지' }
if ($Port -in @(80,443,1234,3389,8080,8081)) { throw '보호 포트 사용 금지' }
foreach ($p in @($Node,$Npm,$Nssm)) {
  if (!(Test-Path -LiteralPath $p -PathType Leaf)) { throw "파일 없음: $p" }
}
if (Get-Service -Name $AppId -ErrorAction SilentlyContinue) { throw '신규 설치가 아님: 업데이트 절차 사용' }
if (Get-NetTCPConnection -State Listen -LocalPort $Port -ErrorAction SilentlyContinue) {
  throw '포트 사용 중: 소유 프로세스를 확인하고 새 포트를 승인받으세요'
}
if (Test-Path -LiteralPath $Release) { throw '동일 릴리스 폴더 재사용 금지' }
New-Item -ItemType Directory -Path $Release -Force | Out-Null
foreach ($d in @('config','data','uploads','logs','backups')) {
  New-Item -ItemType Directory -Path (Join-Path $Shared $d) -Force | Out-Null
}
```

이 단계는 디렉터리를 생성한다. 설치 승인 후 실행한다. 서비스 계정에는 코드 읽기·실행, 데이터·업로드·로그의 필요한 쓰기 권한만 부여하고 설정 파일은 최소 읽기 권한으로 제한한다. 구체적인 계정명·ACL은 사내 관리자와 확정하며 전체 사용자 쓰기 허용으로 해결하지 않는다.

## 5. 파일 전달·의존성 설치·운영 빌드

### 5.1 완전한 배포본을 준비한다

- 실제 화면, 서버 소스, 필요한 로컬 모듈, 이미지·폰트, 설정 예시, lockfile, 라이선스·사용 모듈 목록을 포함한다.
- 실데이터·비밀번호·세션·토큰·운영 .env를 개발 저장소나 공유 ZIP에 넣지 않는다.
- Linux/macOS의 node_modules를 복사하지 않는다. Windows에서 동일 lockfile로 재설치한다. 네이티브 모듈은 대상 OS·아키텍처·Node 버전을 맞춘다.
- 전달 ZIP의 상대경로를 검사하고 새 릴리스 폴더에만 압축 해제한다. 승인된 전송 수단을 사용한다.
- 현재 첨부 hr_portal.zip은 파일 5개뿐이며 화면·데이터·install.ps1·attmail.js 등이 빠져 있다. 그대로 완전 배포본으로 사용하지 않는다.

### 5.2 패키지 기반 앱 — 새 릴리스에서만 실행

```powershell
Push-Location $Release
try {
  if (!(Test-Path -LiteralPath 'package.json')) { throw 'package.json 없음' }
  if (!(Test-Path -LiteralPath 'package-lock.json')) { throw 'npm lockfile 없음' }
  & $Npm ci
  if ($LASTEXITCODE -ne 0) { throw 'npm ci 실패' }
  & $Npm run build
  if ($LASTEXITCODE -ne 0) { throw '운영 빌드 실패' }
} finally {
  Pop-Location
}
```

위 블록은 `build` 스크립트가 있는 npm 프로젝트용이다. 빌드 없는 순수 Node 앱은 문서에 명시한 검증 명령으로 대체한다. 실제 외부·로컬 의존성이 전혀 없는 경우에만 npm 설치를 생략한다. 사내 프록시·레지스트리·인증서 오류를 TLS 검증 해제로 우회하지 않는다. 필요한 설치 스크립트와 패키지를 사전 검토한다.

Next.js는 일반 `next start` 배포를 기준으로 한다. `.next`, `public`, 런타임 의존성·설정이 필요하다. standalone 출력은 별도의 패키징 계약으로 검토하며 여기의 명령을 혼용하지 않는다. `NEXT_PUBLIC_` 값은 브라우저에 공개되고 빌드에 반영되므로 비밀값에 쓰지 않는다. [S7, S8]

## 6. 전경에서 먼저 실행하고 검증한다

같은 변수 창에서 필요한 비밀 설정을 승인된 방법으로 공급한다. `$Shared\config\app-settings.json`은 예시 경로이며 실제 파일 스키마와 로더는 앱이 제공해야 한다.

```powershell
$env:NODE_ENV = 'production'
$env:PORT = [string]$Port
$env:HOST = '0.0.0.0'
$env:APP_DATA_DIR = Join-Path $Shared 'data'
$env:APP_UPLOAD_DIR = Join-Path $Shared 'uploads'
$env:APP_CONFIG_FILE = Join-Path $Shared 'config\app-settings.json'
```

### A. Node.js / Express

서버 계약이 `dist\server.js`인 앱의 예다. 실제 빌드 진입 파일을 확인하고 변경한다. 앱은 위의 `PORT`, `HOST`를 실제 listen에 적용해야 한다.

```powershell
Push-Location $Release
try { & $Node '.\dist\server.js' } finally { Pop-Location }
```

### B. Next.js

```powershell
Push-Location $Release
try {
  & $Node '.\node_modules\next\dist\bin\next' start -p $Port -H '0.0.0.0'
} finally { Pop-Location }
```

전경 실행 창을 유지하고 다른 PowerShell 창에서 다음을 실행한다. **새 앱에서 구현한 엔드포인트** `/healthz`, `/readyz`를 기준으로 한다. 기존 HR 포털은 `/api/health`이므로 바꾸어 조회한다.

```powershell
$Port = 8082  # 실제 승인 포트로 변경
Get-NetTCPConnection -State Listen -LocalPort $Port
curl.exe --fail --max-time 15 "http://127.0.0.1:$Port/healthz"
if ($LASTEXITCODE -ne 0) { throw 'healthz 요청 실패' }
curl.exe --fail --max-time 15 "http://127.0.0.1:$Port/readyz"
if ($LASTEXITCODE -ne 0) { throw 'readyz 요청 실패' }
```

`/healthz`: 프로세스 생존 200, 최소 앱 식별자·릴리스 정보. `/readyz`: 필수 설정·저장소 준비 완료 200, 미준비 503. 비밀값·직원정보는 반환하지 않는다. 정적 SPA fallback이 헬스 URL을 index.html로 돌려주는 것은 성공이 아니다. JSON 스키마·앱 ID·릴리스를 함께 확인한다. 이 계약은 신규 앱 요구사항이지 기존 서버의 확인된 기능이 아니다.

검증 후 전경 창에서 Ctrl+C로 종료하고 포트가 해제됐는지 확인한다. **전경 프로세스를 남긴 채 서비스를 시작하지 않는다.**

## 7. NSSM으로 신규 서비스 등록

### 7.1 등록 전 조건

전경 테스트 합격, 포트 해제, 신규 서비스명 확인, 서비스 계정 승인, 백업·복구 계획 확정이 필요하다. NSSM은 PATH 검색 대신 확인된 절대경로로 호출한다. 기존 NSSM 파일 자체는 변경하지 않는다. 아래는 등록만 수행하며 계정·권한 확인 전 시작하지 않는다.

다음 블록은 4.1의 변수를 유지한 원래 창에서 사용한다. 새 창이면 실제 값을 다시 정의한다. NSSM 버전은 실행 파일 속성과 승인된 배포본으로 확인한다. 지원하지 않는 옵션은 무시하지 말고 중단한다.

```powershell
function Invoke-Nssm {
  param([string[]]$NssmArgs)
  & $Nssm @NssmArgs
  if ($LASTEXITCODE -ne 0) { throw "NSSM 실패: $($NssmArgs[0])" }
}
function Wait-AppReady {
  param([string]$ExpectedRelease)
  $deadline = (Get-Date).AddSeconds(60)
  do {
    try {
      $h = Invoke-RestMethod -Uri "http://127.0.0.1:$Port/healthz" -TimeoutSec 5
      $r = Invoke-RestMethod -Uri "http://127.0.0.1:$Port/readyz" -TimeoutSec 5
      if ($h.status -eq 'ok' -and $r.status -eq 'ready' -and
          $h.app -eq $AppId -and $r.app -eq $AppId -and
          $h.release -eq $ExpectedRelease -and $r.release -eq $ExpectedRelease) {
        return
      }
    } catch { }  # 대기 시간 안에서만 재시도; 응답 본문·비밀 출력 금지
    Start-Sleep -Seconds 2
  } while ((Get-Date) -lt $deadline)
  throw '생존·준비 상태 및 앱/릴리스 일치 확인 실패: 배포 미완료'
}
function Stop-AppConfirmed {
  $svc = Get-Service -Name $AppId -ErrorAction Stop
  if ($svc.Status -ne 'Stopped') { Stop-Service -Name $AppId -ErrorAction Stop }
  $svc.WaitForStatus([System.ServiceProcess.ServiceControllerStatus]::Stopped,
    [TimeSpan]::FromSeconds(30))
  if (Get-NetTCPConnection -State Listen -LocalPort $Port -ErrorAction SilentlyContinue) {
    throw '중지 후 포트가 남아 있음: 소유 프로세스 확인 전 변경·복원 금지'
  }
  # 별도 worker/배치가 있으면 해당 프로세스·작업의 종료도 확인한다.
}
if (Get-Service -Name $AppId -ErrorAction SilentlyContinue) { throw '이미 등록된 서비스' }
if (Get-NetTCPConnection -State Listen -LocalPort $Port -ErrorAction SilentlyContinue) {
  throw '전경 프로세스 또는 다른 앱이 포트를 점유함'
}

# 둘 중 하나만 선택한다. 경로·릴리스명은 공백 없는 승인값 사용.
$Entry = Join-Path $Release 'dist\server.js'   # Node 앱
$Params = 'dist\server.js'
# Next.js라면 위 두 줄 대신 아래 두 줄 사용:
# $Entry = Join-Path $Release 'node_modules\next\dist\bin\next'
# $Params = "node_modules\next\dist\bin\next start -p $Port -H 0.0.0.0"

if (!(Test-Path -LiteralPath $Entry -PathType Leaf)) { throw '운영 진입 파일 없음' }
Invoke-Nssm -NssmArgs @('install',$AppId,$Node)
Invoke-Nssm -NssmArgs @('set',$AppId,'AppDirectory',$Release)
Invoke-Nssm -NssmArgs @('set',$AppId,'AppParameters',$Params)
Invoke-Nssm -NssmArgs @('set',$AppId,'DisplayName',"PRI $AppId ($Port)")
Invoke-Nssm -NssmArgs @('set',$AppId,'Start','SERVICE_DEMAND_START')
Invoke-Nssm -NssmArgs @('set',$AppId,'AppStdout',(Join-Path $Shared 'logs\out.log'))
Invoke-Nssm -NssmArgs @('set',$AppId,'AppStderr',(Join-Path $Shared 'logs\err.log'))
Invoke-Nssm -NssmArgs @('set',$AppId,'AppExit','Default','Restart')
Invoke-Nssm -NssmArgs @('set',$AppId,'AppRestartDelay','5000')
Invoke-Nssm -NssmArgs @('set',$AppId,'AppRotateFiles','1')
Invoke-Nssm -NssmArgs @('set',$AppId,'AppRotateBytes','10485760')
Invoke-Nssm -NssmArgs @('set',$AppId,'AppRotateOnline','0')
$ServiceEnv = @(
  'NODE_ENV=production', "PORT=$Port", 'HOST=0.0.0.0',
  "APP_DATA_DIR=$(Join-Path $Shared 'data')",
  "APP_UPLOAD_DIR=$(Join-Path $Shared 'uploads')",
  "APP_CONFIG_FILE=$(Join-Path $Shared 'config\app-settings.json')"
)
Invoke-Nssm -NssmArgs (@('set',$AppId,'AppEnvironmentExtra') + $ServiceEnv)
```

NSSM 환경변수 블록 설정은 기존 목록을 덮어쓸 수 있으므로 신규 서비스에만 위 예제를 사용한다. 업데이트 시 필요한 기존 변수와 병합하고 비밀값을 출력하지 않는다. 예제의 로그 회전은 재시작 시 기준이며 실행 중 무한 증가 방지는 별도 모니터링·보관 정책을 마련한다. [S9, S10]

### 7.2 실행 계정·파일 권한 확인 후 시작

`services.msc`에서 **새 서비스만 선택**하고 로그온 계정을 승인된 전용 서비스 계정으로 설정한다. 비밀번호를 명령줄·문서·스크린샷에 남기지 않는다. NSSM 기본 계정은 LocalSystem이므로, 별도 설정을 하지 않았다면 높은 권한으로 동작할 수 있다. 최소 권한 구성이 불가능하면 운영 승인 전 중단한다.

```powershell
& $Nssm get $AppId Application
& $Nssm get $AppId AppDirectory
& $Nssm get $AppId AppParameters
& $Nssm get $AppId ObjectName
# 위 결과·계정·ACL 승인 완료 후에만:
Invoke-Nssm -NssmArgs @('set',$AppId,'Start','SERVICE_AUTO_START')
Start-Service -Name $AppId
Get-Service -Name $AppId
Get-NetTCPConnection -State Listen -LocalPort $Port
Wait-AppReady -ExpectedRelease $ReleaseId
```

Running만으로 정상 판정하지 않는다. 서비스 계정에서 데이터 읽기·쓰기, 폰트·인증서·외부 API·메일 기능을 다시 검증한다. 대화형 로그인에서 동작한 Outlook COM이 서비스에서도 된다고 간주하지 않는다. 메일은 비활성 기본값과 승인된 테스트 수신처를 사용한다.

## 8. 방화벽·사내 접속·HTTPS

### 8.1 승인된 클라이언트 범위만 허용

직접 사내 접속 테스트가 승인된 경우에만 적용한다. CIDR·프로필은 실제 승인값으로 입력한다. 서버 IP만 보고 사내 서브넷을 추정하지 않는다.

```powershell
$AllowedClientRange = 'REPLACE_WITH_APPROVED_CLIENT_IP_OR_CIDR'
$ApprovedProfile = 'REPLACE_WITH_APPROVED_FIREWALL_PROFILE'
if ($AllowedClientRange -like 'REPLACE_*' -or $ApprovedProfile -like 'REPLACE_*') {
  throw '승인된 접속 범위·프로필 입력 필요'
}
if ($ApprovedProfile -notin @('Domain','Private','Public')) { throw '프로필 값 확인' }
if (Get-NetFirewallRule -Name $RuleName -ErrorAction SilentlyContinue) {
  throw '동일 이름 규칙 존재: 소유자·기존 범위 검토'
}
New-NetFirewallRule -Name $RuleName -DisplayName $RuleName `
  -Direction Inbound -Action Allow -Protocol TCP -LocalPort $Port `
  -Program $Node -RemoteAddress $AllowedClientRange -Profile $ApprovedProfile
Get-NetFirewallRule -Name $RuleName
Get-NetFirewallRule -Name $RuleName | Get-NetFirewallPortFilter
Get-NetFirewallRule -Name $RuleName | Get-NetFirewallAddressFilter
```

기존의 더 넓은 허용 규칙이 있으면 새 제한 규칙 하나로 전체 접근이 좁아지는 것은 아니다. GPO·타 방화벽·기존 규칙은 관리자가 함께 점검한다. 방화벽을 끄거나 프로필을 바꿔 우회하지 않는다. [S11]

### 8.2 반드시 다른 사내 PC에서 검증

```powershell
$Port = 8082  # 실제 승인 포트
Test-NetConnection 10.164.202.198 -Port $Port
Resolve-DnsName lgprihr.lge.com
```

브라우저에서 `http://10.164.202.198:승인포트/`와 DNS 조회가 일치할 때 `http://lgprihr.lge.com:승인포트/`의 비민감 테스트 화면을 확인한다. 주소의 ‘승인포트’는 실제 숫자로 치환한다. 서버 자기 자신에서의 성공은 다른 PC 접근 성공을 대신하지 못한다.

### 8.3 HTTPS 운영 개통은 별도 승인 게이트

운영 도메인, DNS, 인증서 발급·갱신, 프록시 위치, 로컬까지의 네트워크 경로, 업로드 크기·시간 제한, 쿠키·인증 정책을 확정한다. Azure가 사내 PC의 사설 IP에 접근할 수 있다고 가정하지 않는다. 승인된 연결 방식이 없다면 외부 공개하지 않는다. 로컬 프록시를 새로 두면 루프백 바인딩과 직접 포트 차단을 함께 적용한다. 기존 Caddy/IIS/80/443은 무단 수정하지 않는다.

Next.js 공개 인터넷 서비스는 앞단 역방향 프록시를 권장한다. TLS 인증서 검증을 끄지 않고, `Secure`·`HttpOnly`·`SameSite` 쿠키와 CSRF·권한 검사를 실제 배치 구조에 맞춰 검증한다. 사내망이라는 이유로 인증을 생략하지 않는다. [S8]

## 9. 업데이트·백업·롤백

### 9.1 업데이트 준비

1. 새 릴리스 폴더에 전체 파일을 배치하고 의존성 설치·빌드한다. 실행 중 폴더를 덮어쓰지 않는다.
2. 현행 AppDirectory·AppParameters·Node 경로·릴리스·환경변수의 비밀 제외 목록·설정 버전을 제한된 변경대장에 기록한다.
3. 별도 승인된 테스트 포트를 사용한다면 운영 데이터·메일·배치 작업을 공유하지 않는다. 같은 쓰기 데이터를 향한 두 프로세스를 동시에 실행하지 않는다.
4. 데이터 스키마 변경 여부와 복구 호환성을 확인한다. 코드만 되돌려도 데이터를 복구할 수 있다고 가정하지 않는다.
5. 점검 시간 승인 후 해당 신규 앱만 중지하고 데이터 일관성을 확보한 백업을 만든다. DB 사용 시 해당 DB의 일관된 백업·복원 도구를 사용한다.

### 9.2 릴리스 교체 예제 — 기존 앱은 건드리지 않음

아래 블록은 기존 서비스가 본 매뉴얼의 구조로 등록되어 있고 Invoke-Nssm·변수가 준비된 경우에만 사용한다. 소스 빌드와 백업 검증은 미리 완료한다.

```powershell
$NewRelease = Join-Path (Join-Path $Base 'releases') '20261113-02'
if (!(Test-Path -LiteralPath $NewRelease -PathType Container)) { throw '새 릴리스 없음' }
# Node 예제. Next.js 앱은 실제 next 진입 파일로 변경한다.
if (!(Test-Path -LiteralPath (Join-Path $NewRelease 'dist\server.js') -PathType Leaf)) {
  throw '새 릴리스의 운영 진입 파일 확인 필요'
}
$OldRelease = & $Nssm get $AppId AppDirectory
if ($LASTEXITCODE -ne 0) { throw '이전 릴리스 조회 실패' }
$OldParams = & $Nssm get $AppId AppParameters
if ($LASTEXITCODE -ne 0) { throw '이전 실행 인수 조회 실패' }
$OldRelease = ($OldRelease -join "`n").Trim()
$OldParams = ($OldParams -join "`n").Trim()
# 위 두 값은 승인된 변경대장에도 기록한다. 창이 닫히면 변수는 사라진다.
Stop-AppConfirmed
# 여기서 쓰기 중지 확인 → 데이터/업로드/설정의 승인된 백업 → 복원 가능성 확인.
# 백업 완료 전 다음 명령을 실행하지 않는다.
$BackupConfirmed = Read-Host '백업·복원 가능성 확인 완료 시에만 BACKUP-OK 입력'
if ($BackupConfirmed -cne 'BACKUP-OK') { throw '배포 중단: 앱은 중지 상태이므로 운영자 판단 필요' }
Invoke-Nssm -NssmArgs @('set',$AppId,'AppDirectory',$NewRelease)
# 진입 방식이 바뀌었다면 새 AppParameters도 별도 검토·설정한다.
Start-Service -Name $AppId
Wait-AppReady -ExpectedRelease (Split-Path $NewRelease -Leaf)
```

이 블록은 준비·백업을 자동으로 수행하지 않는다. 이전 예제의 상대 진입 인수를 유지하는 업데이트용이며, 진입 파일 존재와 새 릴리스 ID 응답을 반드시 확인한다. 새 버전에서 잘못된 데이터 쓰기가 발생하면 재시작 반복 대신 앱을 중지한다.

### 9.3 실패 시 롤백

```powershell
# 이전 릴리스·인수를 변경대장과 대조한 뒤 실행
if (!(Test-Path -LiteralPath $OldRelease -PathType Container)) { throw '이전 릴리스 없음' }
Stop-AppConfirmed
# 데이터 마이그레이션/손상 발생 시 승인된 복원 절차를 먼저 적용한다.
Invoke-Nssm -NssmArgs @('set',$AppId,'AppDirectory',$OldRelease)
Invoke-Nssm -NssmArgs @('set',$AppId,'AppParameters',$OldParams)
Start-Service -Name $AppId
Wait-AppReady -ExpectedRelease (Split-Path $OldRelease -Leaf)
```

복구 판정은 이전 릴리스 응답·데이터·대표 업무·권한까지 포함한다. 같은 디스크의 backups만으로 장애 복구를 보장하지 않는다. 별도 승인된 저장소로 백업하고 보존기간·접근권한·복원 시험을 정한다. 재부팅 시험은 여러 앱이 함께 있는 PC 전체에 영향을 주므로 별도 점검 시간에 승인 후 수행한다.

## 10. 일상 운영과 장애 대응

```powershell
# 실제 값 재설정 후 조회
$AppId = 'pri-webapp'
$Port = 8082
$Shared = Join-Path 'C:\ProgramData\PRI' $AppId
Get-Service -Name $AppId
Get-NetTCPConnection -State Listen -LocalPort $Port
Get-Content -LiteralPath (Join-Path $Shared 'logs\err.log') -Tail 80
curl.exe --fail --max-time 15 "http://127.0.0.1:$Port/readyz"
if ($LASTEXITCODE -ne 0) { throw 'readyz 요청 실패' }
```

로그를 외부 공유할 때 개인정보·쿠키·토큰·본문을 마스킹한다. 서비스 재시작은 조회가 아니라 변경 작업이며 승인 후 해당 앱만 실행한다.

| 증상 | 확인 순서 | 금지·대응 |
|---|---|---|
| 서비스가 바로 종료 | 로그→진입 파일→런타임→설정·모듈→계정 권한 | 실행 중 앱을 중복 기동하지 않음 |
| EADDRINUSE | 포트 소유 PID·서비스 | 다른 node.exe 전체 종료 금지 |
| 서버 내부 성공, 타 PC 실패 | 바인딩→방화벽·GPO→라우팅→DNS | 방화벽 전체 해제 금지 |
| EACCES / EPERM | 서비스 계정·파일 잠금·ACL | Everyone 쓰기·관리자 실행으로 뭉개지 않음 |
| MODULE_NOT_FOUND | 배포 파일 누락·설치 결과·대소문자 | 불완전 ZIP을 성공 배포로 처리하지 않음 |
| Next 운영 실행 실패 | build 종료코드·.next·런타임 의존성·Node 호환성 | dev 서버로 운영 대체 금지 |
| 로그인 루프 | 외부 URL·HTTPS·쿠키·시간·인증 API | 인증 무조건 해제 금지 |
| 재시작 후 데이터 없음 | APP_DATA_DIR·서비스 환경·저장 경로 | 릴리스 폴더 안에 데이터 영구 저장 금지 |
| 메일 실패 | 서비스 계정·Outlook 의존성·승인된 전송 방식 | 실수신자 일괄 발송 금지 |
| 로그·업로드 증가 | 디스크·파일 크기·보존기간 | 보존 승인 없는 일괄 삭제 금지 |

## 11. 운영 개통·제거 체크리스트

### 개통 승인 기준

- [ ] OS·Node·NSSM 버전, 실제 DNS·RDP·8080/8081 현황을 기록했다.
- [ ] 앱명·포트·실행 계정·ACL·방화벽 범위·담당자가 승인되었다.
- [ ] 완전한 배포본, 재현 가능한 빌드와 잠긴 의존성 목록이 있다.
- [ ] 서비스 재시작 후 /healthz·/readyz의 JSON·앱 ID·릴리스가 일치한다.
- [ ] 타 PC의 허용 접근과 미허용 접근을 검증했다.
- [ ] HTTPS·인증·권한·업로드·개인정보 보호 검증을 완료했다.
- [ ] 새로고침·직접 URL·한글·파일·저장·재시작 후 유지가 정상이다.
- [ ] 백업 복원·롤백을 검증했고 DB 변경의 복구 계획이 있다.
- [ ] 기존 prihr-main·HR 포털의 기준선과 대표 기능을 재확인했다.
- [ ] 승인된 재부팅 시험 또는 미수행 사유·추후 일정이 기록되었다.

하나라도 미검증이면 ‘배포 완료’ 대신 미완료 항목을 표시한다. 설치 스크립트의 종료코드 0이나 Windows Running만으로 완료 선언하지 않는다.

### 앱 제거 — 파괴적 작업, 별도 승인 후

데이터 보존·백업 승인→해당 앱 중지→해당 서비스만 NSSM으로 제거→해당 신규 방화벽 규칙만 제거→보존기간 경과 후 파일 삭제 순서다. **폴더 삭제만으로 서비스·방화벽이 정리되는 것은 아니다.** 기존 서비스와 공용 NSSM·Node는 제거하지 않는다. 자동 정리 스크립트는 제공하지 않으며 대상명·소유자를 확인한 운영자가 수행한다.

## 12. 단일 HTML 자동배포와 기존 HR 포털의 별도 주의사항

### 단일 HTML

승인된 외부 전송만 D:\https에 새 이름으로 복사한다. 기존 파일 덮어쓰기는 재배포를 보장하지 않는다. 결과는 `C:\apps\meeting_recorder_v2\data\auto_hosted.json`에서 실제 파일명과 URL을 찾아 확인한다. 기록은 시작 시 초기화될 수 있으므로 영구 원장으로 취급하지 않는다. 상대경로 자산을 둔 사이트 전체 배포·PDF/음성 자동배포·파일 삭제에 따른 외부 삭제를 가정하지 않는다. 서비스 재시작을 자동배포의 일반 해결책으로 사용하지 않는다. [S1]

### 기존 HR 포털

**원본 `service-install.ps1`을 신규 앱 설치용으로 실행·재사용하지 않는다.** 기존 hrportal 서비스가 있으면 기본 실행만으로 재시작하고, 예약 작업 대체 경로는 HRPortal8081을 강제 등록할 수 있다. 기존 앱 보호를 위해 신규 앱 전용 절차를 사용한다.

소스 기본값은 `HRPORTAL_REQUIRE_LOGIN=true`, `HRPORTAL_PORT=8081`이다. VM 인증 호스트·포트 기본값은 prihr.com·443이며 기존 세션 읽기와 자체 세션 쓰기를 병행한다. 기존 README의 로그인 기본 설명과 차이가 있다. `/api/health`는 실제 코드에 있으나 문서의 `/api/port`는 첨부 서버 소스에서 처리 분기를 확인하지 못했다. 이 경로를 신규 앱 검증 기준으로 복사하지 않는다. 첨부 패키지에는 필수 로컬 모듈과 실제 화면·데이터가 누락되어 있어 별도 완전본 확보가 필요하다. [S5]

## 13. 출처와 검증 범위

### 첨부 자료

- S1. [PRI_HR_Local_Server_Hosting_Manual 1.html](https://www.genspark.ai/api/files/s/2oCmTxmj) — 현행 메인 서비스·감시폴더·운영 경계.
- S2. [PRI_HR_Windows_Server_Web_Hosting_Guide.html](https://www.genspark.ai/api/files/s/xhZeIJj8) — 서비스·디렉터리 역할.
- S3. [Windows_로컬서버_호스팅_구성요소_역할.html](https://www.genspark.ai/api/files/s/XP0i4wwq) — 외부 연계 개념 구조.
- S4. [windows_local_server_hosting_guide.html](https://www.genspark.ai/api/files/s/XVURS8Lj) — 초기 구축 이력. 현행 구성과 구분.
- S5. [hr_portal.zip](https://www.genspark.ai/api/files/s/IBKzhNmn) 내부 README.md, INSTALLATION_GUIDE.md, service-install.ps1, summary.html, hrportal_server.js — 실제 파일 목록·소스 대조.

### 공식 기술 문서 — 2026-11-13 조회

- S6. [Node.js 릴리스 정책](https://nodejs.org/en/about/previous-releases) — 운영용 지원 LTS 선택. 서버 설치 버전의 증거는 아님.
- S7. [Next.js CLI](https://nextjs.org/docs/app/api-reference/cli/next) — build/start와 포트·호스트 인수.
- S8. [Next.js 자체 호스팅](https://nextjs.org/docs/app/guides/self-hosting) — 프록시·환경변수·운영 고려사항.
- S9. [NSSM 명령](https://nssm.cc/commands) — 서비스·환경변수·실행 경로·계정 기본값.
- S10. [NSSM 사용법](https://nssm.cc/usage) — 로그·회전·재시작 설정.
- S11. [Microsoft New-NetFirewallRule](https://learn.microsoft.com/en-us/powershell/module/netsecurity/new-netfirewallrule?view=windowsserver2025-ps) — 규칙 생성·주소·포트·프로그램 필터.

배포 예제·폴더 구조·헬스 계약·권한 원칙·백업 절차는 신규 제안이다. PowerShell/NSSM 명령은 공식 문서와 대조했지만 대상 윈도우 PC에서 실행 검증하지 않았다. 조직 정책·설치 버전·실제 앱에 맞춰 사전 검토 후 적용한다.
