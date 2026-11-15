# start-local.ps1 - Starts local PostgreSQL cluster and the GFamily Node server
$ErrorActionPreference = "Stop"

$workspaceRoot = $PSScriptRoot
$pgData = Join-Path $workspaceRoot ".test-postgres"
$pgCtl = "C:\Program Files\PostgreSQL\18\bin\pg_ctl.exe"
$port = 55439

Write-Host "Checking PostgreSQL on port $port..." -ForegroundColor Cyan

# Check if port is responding
& "C:\Program Files\PostgreSQL\18\bin\pg_isready.exe" -h 127.0.0.1 -p $port 2>$null
if ($LASTEXITCODE -ne 0) {
    # Clean up stale lock if process is not running
    $pidFile = Join-Path $pgData "postmaster.pid"
    if (Test-Path $pidFile) {
        $stalePid = (Get-Content $pidFile -Head 1).Trim()
        if ($stalePid -and -not (Get-Process -Id $stalePid -ErrorAction SilentlyContinue)) {
            Write-Host "Removing stale postmaster.pid (PID $stalePid)..." -ForegroundColor Yellow
            Remove-Item $pidFile -Force
        }
    }
    Write-Host "Starting local PostgreSQL instance..." -ForegroundColor Cyan
    & $pgCtl -D $pgData -o "-p $port -h 127.0.0.1" start
    Start-Sleep -Seconds 2
} else {
    Write-Host "PostgreSQL is already running on port $port." -ForegroundColor Green
}

# Ensure frontend assets are built
if (-not (Test-Path (Join-Path $workspaceRoot "dist\index.html"))) {
    Write-Host "Building frontend assets..." -ForegroundColor Cyan
    npm run build
}

Write-Host "`nStarting GFamily Frozen Products server at http://localhost:8790..." -ForegroundColor Green
Write-Host "Press Ctrl+C to stop the server.`n" -ForegroundColor Yellow

try {
    node server.js
} finally {
    Write-Host "`nStopping local PostgreSQL instance..." -ForegroundColor Cyan
    & $pgCtl -D $pgData stop -m fast
    $pidFile = Join-Path $pgData "postmaster.pid"
    if (Test-Path $pidFile) {
        Remove-Item $pidFile -Force -ErrorAction SilentlyContinue
    }
    Write-Host "Stopped." -ForegroundColor Green
}

