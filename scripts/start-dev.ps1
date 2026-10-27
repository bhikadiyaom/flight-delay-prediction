<#
.SYNOPSIS
  Starts the whole stack for local development (MongoDB, ML service, API, client) as background processes.
.PARAMETER Stop
  Stop everything this script started (and anything else listening on 27017/8000/5000/5173).
.EXAMPLE
  powershell -ExecutionPolicy Bypass -File scripts\start-dev.ps1
  powershell -ExecutionPolicy Bypass -File scripts\start-dev.ps1 -Stop
#>
param([switch]$Stop, [switch]$NoDb)
$root = Split-Path -Parent $PSScriptRoot
$ports = 27017, 8000, 5000, 5173
$logs = Join-Path $root '.logs'

function StopPorts {
  foreach ($p in $ports) {
    Get-NetTCPConnection -LocalPort $p -State Listen -ErrorAction SilentlyContinue | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue }
  }
  Get-CimInstance Win32_Process -ErrorAction SilentlyContinue | Where-Object { $_.CommandLine -match 'dev-db\.js|vite\.js|src[\\/]server\.js|uvicorn app\.main' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
}

if ($Stop) { StopPorts; Write-Host 'Stopped.'; exit 0 }

$busy = $ports | Where-Object { Get-NetTCPConnection -LocalPort $_ -State Listen -ErrorAction SilentlyContinue }
if ($busy) { Write-Host "Ports already in use: $($busy -join ', '). Run with -Stop first (or stop those programs)." -ForegroundColor Yellow; exit 1 }

New-Item -ItemType Directory -Force $logs | Out-Null
$py = Join-Path $root 'ml-service\venv\Scripts\python.exe'
if (-not (Test-Path $py)) { Write-Host 'ml-service\venv missing: run scripts\setup.ps1 first.' -ForegroundColor Red; exit 1 }
$node = (Get-Command node).Source

function Launch($name, $file, $argList, $dir) {
  Start-Process $file -ArgumentList $argList -WorkingDirectory $dir -WindowStyle Hidden -RedirectStandardOutput (Join-Path $logs "$name.out.log") -RedirectStandardError (Join-Path $logs "$name.err.log") | Out-Null
}
function WaitPort($port, $name, $seconds) {
  for ($i = 0; $i -lt $seconds; $i++) { if (Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue) { Write-Host "  $name up on :$port"; return $true }; Start-Sleep 1 }
  Write-Host "  $name did NOT start on :$port within ${seconds}s. Look at .logs\$($name -replace ' ','-').err.log" -ForegroundColor Red; return $false
}

if (-not $NoDb) {
  Write-Host 'MongoDB (first start downloads mongod, can take a minute)...'
  Launch 'mongo' $node @('scripts/dev-db.js') (Join-Path $root 'server')
  WaitPort 27017 'MongoDB' 180 | Out-Null
}
Write-Host 'ML service...'
Launch 'ml-service' $py @('-m', 'uvicorn', 'app.main:app', '--port', '8000') (Join-Path $root 'ml-service')
WaitPort 8000 'ML service' 60 | Out-Null
Write-Host 'API server...'
Launch 'server' $node @('src/server.js') (Join-Path $root 'server')
WaitPort 5000 'API server' 30 | Out-Null
Write-Host 'Client...'
Launch 'client' $node @('node_modules/vite/bin/vite.js') (Join-Path $root 'client')
WaitPort 5173 'client' 30 | Out-Null

Write-Host "`nOpen http://localhost:5173   (logs in .logs\, stop with: scripts\start-dev.ps1 -Stop)" -ForegroundColor Green
