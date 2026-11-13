<#
.SYNOPSIS
  개발 PC(Windows x64)에서 릴리스 꾸러미를 만든다 (docs/08_DEPLOYMENT.md 3절).
.EXAMPLE
  .\deploy\pack.ps1 -Release 20261120-01
  .\deploy\pack.ps1 -Release 20261120-01 -AllowDirty   # 커밋 안 된 변경이 있어도 (시험용)
#>
param(
  [Parameter(Mandatory)][string]$Release,
  [string]$OutDir = (Join-Path (Split-Path $PSScriptRoot -Parent) 'dist'),
  [switch]$AllowDirty,
  [switch]$SkipTests
)
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'common.ps1')
Assert-ReleaseId $Release

$Repo = Split-Path $PSScriptRoot -Parent
Push-Location $Repo
try {
  Write-Step 'git 상태 확인'
  $dirty = git status --porcelain
  if ($LASTEXITCODE -ne 0) { throw 'git 이 필요합니다' }
  if ($dirty -and -not $AllowDirty) { throw '커밋되지 않은 변경이 있습니다 (-AllowDirty 로 무시 가능)' }
  $commit = (git rev-parse --short HEAD).Trim()

  $work = Join-Path $env:TEMP "olaf-pack-$Release-$PID"
  if (Test-Path $work) { Remove-Item -Recurse -Force $work }
  New-Item -ItemType Directory -Path $work | Out-Null
  $tarball = Join-Path $work 'src.zip'

  Write-Step "git archive ($commit) — 추적 파일만"
  Invoke-Native git @('archive', '--format=zip', '-o', $tarball, 'HEAD') 'git archive'
  $stage = Join-Path $work 'app'
  Expand-Archive -LiteralPath $tarball -DestinationPath $stage
  Remove-Item $tarball

  # 서버 꾸러미에 넣지 않는 것: 문서 원본 일부는 유지(README·docs), 사무국 PC 도구·dist 는 제외
  foreach ($x in @('tools\render-pdf', 'dist', 'test')) {
    $p = Join-Path $stage $x
    if (Test-Path $p) { Remove-Item -Recurse -Force $p }
  }

  Write-Step 'npm ci --omit=dev --ignore-scripts'
  Push-Location $stage
  try {
    Invoke-Native 'npm.cmd' @('ci', '--omit=dev', '--ignore-scripts', '--no-audit', '--no-fund') 'npm ci'
  } finally { Pop-Location }

  if (-not $SkipTests) {
    Write-Step '테스트 (리포 작업 트리 기준)'
    Invoke-Native 'npm.cmd' @('test') 'npm test'
  }

  Write-Step '금지 파일 검사'
  $bad = Get-ChildItem -Recurse -File $stage | Where-Object {
    $_.Name -match '\.(db|db-wal|db-shm|sqlite\d?)$' -or $_.Name -like '.env*' -or $_.Name -eq 'secrets.json' -or
    $_.Extension -in @('.xlsx', '.xls') -or ($_.Extension -eq '.csv')
  }
  if ($bad) { throw "금지 파일 발견: $($bad.FullName -join ', ')" }

  $nodeVer = (node --version).Trim()
  @{ release = $Release; commit = $commit; node = $nodeVer; builtAt = (Get-Date).ToUniversalTime().ToString('s') + 'Z' } |
    ConvertTo-Json | Set-Content -LiteralPath (Join-Path $stage 'RELEASE.json') -Encoding UTF8

  if (!(Test-Path $OutDir)) { New-Item -ItemType Directory -Path $OutDir | Out-Null }
  $zip = Join-Path $OutDir "olaf-builders-$Release.zip"
  if (Test-Path $zip) { throw "이미 있는 릴리스 꾸러미: $zip (릴리스 ID 재사용 금지)" }
  Write-Step "압축 → $zip"
  Compress-Archive -Path (Join-Path $stage '*') -DestinationPath $zip

  $sha = Join-Path $OutDir "olaf-builders-$Release.sha256.txt"
  $lines = New-Object System.Collections.ArrayList
  [void]$lines.Add("ZIP $((Get-FileHash -LiteralPath $zip -Algorithm SHA256).Hash) olaf-builders-$Release.zip")
  Get-ChildItem -Recurse -File $stage | Where-Object { $_.FullName -notmatch '\\node_modules\\' } | Sort-Object FullName | ForEach-Object {
    $rel = $_.FullName.Substring($stage.Length + 1)
    [void]$lines.Add("$((Get-FileHash -LiteralPath $_.FullName -Algorithm SHA256).Hash) $rel")
  }
  $lines | Set-Content -LiteralPath $sha -Encoding UTF8
  Remove-Item -Recurse -Force $work
  Write-Ok "꾸러미 완료: $zip"
  Write-Ok "해시 목록: $sha"
} finally {
  Pop-Location
}
