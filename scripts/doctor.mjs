#!/usr/bin/env node
// Environment doctor: finds what is wrong on THIS machine and prints the fix.
//   node scripts/doctor.mjs            check everything
//   node scripts/doctor.mjs --json     machine-readable
// Exit code 1 if any check FAILS (WARN is fine). Never prints secrets. Needs only Node 18+.
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync, statfsSync } from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const isWin = process.platform === 'win32';
const results = [];
const add = (group, name, status, detail = '', fix = '') => results.push({ group, name, status, detail, fix });
const exists = (...p) => existsSync(join(ROOT, ...p));
const read = (...p) => readFileSync(join(ROOT, ...p), 'utf8');

function run(cmd, args, opts = {}) {
  try { return { ok: true, out: execFileSync(cmd, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 20000, ...opts }).trim() }; }
  catch (e) { return { ok: false, out: String(e.stderr || e.message || '').trim() }; }
}

function parseEnv(file) {
  if (!existsSync(file)) return null;
  const out = {};
  for (const line of readFileSync(file, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (m) out[m[1]] = m[2].replace(/\s+#.*$/, '').replace(/^["']|["']$/g, '');
  }
  return out;
}

const portInUse = (port) => new Promise((res) => {
  const s = net.connect({ port, host: '127.0.0.1' });
  s.setTimeout(700);
  s.on('connect', () => { s.destroy(); res(true); });
  s.on('timeout', () => { s.destroy(); res(false); });
  s.on('error', () => res(false));
});

// ------------------------------------------------------------------------------------------------ tools
const nodeMajor = Number(process.versions.node.split('.')[0]);
if (nodeMajor >= 20) add('Tools', 'Node.js', 'PASS', `v${process.versions.node}${nodeMajor > 22 ? ' (newer than the CI version 20; fine, tests are written to work on 20-26)' : ''}`);
else add('Tools', 'Node.js', 'FAIL', `v${process.versions.node}`, 'Install Node 20 LTS or newer: https://nodejs.org (Windows: `winget install OpenJS.NodeJS.LTS`).');

const npm = isWin ? run('cmd', ['/c', 'npm', '--version']) : run('npm', ['--version']); // npm is a .cmd shim on Windows
add('Tools', 'npm', npm.ok ? 'PASS' : 'FAIL', npm.ok ? `v${npm.out}` : npm.out.slice(0, 120), 'npm ships with Node. Reinstall Node.');

const git = run('git', ['--version']);
add('Tools', 'git', git.ok ? 'PASS' : 'WARN', git.out || 'not found', 'Install git: https://git-scm.com (needed to clone and to commit).');

// Python 3.11 is REQUIRED: XGBoost 3.2 / SHAP / pyarrow wheels and the pickled models target it. 3.14 is known-bad.
const candidates = isWin ? [['py', ['-3.11', '--version']], ['python3.11', ['--version']], ['python', ['--version']]] : [['python3.11', ['--version']], ['python3', ['--version']], ['python', ['--version']]];
let py311 = null;
const seen = [];
for (const [c, a] of candidates) {
  const r = run(c, a);
  if (r.ok) { seen.push(`${c}: ${r.out}`); if (/Python 3\.11\./.test(r.out) && !py311) py311 = c; }
}
if (py311) add('Tools', 'Python 3.11', 'PASS', seen.join(' | '));
else add('Tools', 'Python 3.11', 'FAIL', seen.join(' | ') || 'no Python found',
  isWin ? 'Run: winget install -e --id Python.Python.3.11   then open a NEW terminal and check `py -3.11 --version`.'
    : 'Install Python 3.11 (macOS: `brew install python@3.11`; Ubuntu: `sudo apt install python3.11 python3.11-venv`).');

const docker = run('docker', ['--version']);
add('Tools', 'Docker (optional)', docker.ok ? 'PASS' : 'WARN', docker.ok ? docker.out : 'not installed','Only needed for `docker compose up`. Everything also runs without it.');

// ------------------------------------------------------------------------------------------------ machine
const gb = (n) => (n / 1024 ** 3).toFixed(1);
const total = os.totalmem();
const free = os.freemem();
add('Machine', 'RAM', total >= 7.5 * 1024 ** 3 ? 'PASS' : 'WARN', `${gb(total)} GB total, ${gb(free)} GB free`,
  'Full model training needs about 3 GB free (use `--sample 0.15` on any trainer for a small run). Serving needs about 0.5 GB.');
try {
  const s = statfsSync(ROOT);
  const freeDisk = s.bavail * s.bsize;
  add('Machine', 'Disk space (project drive)', freeDisk >= 4 * 1024 ** 3 ? 'PASS' : freeDisk >= 1.5 * 1024 ** 3 ? 'WARN' : 'FAIL', `${gb(freeDisk)} GB free`,
    'Budget: venv about 0.8 GB (+ about 0.7 GB with torch/jupyter), node_modules about 0.35 GB, raw CSVs 1.2 GB, parquet 0.15 GB, features 1 GB. Delete data/processed/features or the venv if short.');
} catch { add('Machine', 'Disk space', 'WARN', 'could not read'); }

// ------------------------------------------------------------------------------------------------ ml-service
const venvPy = isWin ? join(ROOT, 'ml-service', 'venv', 'Scripts', 'python.exe') : join(ROOT, 'ml-service', 'venv', 'bin', 'python');
if (!existsSync(venvPy)) {
  add('ML service', 'virtualenv', 'FAIL', 'ml-service/venv not found', isWin ? 'Run scripts\\setup.ps1' : 'Run scripts/setup.sh');
} else {
  const v = run(venvPy, ['--version']);
  add('ML service', 'virtualenv Python', /3\.11\./.test(v.out) ? 'PASS' : 'FAIL', v.out, 'Delete ml-service/venv and re-run the setup script with Python 3.11 installed.');
  const probe = run(venvPy, ['-c', 'import fastapi,duckdb,xgboost,shap,sklearn,pandas,pyarrow,pydantic_settings;print(xgboost.__version__,sklearn.__version__,duckdb.__version__)']);
  if (probe.ok) {
    const [xgb, skl, dk] = probe.out.split(' ');
    add('ML service', 'Python packages', 'PASS', `xgboost ${xgb}, scikit-learn ${skl}, duckdb ${dk}`);
    try {
      const man = JSON.parse(read('ml-service', 'artifacts', 'models', 'manifest.json'));
      if (man.xgboost_version && man.xgboost_version !== xgb) add('ML service', 'XGBoost version matches the trained models', 'WARN', `installed ${xgb}, models trained with ${man.xgboost_version}`, 'Run `pip install -r ml-service/requirements.txt` (versions are pinned) inside the venv.');
    } catch { /* manifest checked below */ }
  } else add('ML service', 'Python packages', 'FAIL', probe.out.split('\n').slice(-2).join(' ').slice(0, 200), 'Activate the venv and run: pip install -r ml-service/requirements.txt');
}

try {
  const man = JSON.parse(read('ml-service', 'artifacts', 'models', 'manifest.json'));
  if (!man.version) throw new Error('empty manifest');
  const need = [...Object.values(man.models).flatMap((m) => [m.file, m.calibrator].filter(Boolean)), man.shap_background];
  const missing = need.filter((f) => !exists('ml-service', 'artifacts', 'models', f));
  const metrics = JSON.parse(read('ml-service', 'artifacts', 'metrics', 'model_metrics.json'));
  if (missing.length) add('ML artifacts', 'model files', 'FAIL', `missing: ${missing.join(', ')}`, 'They are committed to git: run `git status` / `git checkout -- ml-service/artifacts`, or retrain (docs/ml-methodology.md).');
  else if (metrics.version !== man.version) add('ML artifacts', 'metrics match manifest', 'FAIL', `${metrics.version} vs ${man.version}`, 'Re-run `python -m training.compare_models` from ml-service.');
  else add('ML artifacts', 'trained models', 'PASS', `version ${man.version}, ${need.length} files`);
  const lk = ['static_lookups.json', 'rolling_snapshot.json', 'weather_medians.json'].filter((f) => !exists('ml-service', 'artifacts', 'lookups', f));
  add('ML artifacts', 'lookups', lk.length ? 'FAIL' : 'PASS', lk.length ? `missing ${lk.join(', ')}` : 'present', 'Run `python -m training.feature_engineering` from ml-service (needs the processed parquet).');
} catch (e) { add('ML artifacts', 'manifest', 'FAIL', String(e.message).slice(0, 120), 'Artifacts are committed to git. Restore them with `git checkout -- ml-service/artifacts` or retrain.'); }

add('ML artifacts', 'airports.csv (needed to serve)', exists('data', 'external', 'airports.csv') ? 'PASS' : 'FAIL', '', 'Committed to git (data/external/airports.csv). Restore it with git.');

// ------------------------------------------------------------------------------------------------ data
const flightsDir = join(ROOT, 'data', 'processed', 'flights');
const parquets = existsSync(flightsDir) ? readdirSync(flightsDir).filter((f) => f.endsWith('.parquet')).length : 0;
add('Data', 'processed parquet (analytics pages)', parquets === 12 ? 'PASS' : parquets ? 'WARN' : 'WARN', `${parquets}/12 monthly files`,
  'Optional for predictions. Without it /analytics/* answers 503. Rebuild: `python -m training.data_cleaning --to-parquet` (needs the raw CSVs) or copy data/processed from another PC (docs/setup-guide.md).');
const rawNeeded = ['US_flights_2023.csv', 'Cancelled_Diverted_2023.csv', 'weather_meteo_by_airport.csv', 'airports_geolocation.csv'];
const rawMissing = rawNeeded.filter((f) => !exists('data', f));
add('Data', 'raw Kaggle CSVs (training only)', rawMissing.length ? 'WARN' : 'PASS', rawMissing.length ? `missing: ${rawMissing.join(', ')}` : 'all 4 present',
  'Only needed to RETRAIN. Download bordanova/2023-us-civil-flights-delay-meteo-and-aircraft from Kaggle into data/.');

// ------------------------------------------------------------------------------------------------ env files
const srv = parseEnv(join(ROOT, 'server', '.env'));
const ml = parseEnv(join(ROOT, 'ml-service', '.env'));
const cli = parseEnv(join(ROOT, 'client', '.env'));
const setupHint = isWin ? 'Run scripts\\setup.ps1 (creates them with generated secrets).' : 'Run scripts/setup.sh (creates them with generated secrets).';
if (!srv) add('Config', 'server/.env', 'FAIL', 'missing', setupHint);
else {
  const bad = [];
  if ((srv.JWT_SECRET || '').length < 32) bad.push('JWT_SECRET shorter than 32 chars');
  if ((srv.ML_INTERNAL_KEY || '').length < 16) bad.push('ML_INTERNAL_KEY shorter than 16 chars');
  if (!srv.MONGODB_URI) bad.push('MONGODB_URI empty');
  add('Config', 'server/.env', bad.length ? 'FAIL' : 'PASS', bad.join('; ') || 'required values present', 'The server refuses to start with these. Edit server/.env (see server/.env.example).');
  if (!(srv.CLIENT_URL || '').split(',').map((s) => s.trim()).includes('http://localhost:5173')) add('Config', 'CORS (CLIENT_URL)', 'WARN', srv.CLIENT_URL || '(empty)', 'For local dev CLIENT_URL must include http://localhost:5173 (exact, no trailing slash) or the browser blocks every API call.');
  if (!srv.AVIATIONSTACK_KEY) add('Config', 'AviationStack key', 'WARN', 'empty: running on demo flights', 'Fine for development. Add AVIATIONSTACK_KEY for real flight data (free tier about 100 requests/month).');
}
if (!ml) add('Config', 'ml-service/.env', 'FAIL', 'missing', setupHint);
else add('Config', 'ml-service/.env', (ml.INTERNAL_API_KEY || '').length >= 16 ? 'PASS' : 'FAIL', (ml.INTERNAL_API_KEY || '').length >= 16 ? 'INTERNAL_API_KEY present' : 'INTERNAL_API_KEY missing or shorter than 16 chars', 'Set it, and use the SAME value as ML_INTERNAL_KEY in server/.env.');
if (srv && ml) add('Config', 'shared secret matches', srv.ML_INTERNAL_KEY && srv.ML_INTERNAL_KEY === ml.INTERNAL_API_KEY ? 'PASS' : 'FAIL', srv.ML_INTERNAL_KEY === ml.INTERNAL_API_KEY ? 'server and ML service agree' : 'server ML_INTERNAL_KEY differs from ml-service INTERNAL_API_KEY',
  'Mismatch makes every prediction fail with 503 (the ML service answers 403). Copy one value into both files.');
if (!cli) add('Config', 'client/.env', 'WARN', 'missing: defaults to http://localhost:5000', setupHint);
else add('Config', 'client/.env', 'PASS', `VITE_API_URL=${cli.VITE_API_URL || '(default)'}`);

// ------------------------------------------------------------------------------------------------ dependencies
add('Dependencies', 'server/node_modules', exists('server', 'node_modules', 'express') ? 'PASS' : 'FAIL', '', 'cd server && npm ci');
add('Dependencies', 'client/node_modules', exists('client', 'node_modules', 'react') ? 'PASS' : 'FAIL', '', 'cd client && npm ci');
const memSrv = exists('server', 'node_modules', 'mongodb-memory-server');
add('Dependencies', 'local MongoDB', memSrv ? 'PASS' : 'WARN', memSrv ? '`npm run dev:db` (in server/) starts one; the first start downloads mongod (about 100-300 MB)' : 'mongodb-memory-server not installed',
  'You need ANY MongoDB: `cd server && npm run dev:db`, or a local mongod, or an Atlas URI in server/.env, or docker compose.');

// ------------------------------------------------------------------------------------------------ ports
for (const [port, who] of [[27017, 'MongoDB'], [8000, 'ML service'], [5000, 'API server'], [5173, 'client (vite)']]) {
  const used = await portInUse(port);
  add('Ports', `${port} (${who})`, 'PASS', used ? 'in use (is it the service you started? stop strays if startup fails with EADDRINUSE)' : 'free',
    isWin ? `Find the process: netstat -ano | findstr :${port}   then: taskkill /PID <pid> /F` : `Find the process: lsof -i :${port}   then: kill <pid>`);
}

// ------------------------------------------------------------------------------------------------ report
const json = process.argv.includes('--json');
if (json) { console.log(JSON.stringify(results, null, 2)); process.exit(results.some((r) => r.status === 'FAIL') ? 1 : 0); }

const icon = { PASS: '\x1b[32m PASS \x1b[0m', WARN: '\x1b[33m WARN \x1b[0m', FAIL: '\x1b[31m FAIL \x1b[0m' };
let group = '';
console.log(`\nFlight Delay Predictor - environment doctor (${os.platform()} ${os.release()}, Node ${process.versions.node})\nProject: ${ROOT}\n`);
for (const r of results) {
  if (r.group !== group) { group = r.group; console.log(`\n${group}`); }
  console.log(`  [${icon[r.status]}] ${r.name}${r.detail ? ` - ${r.detail}` : ''}`);
  if (r.status !== 'PASS' && r.fix) console.log(`           fix: ${r.fix}`);
}
const n = (s) => results.filter((r) => r.status === s).length;
console.log(`\n${n('PASS')} passed, ${n('WARN')} warnings, ${n('FAIL')} failed. More help: docs/TROUBLESHOOTING.md\n`);
process.exit(n('FAIL') ? 1 : 0);
