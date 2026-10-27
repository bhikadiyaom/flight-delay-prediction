# Setup guide

Fastest path: run the setup script, then the start script. Something fails? Run `node scripts/doctor.mjs` and see
[TROUBLESHOOTING.md](TROUBLESHOOTING.md).

## 1. Prerequisites

| Tool | Version | Windows install |
|---|---|---|
| Node.js | 20 LTS or newer | `winget install OpenJS.NodeJS.LTS` |
| **Python** | **3.11** (not 3.12+) | `winget install -e --id Python.Python.3.11` |
| Git | any | `winget install Git.Git` |
| Docker | optional | only for `docker compose up` |

Open a **new** terminal after installing so PATH is refreshed, then check `node --version` and `py -3.11 --version`.
About 4 GB of free disk and 8 GB of RAM are comfortable (serving needs far less).

## 2. One-shot setup

```powershell
git clone <repo-url> "New project"
cd "New project"
powershell -ExecutionPolicy Bypass -File scripts\setup.ps1        # macOS/Linux: bash scripts/setup.sh
```

It creates `ml-service/venv` (Python 3.11) with the pinned requirements, runs `npm ci` in `server` and `client`, writes the three
`.env` files with **generated secrets** (the server and ML service share one key), and runs the doctor.
Flags: `-WithTraining` (also installs torch/jupyter, +1 GB), `-SkipNpm`.

## 3. Run it

```powershell
powershell -ExecutionPolicy Bypass -File scripts\start-dev.ps1     # MongoDB, ML service, API, client
# open http://localhost:5173      stop: scripts\start-dev.ps1 -Stop      logs: .logs\
```

The first MongoDB start downloads a `mongod` binary (about 100-300 MB). Or run the four pieces yourself:

| Terminal | Command | Port |
|---|---|---|
| 1 | `cd server` then `npm run dev:db` | 27017 |
| 2 | `cd ml-service` then `venv\Scripts\python -m uvicorn app.main:app --port 8000` | 8000 |
| 3 | `cd server` then `npm run dev` | 5000 |
| 4 | `cd client` then `npm run dev` | 5173 |

With no further configuration you get: manual and live prediction (built-in demo flights + real Open-Meteo weather), saved searches, bulk CSV, the admin panel (register with an email in `ADMIN_EMAILS`).

## 4. Optional: historical analytics data

The Insights, History and Risk-map pages read `data/processed/flights/flights_01..12.parquet` (145 MB, not in git). Either:

- **copy** `data/processed/` from another machine (or unpack a file made by `python scripts/pack-data.py`), or
- **rebuild** it: download the Kaggle dataset `bordanova/2023-us-civil-flights-delay-meteo-and-aircraft` into `data/`
  (`US_flights_2023.csv`, `Cancelled_Diverted_2023.csv`, `weather_meteo_by_airport.csv`, `airports_geolocation.csv`), then
  `cd ml-service` and `venv\Scripts\python -m training.data_cleaning --to-parquet` (about 90 s).

Without it everything except those three pages works, and they show a clear "unavailable" message.

## 5. Optional: real flight data

Create a free key at <https://aviationstack.com> (about 100 requests/month, http only) and put it in `server/.env` as `AVIATIONSTACK_KEY=`.
The server stops calling the API at 90% of `AVIATIONSTACK_MONTHLY_LIMIT` and serves cache/demo data, so you cannot get a surprise bill or ban.

## 6. Tests and checks

```powershell
cd ml-service; venv\Scripts\python -m pytest -q      # 49 tests (analytics tests skip without the parquet)
cd server;     npm test                              # 87 tests, real in-memory MongoDB, no keys needed
cd client;     npm test                              # 67 tests
cd server; npm run lint; cd ..\client; npm run lint; npm run build
```

Live walk through the running stack: set `$env:ADMIN_EMAILS="e2e-admin@example.com"` before starting the server, then
`powershell -File server\scripts\e2e-smoke.ps1`.

## 7. Retraining (optional)

Needs `-WithTraining`, the raw CSVs, and about 3 GB of free RAM. Full order and flags are in [ml-methodology.md](ml-methodology.md) section 8.
`--sample 0.15` runs any step on a sample into `ml-service/artifacts_sample/` without touching the real models.

## 8. Docker

```powershell
copy .env.example .env     # fill JWT_SECRET (32+ chars) and ML_INTERNAL_KEY (16+ chars)
docker compose up --build  # http://localhost:8080  (API on :5000)
```

Compose starts MongoDB, the ML service (not published, internal), the API and the nginx client. `./data/processed` is mounted into the ML
service for the analytics pages.

## 9. Configuration reference

| File | Key variables |
|---|---|
| `server/.env` | `MONGODB_URI`, `JWT_SECRET` (32+), `ML_INTERNAL_KEY` (16+, = ML service key), `ML_SERVICE_URL`, `CLIENT_URL` (exact origin, no trailing slash), `AVIATIONSTACK_KEY`, `ADMIN_EMAILS`, `RATE_LIMIT_*`, `SMTP_*`, `ALERTS_ENABLED`, `ALERTS_CRON` |
| `ml-service/.env` | `INTERNAL_API_KEY` (= server `ML_INTERNAL_KEY`), `ARTIFACTS_DIR`, `PARQUET_DIR`, `DUCKDB_MEMORY_LIMIT`, `DUCKDB_THREADS`, `LOG_LEVEL` |
| `client/.env` | `VITE_API_URL` (baked in at build time) |
| root `.env` | only for docker compose (see `.env.example`) |

Every variable is documented in the matching `.env.example`.
