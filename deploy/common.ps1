# OLAF Builders 배포 공통 함수 (PowerShell 5.1 호환)
# 다른 스크립트가 dot-source 한다:  . (Join-Path $PSScriptRoot 'common.ps1')

$Script:AppId          = 'olaf-builders'
$Script:ProtectedPorts = @(80, 443, 1234, 3389, 8080, 8081)
$Script:ProtectedNames = @('prihr-main', 'hrportal', 'HRPortal8081')
$Script:NssmPath       = 'C:\apps\meeting_recorder_v2\nssm.exe'   # 읽기 전용 호출만. 복사·이동·덮어쓰기 금지
$Script:AppBase        = 'C:\apps\olaf-builders'
$Script:SharedBase     = 'C:\ProgramData\PRI\olaf-builders'

$Script:Done    = New-Object System.Collections.ArrayList
$Script:Pending = New-Object System.Collections.ArrayList

function Write-Step([string]$msg) { Write-Host "[STEP] $msg" -ForegroundColor Cyan }
function Write-Plan([string]$msg) { Write-Host "[PLAN] $msg" -ForegroundColor DarkCyan }
function Write-Ok([string]$msg)   { Write-Host "[ OK ] $msg" -ForegroundColor Green }
function Write-Warn2([string]$msg){ Write-Host "[WARN] $msg" -ForegroundColor Yellow }

function Add-Done([string]$s)    { [void]$Script:Done.Add($s) }
function Add-Pending([string]$s) { [void]$Script:Pending.Add($s) }

function Show-Summary([string]$title) {
  Write-Host ''
  Write-Host "==== $title ====" -ForegroundColor White
  Write-Host '완료한 단계:'
  if ($Script:Done.Count -eq 0) { Write-Host '  (없음)' } else { $Script:Done | ForEach-Object { Write-Host "  - $_" } }
  Write-Host '남은 단계:'
  if ($Script:Pending.Count -eq 0) { Write-Host '  (없음)' } else { $Script:Pending | ForEach-Object { Write-Host "  - $_" } }
}

function Fail-Exit([string]$msg, [string]$recovery) {
  Write-Host "[FAIL] $msg" -ForegroundColor Red
  if ($recovery) { Write-Host "복구 안내: $recovery" -ForegroundColor Yellow }
  Show-Summary '중단됨 — 설치/변경이 완료되지 않았습니다'
  exit 1
}

function Test-Admin {
  $id = [Security.Principal.WindowsIdentity]::GetCurrent()
  return (New-Object Security.Principal.WindowsPrincipal($id)).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
}

function Test-PortListening([int]$Port) {
  $c = Get-NetTCPConnection -State Listen -LocalPort $Port -ErrorAction SilentlyContinue
  return [bool]$c
}

function Invoke-Native {
  param([Parameter(Mandatory)][string]$Exe, [string[]]$Arguments = @(), [string]$What)
  & $Exe @Arguments
  if ($LASTEXITCODE -ne 0) { throw "$What 실패 (종료코드 $LASTEXITCODE)" }
}

function Invoke-Nssm {
  param([Parameter(ValueFromRemainingArguments = $true)][string[]]$NssmArgs)
  & $Script:NssmPath @NssmArgs
  if ($LASTEXITCODE -ne 0) { throw "NSSM 실패: $($NssmArgs -join ' ')" }
}

function Get-NssmValue([string]$Name) {
  $v = & $Script:NssmPath get $Script:AppId $Name
  if ($LASTEXITCODE -ne 0) { throw "NSSM get $Name 실패" }
  # nssm 출력은 UTF-16 섞임이 있을 수 있어 NUL 제거
  return (($v -join "`n") -replace "`0", '').Trim()
}

function Get-NssmEnvironment {
  $lines = & $Script:NssmPath get $Script:AppId AppEnvironmentExtra
  if ($LASTEXITCODE -ne 0) { throw 'NSSM AppEnvironmentExtra 조회 실패' }
  $map = @{}
  foreach ($line in $lines) {
    $clean = ([string]$line -replace "`0", '').Trim()
    if ($clean -match '^([^=]+)=(.*)$') { $map[$Matches[1]] = $Matches[2] }
  }
  return $map
}

function Set-NssmEnvironment([hashtable]$Map) {
  $block = @($Map.GetEnumerator() | Sort-Object Name | ForEach-Object { "$($_.Name)=$($_.Value)" })
  & $Script:NssmPath set $Script:AppId AppEnvironmentExtra @block
  if ($LASTEXITCODE -ne 0) { throw 'NSSM AppEnvironmentExtra 설정 실패' }
}

function Stop-AppConfirmed([int]$Port, [int]$TimeoutSec = 30) {
  $svc = Get-Service -Name $Script:AppId -ErrorAction Stop
  if ($svc.Status -ne 'Stopped') { Stop-Service -Name $Script:AppId -ErrorAction Stop }
  $svc.WaitForStatus([System.ServiceProcess.ServiceControllerStatus]::Stopped, [TimeSpan]::FromSeconds($TimeoutSec))
  if (Test-PortListening $Port) { throw "서비스 중지 뒤에도 포트 $Port 가 사용 중입니다" }
}

function Start-AppConfirmed([int]$Port, [string]$Release, [int]$TimeoutSec = 60) {
  Start-Service -Name $Script:AppId -ErrorAction Stop
  if (-not (Wait-AppReady -Port $Port -ExpectedRelease $Release -TimeoutSec $TimeoutSec)) {
    throw "서비스 준비 실패: release=$Release"
  }
}

function Test-DbIntegrity([string]$NodeExe, [string]$ReleaseDir, [string]$DbFile) {
  Push-Location $ReleaseDir
  try {
    & $NodeExe 'tools\check.js' '--integrity-only' '--db' $DbFile
    if ($LASTEXITCODE -ne 0) { throw "DB 무결성 검사 실패: $DbFile" }
  } finally { Pop-Location }
}

function Test-Sha256List {
  param([Parameter(Mandatory)][string]$Zip, [Parameter(Mandatory)][string]$ShaFile)
  if (!(Test-Path -LiteralPath $ShaFile -PathType Leaf)) { throw "해시 파일 없음: $ShaFile" }
  $expected = (Get-Content -LiteralPath $ShaFile | Where-Object { $_ -match '^ZIP ' } | Select-Object -First 1) -replace '^ZIP\s+([0-9a-fA-F]{64}).*$', '$1'
  if (-not $expected) { throw '해시 파일에 ZIP 줄이 없습니다' }
  $actual = (Get-FileHash -LiteralPath $Zip -Algorithm SHA256).Hash
  if ($actual -ne $expected.ToUpper()) { throw "zip 해시 불일치: $actual" }
}

function Wait-AppReady {
  param([int]$Port, [string]$ExpectedRelease, [int]$TimeoutSec = 60)
  $deadline = (Get-Date).AddSeconds($TimeoutSec)
  do {
    try {
      $h = Invoke-RestMethod -Uri "http://127.0.0.1:$Port/healthz" -TimeoutSec 5
      $r = Invoke-RestMethod -Uri "http://127.0.0.1:$Port/readyz" -TimeoutSec 5
      if ($h.status -eq 'ok' -and $r.status -eq 'ready' -and $h.app -eq $Script:AppId -and
          $h.release -eq $ExpectedRelease -and $r.release -eq $ExpectedRelease) { return $true }
    } catch { }
    Start-Sleep -Seconds 2
  } while ((Get-Date) -lt $deadline)
  return $false
}

function Get-EnvBlock {
  param([int]$Port, [string]$BindHost, [string]$Release, [string]$TrustProxy = '0')
  $sh = $Script:SharedBase
  return @(
    'NODE_ENV=production', "PORT=$Port", "HOST=$BindHost",
    "APP_DATA_DIR=$sh\data", "APP_UPLOAD_DIR=$sh\uploads",
    "APP_CONFIG_FILE=$sh\config\app-settings.json", "APP_BACKUP_DIR=$sh\backups", "APP_LOG_DIR=$sh\logs",
    "APP_RELEASE=$Release", "TRUST_PROXY=$TrustProxy"
  )
}

function Assert-ReleaseId([string]$Release) {
  if ($Release -notmatch '^\d{8}-\d{2}$') { throw "릴리스 ID 형식 오류 (YYYYMMDD-NN): $Release" }
}
