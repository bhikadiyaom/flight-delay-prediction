<#
.SYNOPSIS
  One-shot setup of the whole project on a Windows PC. Safe to re-run (it only fills in what is missing).
.DESCRIPTION
  1. checks Node 20+, git and Python 3.11 (and tells you how to install what is missing)
  2. creates ml-service\venv (Python 3.11) and installs the pinned requirements
  3. runs npm ci in server and client
  4. creates server\.env, ml-service\.env and client\.env with generated secrets (the server and ML keys match)
  5. runs the doctor
.PARAMETER WithTraining
  Also install requirements-dev.txt (torch, jupyter...) so you can retrain models and run notebooks (+ about 1 GB).
.PARAMETER SkipNpm
  Skip npm ci (when node_modules are already installed).
.EXAMPLE
  powershell -ExecutionPolicy Bypass -File scripts\setup.ps1
#>
param([switch]$WithTraining, [switch]$SkipNpm)
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

function Step($m) { Write-Host "`n==> $m" -ForegroundColor Cyan }
function Fail($m) { Write-Host "ERROR: $m" -ForegroundColor Red; exit 1 }

Step 'Checking prerequisites'
$nodeVer = (& node --version 2>$null)
if (-not $nodeVer) { Fail 'Node.js not found. Install it:  winget install OpenJS.NodeJS.LTS   (then open a NEW terminal)' }
if ([int]($nodeVer.TrimStart('v').Split('.')[0]) -lt 20) { Fail "Node $nodeVer is too old; need 20 or newer." }
Write-Host "Node $nodeVer"
if (-not (Get-Command git -ErrorAction SilentlyContinue)) { Write-Host 'git not found (optional here): https://git-scm.com' -ForegroundColor Yellow }
$py311 = & py -3.11 --version 2>$null
if (-not $py311) { Fail 'Python 3.11 not found (3.12+ is NOT supported: XGBoost/SHAP/pyarrow wheels and the pickled models target 3.11). Install it:  winget install -e --id Python.Python.3.11   then open a NEW terminal and check: py -3.11 --version' }
Write-Host $py311

Step 'ML service virtualenv'
$venvPy = Join-Path $root 'ml-service\venv\Scripts\python.exe'
if (Test-Path $venvPy) {
  $v = & $venvPy --version
  if ($v -notmatch '3\.11\.') { Fail "ml-service\venv uses $v. Delete the folder and re-run this script." }
  Write-Host "venv exists ($v)"
} else {
  & py -3.11 -m venv (Join-Path $root 'ml-service\venv')
  if ($LASTEXITCODE -ne 0) { Fail 'could not create the virtualenv' }
}
& $venvPy -m pip install --quiet --upgrade pip
$req = if ($WithTraining) { 'ml-service\requirements-dev.txt' } else { 'ml-service\requirements.txt' }
Write-Host "pip install -r $req (a few minutes the first time)"
& $venvPy -m pip install --quiet -r (Join-Path $root $req)
if ($LASTEXITCODE -ne 0) { Fail "pip install failed. See docs\TROUBLESHOOTING.md (section: pip install fails)" }

if (-not $SkipNpm) {
  foreach ($d in 'server', 'client') {
    Step "npm ci in $d"
    Push-Location (Join-Path $root $d)
    npm ci --no-audit --no-fund
    if ($LASTEXITCODE -ne 0) { Pop-Location; Fail "npm ci failed in $d. See docs\TROUBLESHOOTING.md (section: npm install fails)" }
    Pop-Location
  }
}

Step 'Environment files'
function RandomHex($bytes) { $b = New-Object byte[] $bytes; [Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($b); (($b | ForEach-Object { $_.ToString('x2') }) -join '') }
$utf8 = New-Object Text.UTF8Encoding $false
$mlEnv = Join-Path $root 'ml-service\.env'
$srvEnv = Join-Path $root 'server\.env'
$cliEnv = Join-Path $root 'client\.env'

if (-not (Test-Path $mlEnv)) {
  [IO.File]::WriteAllText($mlEnv, "INTERNAL_API_KEY=$(RandomHex 32)`nARTIFACTS_DIR=./artifacts`nPARQUET_DIR=../data/processed`n", $utf8)
  Write-Host 'created ml-service\.env'
} else { Write-Host 'ml-service\.env exists (kept)' }
$mlKey = ((Get-Content $mlEnv | Where-Object { $_ -like 'INTERNAL_API_KEY=*' }) -split '=', 2)[1].Trim()

if (-not (Test-Path $srvEnv)) {
  $lines = Get-Content (Join-Path $root 'server\.env.example') | ForEach-Object {
    $_ -replace '^JWT_SECRET=.*', "JWT_SECRET=$(RandomHex 48)" -replace '^ML_INTERNAL_KEY=.*', "ML_INTERNAL_KEY=$mlKey" -replace '\s+#.*$', ''
  }
  [IO.File]::WriteAllLines($srvEnv, $lines, $utf8)
  Write-Host 'created server\.env (ML_INTERNAL_KEY copied from ml-service\.env)'
} else { Write-Host 'server\.env exists (kept)' }

if (-not (Test-Path $cliEnv)) { Copy-Item (Join-Path $root 'client\.env.example') $cliEnv; Write-Host 'created client\.env' } else { Write-Host 'client\.env exists (kept)' }

Step 'Doctor'
node (Join-Path $root 'scripts\doctor.mjs')
Write-Host "`nNext: powershell -ExecutionPolicy Bypass -File scripts\start-dev.ps1   then open http://localhost:5173" -ForegroundColor Green
