# Troubleshooting and recovery guide

Everything useful when something breaks, especially when you set the project up on **another PC**. Many of these are
problems that really happened while building it, so the fixes are tested, not guessed.

**Start here, always:**

```powershell
node scripts/doctor.mjs
```

It checks Node, Python 3.11, the virtualenv, installed packages, trained models, the `.env` files (including whether the
shared secret matches), data files, free disk/RAM and which ports are taken, and prints a **fix** next to every problem.
Add `--json` for machine-readable output. If it passes and something is still wrong, find the symptom below.

Contents: [1. Known-good environment](#1-known-good-environment) · [2. Setting up a new PC](#2-setting-up-a-new-pc) ·
[3. Symptom to fix tables](#3-symptom-to-fix) · [4. Moving the project between PCs](#4-moving-the-project-between-pcs) ·
[5. Reset recipes](#5-reset-recipes) · [6. Command cheat sheet](#6-command-cheat-sheet) · [7. Asking for help](#7-asking-for-help)

---

## 1. Known-good environment

| Thing | Version used | Notes |
|---|---|---|
| OS | Windows 10 Pro 22H2 (also fine on macOS/Linux; use `scripts/setup.sh`) | 8 GB RAM, 4 cores |
| **Python** | **3.11.9** | **Must be 3.11.** 3.14 (and 3.12/3.13 untested) may lack wheels for XGBoost 3.2 / SHAP / pyarrow, and the model files are pickles built on 3.11 |
| Node.js | 26.7 on the dev PC, **20 LTS in CI/Docker** | works on 20 to 26 |
| npm | 11.x | `npm ci` uses the committed lockfiles |
| MongoDB | 7.0.x (via `mongodb-memory-server`, or Atlas, or `mongo:7` in Docker) | any 6+ works |
| xgboost / scikit-learn | **3.2.0 / 1.9.1 (pinned)** | the committed `.joblib` models are pickles of exactly these versions |
| pandas / numpy / duckdb / pyarrow | 3.1.0 / 2.4.6 / **2.0.0** / 26.0.0 | DuckDB 2.x API differs from 1.x (see 3.7) |
| FastAPI / pydantic / uvicorn | 0.162 / 2.14 / 0.54 | |
| React / Vite / Tailwind | 18.3 / 5.x / **3.4 (pinned)** | Tailwind 4 would break the config |
| Free disk needed | about 4 GB (see budget below) | |

**Disk budget** (the dev PC ran down to 1.5 GB free at one point): `ml-service/venv` 0.8 GB (+0.7 GB with torch/jupyter),
`server/node_modules` 0.1 GB, `client/node_modules` 0.25 GB, mongod download cache 0.1-0.3 GB, raw CSVs 1.2 GB,
`data/processed/flights` 0.15 GB, `data/processed/features` about 1 GB (only needed for retraining).

---

## 2. Setting up a new PC

Order matters. Total time is about 10 minutes plus downloads.

1. **Install the tools** (Windows; open a **new** terminal after installing so PATH refreshes):
   ```powershell
   winget install OpenJS.NodeJS.LTS
   winget install -e --id Python.Python.3.11
   winget install Git.Git
   py -3.11 --version      # must print Python 3.11.x
   node --version          # 20 or newer
   ```
2. **Get the code:** `git clone <repo-url>` (or copy the folder; see section 4). The trained models are in git.
3. **Run the setup script** from the repo root:
   ```powershell
   powershell -ExecutionPolicy Bypass -File scripts\setup.ps1
   ```
   macOS/Linux: `bash scripts/setup.sh`. It creates the venv, installs pinned requirements, runs `npm ci` in `server` and
   `client`, creates the three `.env` files with **generated secrets** (and copies the ML key so server and ML service
   agree), then runs the doctor. Add `-WithTraining` (Windows) / `--with-training` (bash) to also install torch/jupyter.
4. **Start everything:** `powershell -ExecutionPolicy Bypass -File scripts\start-dev.ps1`, then open
   <http://localhost:5173>. Stop with `scripts\start-dev.ps1 -Stop`. Logs go to `.logs\`.
5. **Optional data for the History / Insights / Risk-map pages:** copy `data/processed/` from another PC (section 4) or
   rebuild it from the Kaggle CSVs. Predictions work without it.

What works with **nothing else configured**: manual and live prediction (demo flights + real Open-Meteo weather), saved
searches, bulk CSV, admin. What needs extra: real flight data (`AVIATIONSTACK_KEY`), the analytics pages
(`data/processed`), alert emails (`SMTP_*`), production hosting (Atlas URI).

---

## 3. Symptom to fix

### 3.1 Python, virtualenv, pip

| Symptom | Cause | Fix |
|---|---|---|
| `py -3.11` says "No suitable Python runtime found" | Python 3.11 not installed, or terminal opened before install | `winget install -e --id Python.Python.3.11`, then a **new** terminal. `py -0p` lists installed versions |
| `python --version` shows 3.14 but 3.11 is installed | Several Pythons; `python` is the newest | Expected. Always use the venv: `ml-service\venv\Scripts\python`, or `py -3.11` to create it |
| `pip install` fails building `numpy`/`pyarrow`/`xgboost`/`shap` ("no matching distribution", "Failed building wheel") | Wrong Python version (3.12+/3.14) so no prebuilt wheel exists | Delete `ml-service\venv`, install Python **3.11**, re-run the setup script |
| pip: `getaddrinfo failed`, `Retrying ... NewConnectionError`, SSL errors | No internet / DNS / corporate proxy / VPN | Check `ping pypi.org`. Behind a proxy: `pip install --proxy http://user:pass@host:port ...` or set `HTTPS_PROXY`. A transient failure (we saw one) usually passes on retry |
| `ModuleNotFoundError: No module named 'training'` or `'app'` | Run from the wrong folder, or a script outside `ml-service` | `cd ml-service` first. For ad-hoc scripts set `PYTHONPATH=.` (PowerShell: `$env:PYTHONPATH="."`). `pytest` is configured via `pytest.ini` and needs no variable |
| `python -m training.xxx` -> `No module named training` | Same | Run it **from `ml-service/`**, not from the repo root |
| `Activate.ps1 cannot be loaded because running scripts is disabled` | PowerShell execution policy | Don't activate. Call the venv python directly, or: `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned` |
| Venv copied from another PC does not work ("did not find executable ...") | Virtualenvs hard-code absolute paths | Never copy `venv/`. Delete it and re-run setup |
| Warning: `xgboost version differs from training` | Different xgboost than the models were built with | `pip install -r ml-service/requirements.txt` in the venv (pinned). If you retrain, the manifest records the new version |
| `InconsistentVersionWarning` from scikit-learn when loading models | scikit-learn differs from 1.9.1 | Same: use the pinned requirements |
| `pip install` of `torch` is huge/slow | torch is dev-only (neural-net comparison) | You do **not** need it to serve or test. Only `requirements-dev.txt` has it |

### 3.2 Node, npm, MongoDB

| Symptom | Cause | Fix |
|---|---|---|
| `npm ci` fails: `EBADENGINE` / peer dependency errors | Old Node | Node 20+ required (`node --version`) |
| `npm ci` fails with `EPERM`/`EBUSY` on Windows | A dev server or antivirus holds files | Stop servers (`scripts\start-dev.ps1 -Stop`), close editors on `node_modules`, retry; exclude the folder from Defender real-time scanning if repeated |
| `npm warn install-scripts ... mongodb-memory-server postinstall` | npm 11 does not auto-run install scripts | Harmless. The mongod binary downloads on **first start** instead |
| `npm run dev:db` hangs at first start | Downloading mongod (100-300 MB) from fastdl.mongodb.org | Wait. Behind a proxy set `HTTPS_PROXY`; or use Atlas / a real local mongod / Docker instead and set `MONGODB_URI` |
| `MongooseServerSelectionError: connect ECONNREFUSED 127.0.0.1:27017` | No MongoDB running | `cd server; npm run dev:db` (keep it running), or `scripts\start-dev.ps1` |
| `MongooseServerSelectionError` with Atlas | IP not allowlisted, bad URI, special chars in password | Atlas > Network Access > add your IP (or 0.0.0.0/0 for dev); **URL-encode the password** (`@` becomes `%40`); use the `mongodb+srv://` string |
| `E11000 duplicate key` in logs after changing models | Old index vs new code | Dev only: delete `server/.data/mongo` (resets local DB) |
| Port already in use: `EADDRINUSE :::5000` (or 8000/5173/27017) | A previous run is still alive | `scripts\start-dev.ps1 -Stop`. Manually: `netstat -ano \| findstr :5000` then `taskkill /PID <pid> /F` |
| Vite: `Port 5173 is already in use` | `strictPort` is on so CORS config stays valid | Stop the other instance (do not switch port, `CLIENT_URL` expects 5173) |

### 3.3 Configuration and secrets

| Symptom | Cause | Fix |
|---|---|---|
| Server exits at start: `Missing or invalid env:` + a list | `server/.env` missing or a value invalid | `copy server\.env.example server\.env` and fill, or run setup. `JWT_SECRET` must be 32+ chars, `ML_INTERNAL_KEY` 16+ |
| ML service exits: `ValidationError ... internal_api_key` | `ml-service/.env` missing | Create it (setup script does). `INTERNAL_API_KEY` must be 16+ chars |
| Every prediction fails with **503 "Prediction service is unavailable"** | ML service down, wrong `ML_SERVICE_URL`, **or key mismatch** (ML answers 403, server maps it to 503) | `node scripts/doctor.mjs` ("shared secret matches"). Make `server/.env ML_INTERNAL_KEY` equal `ml-service/.env INTERNAL_API_KEY` |
| ML service returns **403** to curl | Missing `X-Internal-Key` header | Every route needs it, including `/health`. Docker/Render health checks can't send it: probe the Node `/api/v1/health` instead |
| `.env` values with spaces/`#` behave oddly | Inline comments | In `.env` files comments must be on their own line or after whitespace + `#`. Quote values containing `#` |
| Changed `.env` but nothing changes | Process not restarted | Restart. `vite` bakes `VITE_*` at **build/start** time |
| Accidentally committed a secret | | Rotate it (new `JWT_SECRET` logs everyone out; new `ML_INTERNAL_KEY` in both places), then remove from history. `.env` files are git-ignored; only `*.env.example` are committed |

### 3.4 Browser / API behaviour

| Symptom | Cause | Fix |
|---|---|---|
| Browser console: CORS error, requests blocked | Origin not in `CLIENT_URL` | `server/.env`: `CLIENT_URL=http://localhost:5173` (exact, **no trailing slash**, comma-separate several). Restart the server. `127.0.0.1` and `localhost` are different origins |
| Everything returns 401 / you keep getting logged out | Token expired (12 h), `JWT_SECRET` changed, or account deleted | Log in again. After changing `JWT_SECRET` all old tokens are invalid by design |
| **Flash of the wrong theme** on reload | The inline script in `client/index.html` removed/edited | Restore it. In production its hash is in the CSP (`client/nginx.conf`, `client/vercel.json`); `npm test` fails if they drift |
| Blank page in production, console says `Refused to execute inline script` | CSP hash no longer matches `index.html` | Update the `sha256-...` in `nginx.conf` and `vercel.json` (the failing test prints the expected value) |
| Refreshing `/eda` gives 404 on Vercel/nginx | SPA rewrite missing | `client/vercel.json` rewrite / nginx `try_files ... /index.html` (both provided) |
| **Map is blank / grey** | Leaflet CSS not imported, or container height 0, or tiles blocked | The map component imports the CSS and has a fixed height. Tiles come from `tile.openstreetmap.org` (must be allowed by CSP `img-src` and your network) |
| Insights/History/Risk-map show "unavailable" (HTTP 503) | ML service has no flights parquet | Copy `data/processed/flights/` (12 files) onto that machine, or set `PARQUET_URL` (docs/deployment-guide.md). Predictions are unaffected |
| "Demo data" badge on live flights | No `AVIATIONSTACK_KEY`, quota reached (stops at 90%), or API error and nothing cached | Add a key; check **Admin > Usage > AviationStack quota**. By design it falls back to demo flights instead of failing |
| Weather box says "Forecast unavailable" | Open-Meteo unreachable, date beyond its 16-day forecast, or unknown airport | Network/proxy. Predictions still work (typical weather is used and a warning is shown) |
| **429 Too many requests** | Rate limit (anonymous 30 / logged-in 120 predictions per 15 min; login 20 per 15 min per IP) | Wait, or log in. Tune `RATE_LIMIT_*` in `server/.env` |
| Bulk CSV: "Missing required column(s)" / row errors | Header names or formats | Download the template on the Bulk page. Required: `airline,origin,destination,scheduled_departure` (ISO `2026-12-22T09:00:00`). Max 500 rows, 512 KB, `.csv` |
| Save/Login does nothing, console shows `ERR_CONNECTION_REFUSED` to :5000 | API server not running, or `VITE_API_URL` wrong | Start the server; check `client/.env` and restart vite |
| `ml-service` says `feature mismatch between manifest.json and feature_builder.FEATURE_COLUMNS` | Code and model artifacts from different versions | `git checkout -- ml-service/artifacts` to restore the matching set, or retrain. Never hand-edit the feature list |

### 3.5 Tests

| Symptom | Cause | Fix |
|---|---|---|
| Client tests: `TypeError: Cannot read properties of undefined (reading 'clear')` on `localStorage` | Node 25/26's experimental global `localStorage` shadows jsdom's | Already handled in `client/tests/setup.js` (in-memory Storage). If you see it in a new test file, make sure the setup file is used (`vite.config.js` `test.setupFiles`) |
| Server tests hang on first run | `mongodb-memory-server` downloading mongod | Wait once (cached afterwards in `%USERPROFILE%\.cache\mongodb-binaries`). Offline: pre-download or point `MONGOMS_SYSTEM_BINARY` at a local `mongod` |
| Server test: `E11000` or leftover data | A test file reused a DB | Each test file boots its own in-memory DB; run `npm test` (it sets `--test-concurrency=1`) |
| `pytest` -> skipped tests | Analytics tests skip when `data/processed/flights` is absent | Expected on CI and fresh PCs |
| `pytest` collects nothing / import errors | Wrong working directory | `cd ml-service; python -m pytest` |
| Dates behave differently across PCs | Flight times are **airport-local wall clock**, never converted with the browser time zone; `createdAt` stamps are UTC and shown in local time | Intentional |

### 3.6 Memory and disk

| Symptom | Cause | Fix |
|---|---|---|
| DuckDB: `Out of Memory Error: Allocation failure` | Big single-pass queries on 8 GB machines | The pipeline already works month by month with a 1.5 GB cap. If it still fails close other apps; lower `memory_limit` in `training/data_cleaning.py` |
| ML service uses 600+ MB on analytics | DuckDB scanning 6.8M rows | `DUCKDB_MEMORY_LIMIT=300MB` (needed on a 512 MB host) |
| Training crashes with MemoryError | Loading all months at once | Use `--sample 0.15` for a proving run; the loaders already filter per month |
| "No space left on device" / disk almost full | See disk budget in section 1 | Delete `data/processed/features/` (rebuilt by `python -m training.feature_engineering`), `ml-service/artifacts_sample/`, `*/node_modules` you don't need, `ml-service/venv` extras (torch) |

### 3.7 Data and training

| Symptom | Cause | Fix |
|---|---|---|
| Don't have the Kaggle files | | Kaggle dataset **`bordanova/2023-us-civil-flights-delay-meteo-and-aircraft`**. Put these 4 in `data/`: `US_flights_2023.csv`, `Cancelled_Diverted_2023.csv`, `weather_meteo_by_airport.csv`, `airports_geolocation.csv`. Ignore `maj us flight - january 2024.csv`. CLI: needs `%USERPROFILE%\.kaggle\kaggle.json` |
| `FileNotFoundError: missing raw file` | Files not in `data/` | As above |
| `AttributeError: Relations no longer have fetchone()` | DuckDB 2.x API (`con.sql(...).fetchone()` was removed) | Use `con.execute(sql).fetchone()`. Keep `duckdb==2.0.0` pinned |
| Rebuild order (all from `ml-service/`) | | `python -m training.data_cleaning --to-parquet` (about 90 s) -> `python -m training.feature_engineering` (about 60 s) -> `train_xgboost`, `train_regressor`, `train_baseline`, `train_random_forest`, `train_neural_net`, `train_xgboost --random-split`, `generate_shap_background`, `compare_models` (about 10 min total). Add `--sample 0.15` for a quick test (writes to `artifacts_sample/`) |
| Test AUC much lower than validation | Time split: Oct-Dec has a different base rate (15% delays vs 22%) | Expected and documented (docs/ml-methodology.md). Do **not** switch to a random split to hide it |
| After retraining the server shows the old model | Server caches `/analytics/models/compare` for 24 h | Admin > Models > "Refresh from ML service" (busts that cache) and restart the ML service |

### 3.8 Windows-specific

| Symptom | Fix |
|---|---|
| Scripts won't run (execution policy) | Run via `powershell -ExecutionPolicy Bypass -File scripts\setup.ps1` (no permanent change needed) |
| Commands not found right after installing something | Open a **new** terminal (PATH is read at start) |
| `Long path` errors in `node_modules` | `git config --system core.longpaths true`; enable Windows long paths; keep the project near a drive root (`D:\New project` is fine) |
| Git says `LF will be replaced by CRLF` | Harmless warning. `.gitattributes` forces LF for `*.sh`, `Dockerfile`, `*.yml`, `nginx.conf` so containers don't break |
| Antivirus slows `npm`/`pip` badly | Exclude the project folder from real-time scanning |
| Bash scripts on Windows | Use Git Bash or WSL. `scripts\setup.sh` is for macOS/Linux; Windows uses `setup.ps1` |

### 3.9 Docker and deployment

| Symptom | Cause | Fix |
|---|---|---|
| `docker compose up` -> `set JWT_SECRET in .env` | Required variable empty | `copy .env.example .env`, fill `JWT_SECRET` (32+) and `ML_INTERNAL_KEY` (16+) |
| ML image build: `COPY data/external ... not found` | Wrong build context | The ml-service image is built from the **repo root**: `docker build -f ml-service/Dockerfile .` (compose does this) |
| Container exits: `exec ./docker-entrypoint.sh: no such file or directory` | Script has CRLF line endings | `.gitattributes` prevents it; the Dockerfile also strips `\r`. If you edited it on Windows, save with LF |
| Server container unhealthy | MongoDB not ready / ML down | `docker compose logs server`. `/api/v1/health` is 503 only when the DB is down |
| Browser calls `http://localhost:5000` from a deployed site | `VITE_API_URL` is baked at **build** time | Rebuild the client with the right `--build-arg VITE_API_URL=...` (compose uses `SERVER_URL`) |
| Render: first request takes 30-60 s | Free instances sleep | Expected on the free plan; the ML service also loads models on boot |
| Render ML service out of memory | 512 MB limit | `DUCKDB_MEMORY_LIMIT=300MB`, XGBoost-only serving (Decision 7); don't load more models |
| Render server can't reach ML | `ML_SERVICE_URL` must be the **https URL of the ML service** and keys must match | Copy the generated `INTERNAL_API_KEY` of the ML service into the server's `ML_INTERNAL_KEY` |
| Deploy workflow does nothing | Secrets not set (steps skip on purpose) | Add `RENDER_ML_DEPLOY_HOOK`, `RENDER_SERVER_DEPLOY_HOOK`, `VERCEL_TOKEN`, `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID` as repo secrets |
| Docker was **not** run on the dev PC | None was installed | The Dockerfiles were validated by simulating each image's file layout and by YAML/cross-reference checks, but a real `docker compose up --build` is the first thing to run on a PC with Docker. CI also builds all three images |

---

## 4. Moving the project between PCs

**Copy** (or `git clone`, then add the data separately):

| Copy | Size | Why |
|---|---|---|
| The repo (everything tracked by git) | about 15 MB | code, trained models, lookups, notebooks, docs |
| `data/processed/flights/` | 145 MB | analytics pages. Or run `python scripts/pack-data.py` to make one checked `.tar.gz` |
| `data/*.csv` (the 4 raw files) | 1.2 GB | **only** to retrain |

**Do not copy:** `ml-service/venv/`, `server/node_modules/`, `client/node_modules/`, `.env` files (secrets, regenerate), `server/.data/` (local DB), `.logs/`, `data/processed/features/` (rebuildable), `*/dist`.

If you want your local accounts/saved searches on the new PC, copy `server/.data/mongo/` **while MongoDB is stopped** (same major version), otherwise start fresh and re-register.

**Fully offline PC:** on a connected PC run `pip download -r ml-service/requirements.txt -d wheels` (Python 3.11, same OS/arch), copy the `wheels` folder and `npm ci` caches (`npm cache ls`), install with `--no-index --find-links wheels`. The mongod binary comes from `%USERPROFILE%\.cache\mongodb-binaries`; copy it too.

---

## 5. Reset recipes

| Goal | Steps |
|---|---|
| Clean reinstall of the ML venv | `rmdir /s /q ml-service\venv` then `scripts\setup.ps1` |
| Clean reinstall of node deps | delete `server\node_modules` and `client\node_modules`, `npm ci` in each |
| Reset the local database | `scripts\start-dev.ps1 -Stop`, delete `server\.data\mongo`, start again (all users/searches/logs are gone) |
| Make yourself an admin | put your email in `ADMIN_EMAILS` in `server/.env`, restart, **register** with that email (applies at registration). For an existing account: Mongo shell `db.users.updateOne({email:"you@x.com"},{$set:{role:"admin"}})` |
| New secrets | new `JWT_SECRET` (everyone logs out). New ML key: change **both** `ml-service/.env` and `server/.env` |
| Rebuild everything ML from raw data | section 3.7 "Rebuild order" |
| Restore the committed models | `git checkout -- ml-service/artifacts` |
| Free disk quickly | delete `data/processed/features`, `ml-service/artifacts_sample`, `.logs`, `dist-data`, `client/dist` |

---

## 6. Command cheat sheet

```powershell
# health
node scripts/doctor.mjs
Invoke-RestMethod http://localhost:5000/api/v1/health          # db + ml-service status (200 ok / 200 degraded / 503 down)

# run
powershell -ExecutionPolicy Bypass -File scripts\start-dev.ps1 # all four processes (add -Stop to stop)
cd server;     npm run dev:db   |  npm run dev                  # MongoDB  |  API (port 5000)
cd ml-service; venv\Scripts\python -m uvicorn app.main:app --port 8000
cd client;     npm run dev                                      # http://localhost:5173

# test (all offline, no keys needed)
cd ml-service; venv\Scripts\python -m pytest -q                 # 49 tests
cd server;     npm test                                         # 87 tests (real in-memory MongoDB)
cd client;     npm test                                         # 67 tests
cd server; npm run lint;  cd ..\client; npm run lint;  npm run build

# live end-to-end smoke test of the running stack
$env:ADMIN_EMAILS="e2e-admin@example.com"   # set BEFORE starting the server
powershell -File server\scripts\e2e-smoke.ps1

# who is using a port
netstat -ano | findstr :5000

# Docker (on a machine that has it)
copy .env.example .env      # fill JWT_SECRET and ML_INTERNAL_KEY
docker compose up --build   # http://localhost:8080
```

Useful API checks (replace the key with the value in `ml-service/.env`; do not paste real secrets into chats or issues):

```powershell
$h = @{ 'X-Internal-Key' = '<INTERNAL_API_KEY>' }
Invoke-RestMethod http://localhost:8000/health -Headers $h
```

---

## 7. Asking for help

Include (and **redact secrets**):

1. Output of `node scripts/doctor.mjs`.
2. The exact command you ran and the **last 30 lines** of its output (logs are in `.logs\` when started with `start-dev.ps1`).
3. OS, `node --version`, `py -3.11 --version`, free disk.
4. Whether `data/processed` and the raw CSVs are present.
5. For browser problems: the console errors and the failing request in the Network tab (status + URL).

Never share: `.env` contents, `JWT_SECRET`, `ML_INTERNAL_KEY`, `AVIATIONSTACK_KEY`, `MONGODB_URI` with a password.
