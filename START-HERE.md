# START HERE: handover and recovery guide

For a person, or any AI assistant, who picks this project up on **another PC with no earlier context**. It tells you what the
project is, what state it is in, how to get it running, what to do when something breaks, and what is still open.
Everything here was verified while building the project; where something is **not** verified or **not** solved it says so.

- Repo: <https://github.com/bhikadiyaom/flight-delay-prediction> (branch `main`)
- Deeper docs: `README.md`, `docs/TROUBLESHOOTING.md` (symptom to fix tables), `docs/CONTEXT.md` (locked decisions + build log), `docs/setup-guide.md`, `docs/deployment-guide.md`, `docs/api-spec.md`, `docs/architecture.md`, `docs/ml-methodology.md`

---

## 1. The project in one paragraph

A web app that predicts whether a US flight will be **delayed (15+ min) or cancelled**, with calibrated probabilities and the
five factors behind each score. Three programs: a **React client** (`client/`, port 5173), a **Node/Express API** (`server/`, port 5000,
MongoDB, JWT auth, live-data caching) and a **Python FastAPI ML service** (`ml-service/`, port 8000, XGBoost + SHAP + DuckDB).
The browser talks only to the Node API; the ML service is internal and guarded by a shared key. Trained on 6.8M flights from 2023.
Honest result: ROC AUC **0.661** on held-out Oct-Dec (a random split would claim 0.745; the limit is the data, not the model).

## 2. State of the project

| Area | Status |
|---|---|
| ML pipeline, trained models (committed in `ml-service/artifacts/`) | done, version `v20261027-d4c7d1` |
| ML service | done, **49 tests pass** |
| Node API | done, **87 tests pass** |
| React client | done, **67 tests pass**, verified in a real browser (light/dark/mobile) |
| Docker images | built successfully **once on GitHub Actions** (the job `Docker images build` was green once); never built on the dev PC (no Docker there) |
| Docs, setup/doctor scripts | done |
| GitHub CI | **PARTLY RED, see section 8.** ML, client and Docker jobs pass; the **Server tests job fails intermittently on GitHub** (passed locally every time) |
| Deployment (Atlas, Render, Vercel) | **not done**: needs your own accounts and keys, procedure in `docs/deployment-guide.md` |
| `docs/team-contributions.md` | **template, must be filled in by the team** |

Git history: 10 commits, all authored as `Om Bhikadiya <156181415+bhikadiyaom@users.noreply.github.com>`. The history was **rewritten once**
(author fixed, tool co-author trailers removed, code unchanged). Anyone who cloned *before* that must re-clone.

## 3. First 15 minutes on a new PC (Windows)

```powershell
# 1. tools (open a NEW terminal after installing)
winget install OpenJS.NodeJS.LTS
winget install -e --id Python.Python.3.11        # must be 3.11, NOT 3.12+/3.14
winget install Git.Git
py -3.11 --version ; node --version              # Python 3.11.x and Node 20+

# 2. code
git clone https://github.com/bhikadiyaom/flight-delay-prediction.git
cd flight-delay-prediction

# 3. one-shot setup: venv + pip + npm ci + .env files with generated secrets + doctor
powershell -ExecutionPolicy Bypass -File scripts\setup.ps1

# 4. run everything, then open http://localhost:5173
powershell -ExecutionPolicy Bypass -File scripts\start-dev.ps1        # stop: add -Stop ; logs: .logs\
```

macOS/Linux: `bash scripts/setup.sh`, then the four commands in `docs/setup-guide.md` section 3.

**If anything is wrong, run `node scripts/doctor.mjs` first.** It checks tools, versions, venv, packages, trained models, `.env` files
(including whether the two shared secrets match), data, disk/RAM and ports, and prints a fix next to every finding.

What works with nothing else: predictions (manual and live with built-in demo flights plus real Open-Meteo weather), saved searches, bulk CSV, admin.
What needs extra: the Insights/History/Risk-map pages need `data/processed` (section 5); real flights need `AVIATIONSTACK_KEY`.

## 4. Git and GitHub on the new PC

```powershell
git config user.name  "Om Bhikadiya"
git config user.email "156181415+bhikadiyaom@users.noreply.github.com"   # GitHub no-reply address of bhikadiyaom
git remote -v                                                            # must show bhikadiyaom/flight-delay-prediction
```

Use your own name/email instead if a different person commits. Check with `git log -3 --format="%an <%ae>"`.

| Problem | Cause and fix |
|---|---|
| `403 Permission denied to <other-account>` on push | Windows cached a login for another GitHub account. `"protocol=https`nhost=github.com`n" \| git credential reject`, delete `git:https://github.com` in Control Panel > Credential Manager > Windows Credentials, then push again and sign in as the right account. Forcing the user: `git remote set-url origin https://bhikadiyaom@github.com/bhikadiyaom/flight-delay-prediction.git` |
| `Authentication failed` / no sign-in window | Create a Personal Access Token (GitHub > Settings > Developer settings > Tokens (classic), scope `repo`) and use it as the password |
| `remote origin already exists` | `git remote set-url origin <url>` (never leave `<you>` placeholders in the URL) |
| `rejected ... fetch first` / `non-fast-forward` | `git pull --rebase origin main`, resolve, push. Do **not** force-push to `main` unless you intend to rewrite history |
| `HTTP 408` / `unexpected disconnect` on push | Network blip or slow upload. Retry. It succeeded on the second attempt before |
| `api.github.com could not be resolved` | DNS flakiness on that PC. Retry, or switch network |
| `LF will be replaced by CRLF` warnings | Harmless. `.gitattributes` keeps `*.sh`, Dockerfiles and YAML as LF |
| Accidentally staged a secret | `git rm --cached <file>`, rotate the secret, and if already pushed remove it from history. `.env` files are git-ignored; only `*.env.example` are tracked |

Workflow: `git pull`, branch (`git checkout -b feature/x`), commit, `git push -u origin feature/x`, open a Pull Request. CI runs on every push.

## 5. What git does NOT contain (and how to get it)

| Missing after clone | Why | How to get it |
|---|---|---|
| `.env` files (server, ml-service, client) | secrets, git-ignored | `scripts\setup.ps1` generates them. The **server `ML_INTERNAL_KEY` must equal the ML service `INTERNAL_API_KEY`** (setup copies one into the other) |
| `ml-service/venv`, `*/node_modules` | rebuilt locally | `scripts\setup.ps1` (never copy a venv between PCs, it hard-codes paths) |
| `data/processed/flights/*.parquet` (145 MB) | too big for git | copy from the old PC, or `python scripts/pack-data.py` there to make one checked `.tar.gz`, or rebuild from the Kaggle CSVs. Optional: only 3 analytics pages need it |
| Raw Kaggle CSVs (1.2 GB) | too big | only needed to **retrain**. Kaggle dataset `bordanova/2023-us-civil-flights-delay-meteo-and-aircraft`: put `US_flights_2023.csv`, `Cancelled_Diverted_2023.csv`, `weather_meteo_by_airport.csv`, `airports_geolocation.csv` in `data/` |
| Local MongoDB data (`server/.data/`) | local dev DB | starts empty; re-register. Optional: copy the folder while Mongo is stopped |

Committed on purpose (so the app runs right after clone): the trained models, calibrators, encoders, lookups, metrics, SHAP background (`ml-service/artifacts/`, about 4 MB) and `data/external/airports.csv`.

## 6. Mental model (what talks to what)

```
Browser (5173) --Bearer JWT--> Node API (5000) --X-Internal-Key--> ML service (8000)
                                  |-- MongoDB (27017): users, saved searches, prediction logs, cache, quota
                                  |-- AviationStack (flights, quota-limited) and Open-Meteo (weather)
ML service: artifacts/ (models) + optional data/processed parquet via DuckDB. It never calls the internet.
```

- Node is the only component that touches the internet. If AviationStack has no key / hits 90% of its quota / fails, it serves cache, then **demo flights** (`source: "mock"`, UI badge "Demo data").
- If the ML service is down: cached prediction if any, else `503 ML_UNAVAILABLE`. If parquet is missing: analytics routes return 503, predictions still work.
- Every ML-service route needs header `X-Internal-Key`. A key mismatch shows up as "Prediction service is unavailable" in the UI.

## 7. If X happens, do Y (fast decision tree)

| You see | Do this first | Details |
|---|---|---|
| Anything unexplained | `node scripts/doctor.mjs` | prints fixes |
| Setup fails at `pip install` | Is `py -3.11 --version` OK? Delete `ml-service\venv`, re-run setup | TROUBLESHOOTING 3.1 |
| `Missing or invalid env:` (server exits) | `.env` missing or short secrets. Re-run setup or fix `server/.env` | 3.3 |
| Predictions say "service is unavailable" | ML service not running, or keys differ | 3.3 / 3.4 |
| Browser CORS error | `CLIENT_URL=http://localhost:5173` exactly, no trailing slash, restart server | 3.4 |
| `MongooseServerSelectionError` | start MongoDB: `cd server; npm run dev:db` (first start downloads mongod) | 3.2 |
| `EADDRINUSE` | `scripts\start-dev.ps1 -Stop` | 3.2 |
| Insights/History/Risk-map show "unavailable" | no `data/processed` (section 5) | 3.4 |
| Map is blank | CSS/tiles blocked by network or CSP | 3.4 |
| Client tests: `localStorage ... clear` error | already handled by `client/tests/setup.js`; make sure vitest uses it | 3.5 |
| Disk nearly full | delete `data/processed/features`, `ml-service/artifacts_sample`, `.logs`, `dist-data` | 3.6 |
| `feature mismatch` at ML startup | models and code from different versions: `git checkout -- ml-service/artifacts` | 3.4 |
| Docker build/run issue | build the ml-service image from the **repo root** (`-f ml-service/Dockerfile .`) | 3.9 |
| CI red on GitHub | section 8 below | |

## 8. OPEN ISSUE: GitHub CI "Server" job fails intermittently

Facts (from the GitHub API, not guessed):

| CI run (commit) | ML | Client | Server | Docker |
|---|---|---|---|---|
| `f9ea3df` (first push) | pass | pass | **fail** at step `Run npm test` | skipped (needs server) |
| `6ff6bbe` (same code, new author) | pass | pass | **pass** | **pass** (all 3 images built, compose valid) |
| `08a4d7a` (CI hardening) | pass | pass | **fail** at `Run npm test` (the new `Pre-download mongod` step passed) | skipped |

So it is **not** the mongod download, the same code both passes and fails, and the failure appears within about 25 seconds. On the dev PC (Node 26,
Windows) the 87 server tests passed every time. **The real error text was not read** (GitHub job logs need a signed-in browser).

How to diagnose (5 minutes, needs a GitHub login):

1. GitHub > repo > **Actions** > open the red **CI** run > click the **Server (lint + tests)** job > expand **Run npm test**.
2. Look for the first line starting `not ok` (TAP format on Node 20) or `✖`, with its `AssertionError`/stack. Copy it.
3. Reproduce locally with the **same Node major as CI (20)**: `cd server` then `npx -y node@20 --test --test-concurrency=1` (output is TAP on Node 20, not the `ℹ pass` summary). Repeat it 5-10 times; flaky tests show up as occasional `not ok`.

Likely suspects (hypotheses, unproven), in order:

1. **A timing race in a cache test.** `server/src/services/cacheService.js` single-flight logic plus the test `concurrent identical misses share one upstream call` (`server/tests/flight.test.js`): a request whose DB read resolves just after the first request finished can miss both the cache doc and the in-flight entry and call upstream a second time. Fix idea: after `await pending` re-check, or look up the cache doc inside the shared promise.
2. **Slow 2-vCPU runner vs timing-sensitive assertions** (TTL checks within +-2 s, `latencyMs`, rate-limit window tests).
3. **Node 20 vs 26 behaviour differences** (test runner, `fetch`/streams, `closeAllConnections`).
4. **Runner image changes** (`ubuntu-latest` moved to Ubuntu 26 in Oct 2026; CI is now pinned to `ubuntu-24.04`).

After the fix, push and confirm **5 green runs in a row** (re-run the workflow from the Actions page) before trusting it.

## 9. Lessons learned (real problems hit during the build)

1. **Python must be 3.11.** 3.14 may lack wheels for XGBoost/SHAP/pyarrow; the model files are pickles of pinned versions (`xgboost==3.2.0`, `scikit-learn==1.9.1`).
2. **DuckDB 2.x removed `relation.fetchone()`**: use `con.execute(sql).fetchone()`. Keep `duckdb==2.0.0` pinned.
3. **Big single-pass SQL runs out of memory on 8 GB**: everything is processed month by month with a memory cap.
4. **The aircraft columns leak the cancel label** (they are empty exactly for cancelled flights). They are deliberately NOT features.
5. **`month` is not a feature**: training covers Jan-Aug, so Oct-Dec values are unseen.
6. **`Date.parse('2026-02-30')` silently rolls over**: dates are validated by round-tripping the calendar parts.
7. **CSS grid children need `min-w-0`**, or content widens the page (the live page overflowed on phones).
8. **Node 25/26 has a global `localStorage` that shadows jsdom's**: tests install an in-memory Storage.
9. **TTL index vs stale-if-error**: `liveFlightCache` has `freshUntil` (logical) and `expiresAt` (physical, later) so expired entries survive for fallback.
10. **ML key mismatch looks like an outage** (ML answers 403, server maps it to 503).
11. **CSP**: the only inline script (no-flash theme) is allowed by SHA-256 hash in `client/nginx.conf` and `client/vercel.json`; `client/tests/csp.test.js` fails if they drift.
12. **Shell scripts need LF endings** or the container fails with `no such file or directory` (`.gitattributes` + the Dockerfile strip `\r`).
13. **PowerShell here-strings, quoting and `&&`** behave differently from bash; use the provided `.ps1` scripts.
14. **Windows credential cache can pin the wrong GitHub account** (section 4).

## 10. Rules for changing things safely

- The 12 **locked decisions** are in `docs/CONTEXT.md` section 4 (single JWT, XGBoost-only serving, frequency encoding, time-based split, cache TTLs, and so on). Changing one means updating that table and the impact map in section 16 of the same file.
- **Never hand-edit** `ml-service/artifacts/models/manifest.json` or the feature list. Retrain (`docs/ml-methodology.md` section 8) so models, lookups, manifest and `feature_builder.FEATURE_COLUMNS` stay consistent. A test and a startup check enforce this.
- Before every push run all three suites and the linters:
  ```powershell
  cd ml-service; venv\Scripts\python -m pytest -q            # 49
  cd ..\server;  npm run lint; npm test                       # 87
  cd ..\client;  npm run lint; npm test; npm run build        # 67
  ```
- Keep secrets out of git. After editing `client/index.html`'s inline script, update the CSP hash (the failing test prints the expected value).
- Add new decisions, fixes and deviations to `docs/CONTEXT.md` (section 15) so the next person is not guessing.

## 11. Paste this into any AI assistant when asking for help

> I am working on the repository `bhikadiyaom/flight-delay-prediction` (React + Node/Express + Python FastAPI + MongoDB, XGBoost model).
> Please first read `START-HERE.md`, then `docs/TROUBLESHOOTING.md` and `docs/CONTEXT.md` in the repo. Environment: Windows, Python 3.11, Node <version>.
> What I ran: `<command>`. What I expected: `<...>`. What happened (last 30 lines, secrets removed): `<paste>`. Output of `node scripts/doctor.mjs`: `<paste>`.
> Do not suggest changing the locked decisions in CONTEXT.md section 4 without telling me the trade-off.

Never paste `.env` contents, `JWT_SECRET`, `ML_INTERNAL_KEY`, `AVIATIONSTACK_KEY`, a `MONGODB_URI` with a password, or a GitHub token into any chat or issue.

## 12. File map

```
START-HERE.md            this file                    README.md          overview + results + quick start
client/                  React app (src/, tests/, nginx.conf, vercel.json, Dockerfile)
server/                  Express API (src/, tests/, scripts/e2e-smoke.ps1, render.yaml, Dockerfile)
ml-service/              app/ (FastAPI), training/ (pipeline), notebooks/, artifacts/ (committed models), tests/, Dockerfile
data/                    raw CSVs and processed parquet (git-ignored), external/ (committed)
docs/                    architecture, api-spec, db-schema, ml-methodology, setup-guide, deployment-guide,
                         TROUBLESHOOTING, CONTEXT (decisions + build log), team-contributions, project-report/
scripts/                 setup.ps1/.sh, start-dev.ps1, doctor.mjs, pack-data.py
.github/workflows/       ci.yml (3 test suites + image builds), deploy.yml (skips without secrets)
docker-compose.yml       whole stack in containers (needs .env from .env.example)
```
