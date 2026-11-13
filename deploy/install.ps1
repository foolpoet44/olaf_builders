<#
.SYNOPSIS
  OLAF Builders 최초 설치 (docs/08_DEPLOYMENT.md 4절). 관리자 PowerShell 5.1.
.DESCRIPTION
  - 서비스는 "수동 시작"으로만 등록한다. 계정·자동 시작·방화벽은 운영자가 승인 후 수동으로 한다(5절).
  - -DryRun: 검사(0~3)만 실제로 하고 나머지는 할 일만 출력한다. 아무것도 만들지 않는다.
.EXAMPLE
  .\install.ps1 -Release 20261120-01 -PackageZip D:\in\olaf-builders-20261120-01.zip -NodeZip D:\in\node-v24.11.1-win-x64.zip -DryRun
#>
param(
  [Parameter(Mandatory)][string]$Release,
  [Parameter(Mandatory)][string]$PackageZip,
  [Parameter(Mandatory)][string]$NodeZip,
  [int]$Port = 8091,
  [string]$BindHost = '127.0.0.1',
  [string]$OfficeId = 'OP-01',
  [string]$OfficeName = '사무국',
  [string]$NssmExe = 'C:\apps\meeting_recorder_v2\nssm.exe',
  [switch]$DryRun
)
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'common.ps1')
$Script:NssmPath = $NssmExe

$ReleaseDir = Join-Path $Script:AppBase "releases\$Release"
$RuntimeDir = Join-Path $Script:AppBase 'runtime'
$Sha = [IO.Path]::ChangeExtension($PackageZip, $null).TrimEnd('.') + '.sha256.txt'
$NodeName = [IO.Path]::GetFileNameWithoutExtension($NodeZip)   # node-v24.x.y-win-x64
$NodeExe = Join-Path $RuntimeDir "$NodeName\node.exe"
$mode = if ($DryRun) { 'DRY-RUN (변경 없음)' } else { '실행' }
Write-Host "OLAF Builders 설치 — $mode · 릴리스 $Release · 포트 $Port · HOST $BindHost"

# ---- 0. 권한·환경 -------------------------------------------------------
Write-Step '0. 관리자 권한 · PowerShell 버전'
if ($PSVersionTable.PSVersion.Major -lt 5) { Fail-Exit 'PowerShell 5.1 이상이 필요합니다' }
if (-not (Test-Admin)) {
  if ($DryRun) { Write-Warn2 '관리자 권한이 아닙니다 (DryRun 이라 계속) — 실제 설치는 관리자 PowerShell 에서' }
  else { Fail-Exit '관리자 PowerShell 에서 실행하세요' }
}
try { Assert-ReleaseId $Release } catch { Fail-Exit $_.Exception.Message }

# ---- 1. 보호 값 ---------------------------------------------------------
Write-Step '1. 보호 포트·이름 거부'
if ($Script:ProtectedPorts -contains $Port) { Fail-Exit "보호 포트 사용 금지: $Port" }
if ($Script:ProtectedNames -contains $Script:AppId) { Fail-Exit '기존 서비스 이름 사용 금지' }
if ($BindHost -notin @('127.0.0.1', '0.0.0.0')) { Fail-Exit 'BindHost 는 127.0.0.1 또는 0.0.0.0 (결정 B3)' }

# ---- 2. 충돌 ------------------------------------------------------------
Write-Step '2. 충돌 검사'
$problems = @()
if (Get-Service -Name $Script:AppId -ErrorAction SilentlyContinue) { $problems += "서비스 '$($Script:AppId)' 가 이미 있습니다 — 업데이트는 update.ps1" }
if (Test-PortListening $Port) { $problems += "포트 $Port 가 사용 중입니다 — 소유 프로세스를 확인하고 새 포트를 승인받으세요" }
if (Test-Path -LiteralPath $ReleaseDir) { $problems += "릴리스 폴더가 이미 있습니다: $ReleaseDir (재사용 금지)" }
if (!(Test-Path -LiteralPath $Script:NssmPath -PathType Leaf)) { $problems += "NSSM 없음: $($Script:NssmPath)" }
if (!(Test-Path -LiteralPath $PackageZip -PathType Leaf)) { $problems += "꾸러미 없음: $PackageZip" }
if (!(Test-Path -LiteralPath $NodeZip -PathType Leaf)) { $problems += "Node zip 없음: $NodeZip" }
if ($NodeName -notmatch '^node-v\d+\.\d+\.\d+-win-x64$') { $problems += "Node zip 이름 형식 오류 (node-vX.Y.Z-win-x64.zip): $NodeName" }
if ($problems.Count) {
  $problems | ForEach-Object { Write-Host "  - $_" -ForegroundColor Red }
  Fail-Exit '사전 검사 실패'
}
Write-Ok '충돌 없음'

# ---- 3. 해시 ------------------------------------------------------------
Write-Step '3. 꾸러미 해시 대조'
try { Test-Sha256List -Zip $PackageZip -ShaFile $Sha; Write-Ok '해시 일치' } catch { Fail-Exit $_.Exception.Message '반입 파일을 다시 받아 해시를 대조하세요' }
Write-Warn2 'Node zip 은 nodejs.org 의 SHASUMS256.txt 와 직접 대조했는지 확인하세요'

$steps = @(
  "4. 폴더 생성: $($Script:AppBase)\{runtime,releases} · $($Script:SharedBase)\{config,data,uploads,logs,backups}",
  "5. Node 풀기 → $NodeExe (같은 버전이 있으면 건너뜀)",
  "6. 꾸러미 풀기 → $ReleaseDir",
  "7. config 폴더 ACL: 상속 해제 · SYSTEM·Administrators 전체 권한",
  "8. 전경 시험: node src\server.js → /healthz·/readyz (release=$Release) → 종료 · 포트 해제 확인",
  "9. NSSM 등록 '$($Script:AppId)' (수동 시작 · 로그 · 환경변수)",
  "10. 첫 사무국 계정: node tools\admin.js bootstrap $OfficeId (코드 1회 표시)"
)
$manual = @(
  'services.msc 에서 olaf-builders 로그온 계정 지정 (결정 B4) · 권한 부여',
  'Start-Service olaf-builders → deploy\check.ps1',
  'nssm set olaf-builders Start SERVICE_AUTO_START (승인 후)',
  '(결정 B3 승인 시) HOST=0.0.0.0 + 방화벽 규칙 PRI-olaf-builders-TCP-<포트>'
)
if ($DryRun) {
  $steps | ForEach-Object { Write-Plan $_ }
  $manual | ForEach-Object { Write-Plan "(수동) $_" }
  Write-Host ''
  Write-Host 'DRY-RUN 끝: 검사만 했고 아무것도 설치하지 않았습니다.' -ForegroundColor White
  exit 0
}
$steps | ForEach-Object { Add-Pending $_ }
$manual | ForEach-Object { Add-Pending "(수동) $_" }
function Complete-Step([string]$s) { [void]$Script:Pending.Remove($s); Add-Done $s }

try {
  # 4
  foreach ($d in @("$($Script:AppBase)\runtime", "$($Script:AppBase)\releases")) { New-Item -ItemType Directory -Force -Path $d | Out-Null }
  foreach ($d in @('config', 'data', 'uploads', 'logs', 'backups')) { New-Item -ItemType Directory -Force -Path (Join-Path $Script:SharedBase $d) | Out-Null }
  Complete-Step $steps[0]

  # 5
  if (!(Test-Path -LiteralPath $NodeExe)) { Expand-Archive -LiteralPath $NodeZip -DestinationPath $RuntimeDir }
  $nv = & $NodeExe --version
  if ($LASTEXITCODE -ne 0) { throw 'node.exe 실행 실패' }
  $major = [int]($nv.TrimStart('v').Split('.')[0]); $minor = [int]($nv.TrimStart('v').Split('.')[1])
  if ($major -lt 22 -or ($major -eq 22 -and $minor -lt 13)) { throw "Node $nv 는 너무 낮습니다 (22.13 이상)" }
  Write-Ok "Node $nv"
  Complete-Step $steps[1]

  # 6
  Expand-Archive -LiteralPath $PackageZip -DestinationPath $ReleaseDir
  if (!(Test-Path -LiteralPath (Join-Path $ReleaseDir 'src\server.js') -PathType Leaf)) { throw '운영 진입 파일 src\server.js 없음' }
  Complete-Step $steps[2]

  # 7
  $cfgDir = Join-Path $Script:SharedBase 'config'
  Invoke-Native 'icacls.exe' @($cfgDir, '/inheritance:r', '/grant:r', '*S-1-5-18:(OI)(CI)F', '*S-1-5-32-544:(OI)(CI)F') 'config ACL'
  Complete-Step $steps[3]

  # 8 전경 시험
  $envBlock = Get-EnvBlock -Port $Port -BindHost '127.0.0.1' -Release $Release
  $saved = @{}
  foreach ($kv in $envBlock) { $k, $v = $kv.Split('=', 2); $saved[$k] = [Environment]::GetEnvironmentVariable($k, 'Process'); [Environment]::SetEnvironmentVariable($k, $v, 'Process') }
  $proc = Start-Process -FilePath $NodeExe -ArgumentList 'src\server.js' -WorkingDirectory $ReleaseDir -PassThru -WindowStyle Hidden `
    -RedirectStandardOutput (Join-Path $Script:SharedBase 'logs\install-fg.out.log') -RedirectStandardError (Join-Path $Script:SharedBase 'logs\install-fg.err.log')
  try {
    if (-not (Wait-AppReady -Port $Port -ExpectedRelease $Release -TimeoutSec 60)) { throw '전경 시험 실패: healthz/readyz/release 불일치 — logs\install-fg.err.log 확인' }
    Write-Ok '전경 시험 통과'
  } finally {
    if (!$proc.HasExited) { Stop-Process -Id $proc.Id -Force; $proc.WaitForExit(10000) | Out-Null }
    foreach ($k in $saved.Keys) { [Environment]::SetEnvironmentVariable($k, $saved[$k], 'Process') }
  }
  Start-Sleep -Seconds 1
  if (Test-PortListening $Port) { throw '전경 시험 뒤 포트가 해제되지 않았습니다' }
  Complete-Step $steps[4]

  # 9 NSSM
  $sh = $Script:SharedBase
  Invoke-Nssm install $Script:AppId $NodeExe
  Invoke-Nssm set $Script:AppId AppDirectory $ReleaseDir
  Invoke-Nssm set $Script:AppId AppParameters 'src\server.js'
  Invoke-Nssm set $Script:AppId DisplayName "PRI olaf-builders ($Port)"
  Invoke-Nssm set $Script:AppId Start SERVICE_DEMAND_START
  Invoke-Nssm set $Script:AppId AppStdout "$sh\logs\out.log"
  Invoke-Nssm set $Script:AppId AppStderr "$sh\logs\err.log"
  Invoke-Nssm set $Script:AppId AppRotateFiles 1
  Invoke-Nssm set $Script:AppId AppRotateBytes 10485760
  Invoke-Nssm set $Script:AppId AppExit Default Restart
  Invoke-Nssm set $Script:AppId AppRestartDelay 5000
  Invoke-Nssm set $Script:AppId AppStopMethodConsole 15000
  $svcEnv = Get-EnvBlock -Port $Port -BindHost $BindHost -Release $Release
  & $Script:NssmPath set $Script:AppId AppEnvironmentExtra @svcEnv
  if ($LASTEXITCODE -ne 0) { throw 'NSSM AppEnvironmentExtra 실패' }
  Add-Content -LiteralPath (Join-Path $Script:AppBase 'deploy-history.log') -Value "$((Get-Date).ToString('s')) install release=$Release dir=$ReleaseDir"
  Complete-Step $steps[5]

  # 10 첫 사무국
  foreach ($kv in (Get-EnvBlock -Port $Port -BindHost $BindHost -Release $Release)) { $k, $v = $kv.Split('=', 2); [Environment]::SetEnvironmentVariable($k, $v, 'Process') }
  Push-Location $ReleaseDir
  try {
    & $NodeExe 'tools\admin.js' 'bootstrap' $OfficeId '--name' $OfficeName
    if ($LASTEXITCODE -ne 0) { Write-Warn2 '첫 사무국 계정 생성 실패 또는 이미 있음 — 위 메시지 확인' } else { Complete-Step $steps[6] }
  } finally { Pop-Location }
} catch {
  Fail-Exit $_.Exception.Message '완료된 단계만 남아 있습니다. 서비스가 등록됐다면 nssm remove olaf-builders confirm 로 등록을 취소하고, 만든 릴리스 폴더를 지운 뒤 다시 실행하세요.'
}

Show-Summary '설치 스크립트 단계 완료 — 아래 수동 단계가 남았습니다 (아직 운영 개통 아님)'
exit 0
