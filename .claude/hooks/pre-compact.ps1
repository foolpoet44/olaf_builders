# PreCompact Hook
# context compaction 직전에 실행
# Git 상태를 BUILD_STATE.md에 저장

# $PSScriptRoot는 .claude/hooks 이므로 ..\.. 으로 루트로 이동
Set-Location (Join-Path $PSScriptRoot ..\..)

# BUILD_STATE.md 읽기
$buildStatePath = Join-Path $PWD "BUILD_STATE.md"
if (-not (Test-Path $buildStatePath)) {
    Write-Host "BUILD_STATE.md not found, creating new file"
    $buildState = @"
# BUILD STATE

Updated: $(Get-Date -Format "yyyy-MM-dd")

## Current Goal
(목표를 입력하세요)

## Current Status
- (상태를 입력하세요)

## Last Successful Build
- commit: (git hash)

## Current Issue
(이슈를 입력하세요)

## Important Decisions
(의사결정을 입력하세요)

## Next Actions
(다음 행동을 입력하세요)

## Git State (auto-updated by PreCompact hook)
- branch: (git branch --show-current)
- head: (git rev-parse HEAD)
- modified: (git diff --name-only)
- untracked: (git ls-files --others --exclude-standard)
"@
    Set-Content -Path $buildStatePath -Value $buildState -Encoding UTF8
}

# Git 상태 수집
try {
    $branch = git branch --show-current 2>$null
    if ($LASTEXITCODE -ne 0) { $branch = "unknown" }

    $head = git rev-parse HEAD 2>$null
    if ($LASTEXITCODE -ne 0) { $head = "unknown" }

    # PowerShell 5.1 호환: 배열을 먼저 수집한 후 -join 사용
    $modifiedList = git diff --name-only 2>$null | Where-Object { $_ }
    if ($modifiedList) {
        $modified = $modifiedList -join ", "
    } else {
        $modified = "none"
    }

    $untrackedList = git ls-files --others --exclude-standard 2>$null | Where-Object { $_ }
    if ($untrackedList) {
        $untracked = $untrackedList -join ", "
    } else {
        $untracked = "none"
    }

    Write-Host "Git 상태 저장:"
    Write-Host "  branch: $branch"
    Write-Host "  head: $head"
    Write-Host "  modified: $modified"
    Write-Host "  untracked: $untracked"

    # BUILD_STATE.md 갱신 (사람이 작성한 부분은 유지)
    $content = Get-Content $buildStatePath -Encoding UTF8 -Raw

    # Git State 섹션 갱신 - 각 줄을 개별적으로 생성
    $gitStateSectionLines = @()
    $gitStateSectionLines += "## Git State (auto-updated by PreCompact hook)"
    $gitStateSectionLines += "- branch: $branch"
    $gitStateSectionLines += "- head: $head"
    $gitStateSectionLines += "- modified: $modified"
    $gitStateSectionLines += "- untracked: $untracked"

    # 기존 Git State 섹션 찾기 및 치환
    $lines = $content -split "`r?`n"
    $inGitStateSection = $false
    $newLines = @()
    $gitStateAdded = $false

    foreach ($line in $lines) {
        if ($line -match "^## Git State \(auto-updated by PreCompact hook\)") {
            $newLines += $gitStateSectionLines
            $inGitStateSection = $true
            $gitStateAdded = $true
        } elseif ($inGitStateSection -and $line -match "^## ") {
            # 다음 섹션이 시작되었으면 현재 줄 추가하고 섹션 종료
            $newLines += $line
            $inGitStateSection = $false
        } elseif (-not $inGitStateSection) {
            $newLines += $line
        }
        # inGitStateSection이 true이면 기존 섹션 줄은 건너뜀
    }

    # Git State 섹션이 추가되지 않았으면 끝에 추가
    if (-not $gitStateAdded) {
        $newLines += ""
        $newLines += $gitStateSectionLines
    }

    $content = $newLines -join "`r`n"

    # Updated 날짜 갱신
    $today = Get-Date -Format "yyyy-MM-dd"
    $content = $content -replace "^Updated: \d{4}-\d{2}-\d{2}.*", "Updated: $today"

    # UTF8 BOM 없이 쓰기 (PowerShell 5.1 호환)
    $utf8 = New-Object System.Text.UTF8Encoding $false
    [System.IO.File]::WriteAllText($buildStatePath, $content, $utf8)

    Write-Host "BUILD_STATE.md 갱신 완료"
}
catch {
    Write-Host "오류: $($_.Exception.Message)"
    exit 1
}
