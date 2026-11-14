<#
.SYNOPSIS
  OLAF Builders 릴리스 업데이트. DB 백업 후 서비스 전환, 실패 시 자동 롤백한다.
.EXAMPLE
  .\update.ps1 -Release 20261114-01 -PackageZip D:\in\olaf-builders-20261114-01.zip -DryRun
#>
param(
  [Parameter(Mandatory)][string]$Release,
  [Parameter(Mandatory)][string]$PackageZip,
  [string]$NssmExe = 'C:\apps\meeting_recorder_v2\nssm.exe',
  [switch]$DryRun
)
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'common.ps1')
$Script:NssmPath = $NssmExe
Assert-ReleaseId $Release

if (-not (Test-Admin)) { throw '관리자 PowerShell에서 실행하세요' }
if (!(Test-Path -LiteralPath $Script:NssmPath -PathType Leaf)) { throw "NSSM 없음: $($Script:NssmPath)" }
$svc = Get-Service -Name $Script:AppId -ErrorAction Stop
if ($svc.Status -ne 'Running') { throw "서비스가 실행 중일 때만 업데이트할 수 있습니다: $($svc.Status)" }
$sha = [IO.Path]::ChangeExtension($PackageZip, $null).TrimEnd('.') + '.sha256.txt'
Test-Sha256List -Zip $PackageZip -ShaFile $sha

$oldDir = Get-NssmValue 'AppDirectory'
$nodeExe = Get-NssmValue 'Application'
$oldEnv = Get-NssmEnvironment
foreach ($key in @('PORT','APP_DATA_DIR','APP_BACKUP_DIR','APP_RELEASE')) { if (!$oldEnv.ContainsKey($key)) { throw "NSSM 환경변수 없음: $key" } }
if (!(Test-Path -LiteralPath $nodeExe -PathType Leaf)) { throw "Node 실행 파일 없음: $nodeExe" }
if (!(Test-Path -LiteralPath $oldDir -PathType Container)) { throw "현재 릴리스 폴더 없음: $oldDir" }
$port = [int]$oldEnv.PORT
$oldRelease = $oldEnv.APP_RELEASE
$newDir = Join-Path $Script:AppBase "releases\$Release"
$dbFile = Join-Path $oldEnv.APP_DATA_DIR 'olaf.db'
$stamp = Get-Date -Format yyyyMMdd-HHmmss
$backup = Join-Path $oldEnv.APP_BACKUP_DIR "pre-update-$oldRelease-$stamp.db"

if (Test-Path -LiteralPath $newDir) { throw "릴리스 폴더가 이미 있습니다: $newDir" }
if (!(Test-Path -LiteralPath $dbFile -PathType Leaf)) { throw "DB 없음: $dbFile" }
if ($DryRun) {
  Write-Plan "새 릴리스 풀기: $newDir"
  Write-Plan "서비스 중지: $($Script:AppId) / 포트 $port"
  Write-Plan "DB 백업: $backup"
  Write-Plan "NSSM AppDirectory·APP_RELEASE 전환: $oldRelease -> $Release"
  Write-Plan '기동 실패 시 이전 릴리스와 DB 자동 복원'
  exit 0
}

New-Item -ItemType Directory -Force -Path $newDir | Out-Null
Expand-Archive -LiteralPath $PackageZip -DestinationPath $newDir
if (!(Test-Path -LiteralPath (Join-Path $newDir 'src\server.js'))) { throw '새 릴리스에 src\server.js가 없습니다' }

Stop-AppConfirmed -Port $port
$backupReady = $false
try {
  New-Item -ItemType Directory -Force -Path $oldEnv.APP_BACKUP_DIR | Out-Null
  Copy-Item -LiteralPath $dbFile -Destination $backup
  Test-DbIntegrity -NodeExe $nodeExe -ReleaseDir $oldDir -DbFile $backup
  $backupReady = $true

  $newEnv = @{}
  foreach ($key in $oldEnv.Keys) { $newEnv[$key] = $oldEnv[$key] }
  $newEnv.APP_RELEASE = $Release
  Invoke-Nssm set $Script:AppId AppDirectory $newDir
  Set-NssmEnvironment $newEnv
  Start-AppConfirmed -Port $port -Release $Release
  $record = @{ at=(Get-Date).ToString('s'); action='update'; from=$oldRelease; to=$Release; fromDir=$oldDir; toDir=$newDir; dbBackup=$backup } | ConvertTo-Json -Compress
  Add-Content -LiteralPath (Join-Path $Script:AppBase 'deploy-history.jsonl') -Value $record
  Write-Ok "업데이트 완료: $oldRelease -> $Release"
} catch {
  $failure = $_.Exception.Message
  Write-Warn2 "업데이트 실패, 자동 롤백: $failure"
  try { Stop-AppConfirmed -Port $port } catch { }
  try {
    if ($backupReady) {
      Copy-Item -LiteralPath $backup -Destination $dbFile -Force
      Remove-Item -LiteralPath "$dbFile-wal","$dbFile-shm" -Force -ErrorAction SilentlyContinue
    }
    Invoke-Nssm set $Script:AppId AppDirectory $oldDir
    Set-NssmEnvironment $oldEnv
    Start-AppConfirmed -Port $port -Release $oldRelease
  } catch {
    throw "업데이트 실패 후 자동복구도 실패했습니다. 원인=$failure, 복구 오류=$($_.Exception.Message)"
  }
  throw "업데이트 실패, 이전 릴리스로 복구됨: $oldRelease. 원인=$failure"
}
