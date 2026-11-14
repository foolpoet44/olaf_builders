<# OLAF Builders DB 백업을 복원하고 실패하면 복원 직전 DB로 되돌린다. #>
param(
  [Parameter(Mandatory)][string]$BackupFile,
  [Parameter(Mandatory)][ValidateSet('RESTORE')][string]$Confirm,
  [string]$NssmExe = 'C:\apps\meeting_recorder_v2\nssm.exe',
  [switch]$DryRun
)
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'common.ps1')
$Script:NssmPath = $NssmExe
if (-not (Test-Admin)) { throw '관리자 PowerShell에서 실행하세요' }
if (!(Test-Path -LiteralPath $Script:NssmPath -PathType Leaf)) { throw "NSSM 없음: $($Script:NssmPath)" }
if (!(Test-Path -LiteralPath $BackupFile -PathType Leaf)) { throw "백업 없음: $BackupFile" }
$svc = Get-Service -Name $Script:AppId -ErrorAction Stop
if ($svc.Status -ne 'Running') { throw "서비스가 실행 중일 때만 복원할 수 있습니다: $($svc.Status)" }

$releaseDir = Get-NssmValue 'AppDirectory'
$nodeExe = Get-NssmValue 'Application'
$envMap = Get-NssmEnvironment
foreach ($key in @('PORT','APP_DATA_DIR','APP_BACKUP_DIR','APP_RELEASE')) { if (!$envMap.ContainsKey($key)) { throw "NSSM 환경변수 없음: $key" } }
$port = [int]$envMap.PORT
$release = $envMap.APP_RELEASE
$dbFile = Join-Path $envMap.APP_DATA_DIR 'olaf.db'
$safety = Join-Path $envMap.APP_BACKUP_DIR "before-restore-$(Get-Date -Format yyyyMMdd-HHmmss).db"
if (!(Test-Path -LiteralPath $dbFile -PathType Leaf)) { throw "현재 DB 없음: $dbFile" }
Test-DbIntegrity -NodeExe $nodeExe -ReleaseDir $releaseDir -DbFile $BackupFile
if ($DryRun) { Write-Plan "DB 복원: $BackupFile -> $dbFile (현재 DB는 $safety 보존)"; exit 0 }

Stop-AppConfirmed -Port $port
New-Item -ItemType Directory -Force -Path $envMap.APP_BACKUP_DIR | Out-Null
Copy-Item -LiteralPath $dbFile -Destination $safety
try {
  Copy-Item -LiteralPath $BackupFile -Destination $dbFile -Force
  Remove-Item -LiteralPath "$dbFile-wal","$dbFile-shm" -Force -ErrorAction SilentlyContinue
  Start-AppConfirmed -Port $port -Release $release
  Write-Ok "DB 복원 완료: $BackupFile"
} catch {
  try { Stop-AppConfirmed -Port $port } catch { }
  Copy-Item -LiteralPath $safety -Destination $dbFile -Force
  Remove-Item -LiteralPath "$dbFile-wal","$dbFile-shm" -Force -ErrorAction SilentlyContinue
  Start-AppConfirmed -Port $port -Release $release
  throw "DB 복원 실패, 복원 직전 DB로 되돌림: $safety"
}
