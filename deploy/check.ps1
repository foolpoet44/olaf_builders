<#
.SYNOPSIS
  OLAF Builders 점검 (docs/08_DEPLOYMENT.md 6절). 조회만 한다.
#>
param([int]$Port = 8091)
$ErrorActionPreference = 'Continue'
. (Join-Path $PSScriptRoot 'common.ps1')
$fail = 0
function R([bool]$ok, [string]$msg) { if ($ok) { Write-Host "PASS $msg" -ForegroundColor Green } else { Write-Host "FAIL $msg" -ForegroundColor Red; $Script:fail++ } }

$svc = Get-Service -Name $Script:AppId -ErrorAction SilentlyContinue
R ($svc -and $svc.Status -eq 'Running') "C1 서비스 상태: $($svc.Status)"

$conn = Get-NetTCPConnection -State Listen -LocalPort $Port -ErrorAction SilentlyContinue | Select-Object -First 1
$svcPid = (Get-CimInstance Win32_Service -Filter "Name='$($Script:AppId)'" -ErrorAction SilentlyContinue).ProcessId
$owner = if ($conn) { Get-CimInstance Win32_Process -Filter "ProcessId=$($conn.OwningProcess)" -ErrorAction SilentlyContinue } else { $null }
$ownerOk = $conn -and $owner -and $owner.Name -eq 'node.exe' -and ($owner.ParentProcessId -eq $svcPid -or $owner.ProcessId -eq $svcPid)
R $ownerOk "C2 포트 $Port 소유: $($owner.Name) pid=$($conn.OwningProcess) (서비스 pid=$svcPid)"

$node = $null
if ($svc) { try { $node = Get-NssmValue 'Application'; $dir = Get-NssmValue 'AppDirectory' } catch { } }
try {
  $h = Invoke-RestMethod -Uri "http://127.0.0.1:$Port/healthz" -TimeoutSec 5
  R ($h.status -eq 'ok' -and $h.app -eq $Script:AppId) "C3 healthz app=$($h.app) release=$($h.release)"
} catch { R $false 'C3 healthz 요청 실패' }
try {
  $r = Invoke-RestMethod -Uri "http://127.0.0.1:$Port/readyz" -TimeoutSec 5
  R ($r.status -eq 'ready') 'C4 readyz'
} catch { R $false "C4 readyz: $($_.Exception.Message)" }

if ($node -and $dir) {
  $env:APP_DATA_DIR = Join-Path $Script:SharedBase 'data'
  Push-Location $dir
  & $node 'tools\check.js' '--integrity-only'
  R ($LASTEXITCODE -eq 0) 'C5 DB 무결성'
  Pop-Location
} else { R $false 'C5 DB 무결성 (NSSM 설정 조회 실패)' }

$bk = Get-ChildItem -Path (Join-Path $Script:SharedBase 'backups') -Filter 'olaf-*.db' -ErrorAction SilentlyContinue | Sort-Object LastWriteTime -Descending | Select-Object -First 1
R ($bk -and $bk.LastWriteTime -gt (Get-Date).AddHours(-26)) "C6 최신 백업: $($bk.Name) $($bk.LastWriteTime)"

$drive = (Split-Path $Script:SharedBase -Qualifier).TrimEnd(':')
$free = (Get-PSDrive -Name $drive).Free
R ($free -ge 2GB) ("C7 디스크 여유 {0:N1} GB" -f ($free / 1GB))

foreach ($n in @('prihr-main', 'hrportal')) {
  $s = Get-Service -Name $n -ErrorAction SilentlyContinue
  Write-Host "INFO C8 $n : $(if ($s) { $s.Status } else { '(없음)' }) — 점검 전 기록과 비교 (조회만)"
}

$err = Join-Path $Script:SharedBase 'logs\err.log'
$fatal = if (Test-Path $err) { Get-Content -LiteralPath $err -Tail 50 | Select-String -SimpleMatch 'FATAL' } else { $null }
R (-not $fatal) 'C9 err.log 최근 50줄에 FATAL 없음'

if ($fail) { Write-Host "점검 실패 $fail 건" -ForegroundColor Red; exit 1 }
Write-Host '점검 항목 전부 PASS (운영 개통 판정은 docs/09 인수 항목과 함께)' -ForegroundColor Green
exit 0
