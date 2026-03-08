Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$projectRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$nodeNpm = 'C:\Program Files\nodejs\npm.cmd'

function Step {
    param([string]$Text)
    Write-Host "[STEP] $Text"
}

function Pass {
    param([string]$Text)
    Write-Host "[PASS] $Text"
}

function Warn {
    param([string]$Text)
    Write-Host "[WARN] $Text"
}

function Info {
    param([string]$Text)
    Write-Host "[INFO] $Text"
}

function Run-NpmScript {
    param([Parameter(Mandatory = $true)][string]$Name)

    & $nodeNpm run $Name
    if ($LASTEXITCODE -ne 0) {
        throw "$Name failed ($LASTEXITCODE)"
    }
}

Push-Location $projectRoot
try {
    Step 'project root check'
    foreach ($required in @('index.html', '_redirects', '_headers', 'package.json')) {
        if (-not (Test-Path -LiteralPath $required)) {
            throw "$required missing"
        }
    }
    Pass 'required root files exist'

    Step 'git context check'
    $head = (& git rev-parse --short HEAD).Trim()
    $branch = (& git branch --show-current 2>$null).Trim()
    if ([string]::IsNullOrWhiteSpace($branch)) {
        Warn 'detached HEAD or branch not resolved'
        $branch = 'DETACHED'
    } else {
        Pass "branch=$branch"
    }
    Pass "head=$head"

    Step 'git status snapshot'
    $statusLines = @(& git status --short)
    $statusCount = ($statusLines | Measure-Object).Count
    if ($statusCount -eq 0) {
        Pass 'worktree clean'
        $worktreeState = 'CLEAN'
    } else {
        Warn "worktree dirty (items=$statusCount)"
        $statusLines | Select-Object -First 20
        $worktreeState = 'DIRTY'
    }

    Step 'remote sync check'
    $remoteState = 'UNKNOWN'
    $pushNeeded = 'UNKNOWN'
    $fetchOk = $false
    try {
        & git fetch --quiet origin main
        if ($LASTEXITCODE -eq 0) {
            $fetchOk = $true
            Pass 'origin/main fetched'
        } else {
            Warn 'git fetch origin main failed'
        }
    }
    catch {
        Warn ('git fetch origin main failed: ' + $_.Exception.Message)
    }

    & git show-ref --verify --quiet refs/remotes/origin/main
    if ($LASTEXITCODE -eq 0) {
        $countsText = (& git rev-list --left-right --count origin/main...HEAD).Trim()
        $parts = $countsText -split '\s+'
        if ($parts.Count -ge 2) {
            $behind = [int]$parts[0]
            $ahead = [int]$parts[1]
            Info "ahead=$ahead behind=$behind"
            if ($ahead -eq 0 -and $behind -eq 0) {
                $remoteState = 'IN_SYNC'
                $pushNeeded = 'NO'
                Pass 'origin/main in sync with local HEAD'
            } elseif ($ahead -gt 0 -and $behind -eq 0) {
                $remoteState = 'AHEAD'
                $pushNeeded = 'YES'
                Warn 'local commits not pushed to origin/main'
            } elseif ($ahead -eq 0 -and $behind -gt 0) {
                $remoteState = 'BEHIND'
                $pushNeeded = 'NO'
                Warn 'local branch behind origin/main'
            } else {
                $remoteState = 'DIVERGED'
                $pushNeeded = 'NO'
                Warn 'local branch diverged from origin/main'
            }
        }
    } else {
        Warn 'origin/main ref not available locally'
    }

    Step 'git identity check'
    $gitUser = (& git config --get user.name 2>$null).Trim()
    $gitEmail = (& git config --get user.email 2>$null).Trim()
    if ([string]::IsNullOrWhiteSpace($gitUser) -or [string]::IsNullOrWhiteSpace($gitEmail)) {
        Warn 'git author identity incomplete'
    } else {
        Pass "git identity set ($gitUser <$gitEmail>)"
    }

    Step 'doctor:win'
    Run-NpmScript -Name 'doctor:win'

    Step 'check:html:guard'
    Run-NpmScript -Name 'check:html:guard'

    Step 'deploy readiness summary'
    $developmentReady = 'YES'
    $deployReady = 'YES'
    if ($worktreeState -ne 'CLEAN') {
        $deployReady = 'NO'
    }
    if ($branch -eq 'DETACHED') {
        $deployReady = 'NO'
    }
    if ($remoteState -eq 'BEHIND' -or $remoteState -eq 'DIVERGED') {
        $deployReady = 'NO'
    }

    Write-Host "[INFO] WORKTREE=$worktreeState"
    Write-Host "[INFO] REMOTE_SYNC=$remoteState"
    Write-Host "[INFO] PUSH_NEEDED=$pushNeeded"
    Write-Host "[INFO] DEVELOPMENT_READY=$developmentReady"
    Write-Host "[INFO] DEPLOY_READY=$deployReady"
    Write-Host '[DONE] deliver restart checklist passed'
    exit 0
}
finally {
    Pop-Location
}
