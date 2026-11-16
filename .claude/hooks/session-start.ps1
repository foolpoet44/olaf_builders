# SessionStart Hook
# session start/resume/compact 직후에 실행
# BUILD_STATE.md에서 상태를 읽어 context 복구

# $PSScriptRoot는 .claude/hooks 이므로 루트로 이동
Set-Location (Join-Path $PSScriptRoot ..\..)

# BUILD_STATE.md 읽기
$buildStatePath = Join-Path $PWD "BUILD_STATE.md"
if (-not (Test-Path $buildStatePath)) {
    Write-Host "BUILD_STATE.md not found. Nothing to restore."
    exit 0
}

$content = Get-Content $buildStatePath -Encoding UTF8 -Raw

# Git State 파싱
$gitState = @{}

if ($content -match "- branch: (.+?)(?:`n|$)") {
    $gitState.branch = $matches[1].Trim()
}
if ($content -match "- head: (.+?)(?:`n|$)") {
    $gitState.head = $matches[1].Trim()
}
if ($content -match "- modified: (.+?)(?:`n|$)") {
    $gitState.modified = $matches[1].Trim()
}
if ($content -match "- untracked: (.+?)(?:`n|$)") {
    $gitState.untracked = $matches[1].Trim()
}

# Current Goal 파싱
$currentGoal = ""
if ($content -match "## Current Goal\s*`n(.+?)(?:`n## |$)") {
    $currentGoal = $matches[1].Trim()
}

# Current Status 파싱
$currentStatus = ""
if ($content -match "## Current Status\s*`n(.+?)(?:`n## |$)") {
    $currentStatus = $matches[1].Trim()
}

Write-Host "=== Session Start: Context Restore ==="
Write-Host ""

if ($gitState.branch -and $gitState.branch -ne "(git branch --show-current)") {
    Write-Host "Git State:"
    Write-Host "  branch: $($gitState.branch)"
    Write-Host "  head: $($gitState.head)"
    Write-Host "  modified: $($gitState.modified)"
    Write-Host "  untracked: $($gitState.untracked)"
    Write-Host ""
}

if ($currentGoal) {
    Write-Host "Current Goal:"
    Write-Host "  $currentGoal"
    Write-Host ""
}

if ($currentStatus -and $currentStatus -notmatch "(상태를 입력하세요)") {
    Write-Host "Current Status:"
    Write-Host "  $currentStatus"
    Write-Host ""
}

# 마지막 성공 커밋이 있는지 확인
if ($content -match "- commit: ([a-f0-9]+)" -and $matches[1].Length -eq 40) {
    $lastCommit = $matches[1]
    Write-Host "Last Successful Build: $lastCommit"

    # 현재 커밋과 비교
    $currentCommit = git rev-parse HEAD 2>$null
    if ($currentCommit -and $currentCommit -ne $lastCommit) {
        Write-Host ""
        Write-Host "WARNING: Current HEAD differs from last successful build!"
        Write-Host "  Current: $currentCommit"
        Write-Host "  Last: $lastCommit"
    }
}

Write-Host ""
Write-Host "Context restore complete."
