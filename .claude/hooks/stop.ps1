# Stop Hook
# session 종료/ Claude 종료 전에 실행
# 현재 작업 상태를 BUILD_STATE.md에 저장

# $PSScriptRoot는 .claude/hooks 이므로 루트로 이동
Set-Location (Join-Path $PSScriptRoot ..\..)

$buildStatePath = Join-Path $PWD "BUILD_STATE.md"
if (-not (Test-Path $buildStatePath)) {
    Write-Host "BUILD_STATE.md not found. Creating new file."
}

# 현재 Git 상태
try {
    $branch = git branch --show-current 2>$null
    if ($LASTEXITCODE -ne 0) { $branch = "unknown" }

    $head = git rev-parse HEAD 2>$null
    if ($LASTEXITCODE -ne 0) { $head = "unknown" }

    # PowerShell 5.1 호환: 배열 먼저 수집 후 -join
    $modifiedList = git diff --name-only 2>$null | Where-Object { $_ }
    $modified = if ($modifiedList) { $modifiedList -join ", " } else { "none" }

    $untrackedList = git ls-files --others --exclude-standard 2>$null | Where-Object { $_ }
    $untracked = if ($untrackedList) { $untrackedList -join ", " } else { "none" }

    Write-Host "현재 작업 상태 저장 중..."
    Write-Host "  branch: $branch"
    Write-Host "  head: $head"

    $content = if (Test-Path $buildStatePath) {
        Get-Content $buildStatePath -Encoding UTF8 -Raw
    } else {
        ""
    }

    # Git State 섹션 갱신
    $gitStateSection = @"
## Git State (auto-updated by Stop hook)
- branch: $branch
- head: $head
- modified: $modified
- untracked: $untracked
"@

    if ($content -match "## Git State \(auto-updated by PreCompact hook\)" -or $content -match "## Git State \(auto-updated by Stop hook\)") {
        $content = $content -replace "## Git State \(auto-updated by (?:PreCompact|Stop) hook\)[\s\S]*?(?=\n## |\n$)", $gitStateSection
    } else {
        if ($content -match "^## Git State") {
            # 기존 Git State 섹션(주석 없음)이 있는 경우
            $content = $content -replace "^## Git State[\s\S]*?(?=\n## |\n$)", $gitStateSection -replace "^(?=\n## )", ""
        } else {
            # 섹션이 완전히 없음
            if ($content) {
                $content = $content.TrimEnd() + "`n`n$gitStateSection"
            } else {
                $content = "# BUILD STATE

Updated: $(Get-Date -Format "yyyy-MM-dd HH:mm:ss")

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

$gitStateSection

## Hooks (auto-updated)
- hooks_registered: true
- stop_hook_ran: $(Get-Date -Format "yyyy-MM-dd HH:mm:ss")
"@
            }
        }
    }

    # Updated 날짜 갱신
    $today = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    $content = $content -replace "Updated: \d{4}-\d{2}-\d{2}(?: HH:mm:ss)?", "Updated: $today"

    # Hooks 섹션 갱신
    $hooksSection = @"
## Hooks (auto-updated)
- hooks_registered: true
- stop_hook_ran: $(Get-Date -Format "yyyy-MM-dd HH:mm:ss")
"@

    if ($content -match "^## Hooks \(auto-updated\)") {
        $content = $content -replace "^## Hooks \(auto-updated\)[\s\S]*?(?=\n## |\n$)", $hooksSection
    } else {
        $content = $content.TrimEnd() + "`n`n$hooksSection"
    }

    # UTF8 BOM 없이 쓰기 (PowerShell 5.1 호환)
    $utf8 = New-Object System.Text.UTF8Encoding $false
    [System.IO.File]::WriteAllText($buildStatePath, $content, $utf8)

    Write-Host "BUILD_STATE.md 갱신 완료"
}
catch {
    Write-Host "오류: $($_.Exception.Message)"
    exit 1
}
