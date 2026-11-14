<# OLAF Builders를 이미 설치된 이전 릴리스로 되돌린다. #>
param(
  [Parameter(Mandatory)][string]$ToRelease,
  [string]$RestoreDb,
  [Parameter(Mandatory)][ValidateSet('ROLLBACK')][string]$Confirm,
  [string]$NssmExe = 'C:\apps\meeting_recorder_v2\nssm.exe',
  [switch]$DryRun
)
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'common.ps1')
$Script:NssmPath = $NssmExe
Assert-ReleaseId $ToRelease
if (-not (Test-Admin)) { throw '관리자 PowerShell에서 실행하세요' }
if (!(Test-Path -LiteralPath $Script:NssmPath -PathType Leaf)) { throw "NSSM 없음: $($Script:NssmPath)" }
$svc = Get-Service -Name $Script:AppId -ErrorAction Stop
if ($svc.Status -ne 'Running') { throw "서비스가 실행 중일 때만 롤백할 수 있습니다: $($svc.Status)" }

$oldDir = Get-NssmValue 'AppDirectory'
$nodeExe = Get-NssmValue 'Application'
$oldEnv = Get-NssmEnvironment
foreach ($key in @('PORT','APP_DATA_DIR','APP_BACKUP_DIR','APP_RELEASE')) { if (!$oldEnv.ContainsKey($key)) { throw "NSSM 환경변수 없음: $key" } }
$port = [int]$oldEnv.PORT
$oldRelease = $oldEnv.APP_RELEASE
$targetDir = Join-Path $Script:AppBase "releases\$ToRelease"
$dbFile = Join-Path $oldEnv.APP_DATA_DIR 'olaf.db'
$safety = Join-Path $oldEnv.APP_BACKUP_DIR "before-rollback-$oldRelease-$(Get-Date -Format yyyyMMdd-HHmmss).db"
if (!(Test-Path -LiteralPath $targetDir -PathType Container)) { throw "대상 릴리스 없음: $targetDir" }
if (!(Test-Path -LiteralPath $dbFile -PathType Leaf)) { throw "DB 없음: $dbFile" }
if ($RestoreDb -and !(Test-Path -LiteralPath $RestoreDb -PathType Leaf)) { throw "복원 DB 없음: $RestoreDb" }
if ($RestoreDb) { Test-DbIntegrity -NodeExe $nodeExe -ReleaseDir $oldDir -DbFile $RestoreDb }
if ($DryRun) { Write-Plan "$oldRelease -> $ToRelease, DB 복원=$(if($RestoreDb){$RestoreDb}else{'없음'})"; exit 0 }

Stop-AppConfirmed -Port $port
New-Item -ItemType Directory -Force -Path $oldEnv.APP_BACKUP_DIR | Out-Null
Copy-Item -LiteralPath $dbFile -Destination $safety
Test-DbIntegrity -NodeExe $nodeExe -ReleaseDir $oldDir -DbFile $safety
$targetEnv = @{}; foreach ($key in $oldEnv.Keys) { $targetEnv[$key]=$oldEnv[$key] }; $targetEnv.APP_RELEASE=$ToRelease
try {
  if ($RestoreDb) { Copy-Item -LiteralPath $RestoreDb -Destination $dbFile -Force; Remove-Item -LiteralPath "$dbFile-wal","$dbFile-shm" -Force -ErrorAction SilentlyContinue }
  Invoke-Nssm set $Script:AppId AppDirectory $targetDir
  Set-NssmEnvironment $targetEnv
  Start-AppConfirmed -Port $port -Release $ToRelease
  Add-Content -LiteralPath (Join-Path $Script:AppBase 'deploy-history.jsonl') -Value (@{at=(Get-Date).ToString('s');action='rollback';from=$oldRelease;to=$ToRelease;dbBackup=$safety;restoredDb=$RestoreDb}|ConvertTo-Json -Compress)
  Write-Ok "롤백 완료: $oldRelease -> $ToRelease"
} catch {
  try { Stop-AppConfirmed -Port $port } catch { }
  Copy-Item -LiteralPath $safety -Destination $dbFile -Force
  Remove-Item -LiteralPath "$dbFile-wal","$dbFile-shm" -Force -ErrorAction SilentlyContinue
  Invoke-Nssm set $Script:AppId AppDirectory $oldDir
  Set-NssmEnvironment $oldEnv
  Start-AppConfirmed -Port $port -Release $oldRelease
  throw "롤백 실패, 원래 릴리스로 복구됨: $oldRelease"
}
