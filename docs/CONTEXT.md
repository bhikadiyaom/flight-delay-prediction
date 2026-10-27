# PROJECT CONTEXT: Flight Delay & Cancellation Prediction (Sem 7 Capstone)

> Paste this whole file into a new chat and say: "Continue the build from section 14 (Build status)."
> Last updated: 2026-10-27. Update sections 14 and 17 whenever something changes.

## 1. Summary
Predict (a) whether a US flight will be delayed or cancelled and (b) the delay duration in minutes, using the Kaggle dataset
"2023 US civil flights delay, meteo and aircraft" (bordanova/2023-us-civil-flights-delay-meteo-and-aircraft, weather pre-merged,
saved as `data/flights_2023.csv`). Live predictions use AviationStack (flight status) and Open-Meteo (weather).
Served through a responsive web app with auth, saved searches, EDA dashboard, model comparison and an admin panel.

## 2. Team and ownership
| Member | Role | Owns |
|---|---|---|
| A | Data/ML Lead | `ml-service/training/`, `notebooks/`, `artifacts/` |
| B | ML Service Engineer | `ml-service/app/` (FastAPI, serving, DuckDB analytics) |
| C | Backend Engineer | `server/` (Express, Mongo, auth, live-API orchestration, caching) |
| D | Frontend Engineer | `client/` (React, theme, charts) |

## 3. Stack and deployment
- Client: React 18 + Vite + Tailwind **v3.4 (pinned)**, react-router v6, TanStack Query v5, Recharts, react-leaflet (OSM tiles), lucide-react, axios. Deploy: Vercel (needs SPA rewrite in `vercel.json`).
- Server: Node 20 + Express 4, Mongoose 8, JWT, bcryptjs, helmet, zod, express-rate-limit, multer + csv-parse, node-cron, nodemailer. ESM (`"type":"module"`). Deploy: Render.
- ML service: Python 3.11 + FastAPI, pandas, pyarrow, DuckDB, scikit-learn, XGBoost, SHAP, joblib. Deploy: Render or HF Spaces.
- DB: MongoDB Atlas free tier (512 MB; app data only).

## 4. LOCKED DECISIONS (do not silently change; see section 16 for how to change)
| # | Decision | Chosen | Why / trade-off |
|---|---|---|---|
| 1 | Historical data storage | Parquet + DuckDB in ml-service (search + EDA). EDA aggregates cached in Mongo `LiveFlightCache` kind `analytics`, 24h TTL | Dataset too big for Atlas free tier |
| 2 | Auth | **Single JWT in `Authorization: Bearer`, stored in localStorage, 12h expiry.** No refresh tokens, no `/auth/refresh`, no `/auth/logout` (logout = delete token client-side) | Simple; avoids cross-site cookie issues. Risk: XSS can read the token, so use helmet+CSP, no `dangerouslySetInnerHTML`, validate all input |
| 3 | Live API caching | Mongo TTL cache. Flight 5 min, weather 30 min, prediction 10 min. Stale-if-error (serve expired entry before mock). Monthly AviationStack quota counter (`ApiQuota`), stop at ~90%. Mock fallback `server/src/data/mockFlights.json`. Responses carry `source: "live"|"cache"|"mock"`, UI shows "demo data" badge. Cache keys normalized (`AA100` = `aa 100`) | Free tier ~100 req/month |
| 4 | Target | Two-stage: `is_cancelled` own flag; `is_delayed` = arrival delay >= 15 min on non-cancelled flights; `delay_minutes` only on delayed flights. **Diverted flights excluded** | Matches separate classifier/regressor |
| 5 | Split | Time-based: train Jan-Sep, test Oct-Dec, validation = September (end of train) for tuning and calibration. Report a random-split score too, and explain the gap | Honest, no leakage from future |
| 6 | Encoding | **Frequency encoding only** for airline, airport, route (no target encoding). Rolling delay history computed on train only and shipped as lookup tables in `artifacts/lookups/` | No label leakage, simple `encoders.py` |
| 7 | Served models | **XGBoost only** (delay clf, cancel clf, delay regressor). LogReg/RF/NN are metrics-only; `/models/compare` reads `model_metrics.json`. Torch only in `requirements-dev.txt` | Render 512 MB RAM |
| 8 | Live data fetching | Node fetches + caches flight and weather, sends a full payload to ml-service. ml-service is a pure function (features in, prediction out). `live_weather_client.py` deleted | One cache, easy testing |
| 9 | Calibration | Class weights during training, then **isotonic calibration on the validation slice**. Report calibration curve + Brier score | Gauge shows real probabilities |
| 10 | Data fetching (client) | TanStack Query. defaults: staleTime 5 min, retry 1, refetchOnWindowFocus false | Cache, retries, quota protection |
| 11 | Charts | Recharts; map = react-leaflet + OpenStreetMap | Easy dark-mode theming |
| 12 | Tailwind | v3.4 pinned, `darkMode: 'class'` | Most documented |

Open question left to the team: should `/predict` and `/live` pages require login? Current default: **public** (rate-limited); `/saved`, `/bulk`, `/profile` protected; `/admin` admin-only.

## 5. Architecture and data flow
```
Browser (React) --Bearer JWT--> Express (Node) --X-Internal-Key--> FastAPI (ml-service)
                                   |  |                              |-- XGBoost + SHAP
                                   |  |-- AviationStack, Open-Meteo  |-- DuckDB over data/processed/*.parquet
                                   |-- MongoDB Atlas (users, searches, logs, cache, metrics, quota)
```
Live prediction: client -> `POST /api/v1/predictions/live` -> Node checks cache -> AviationStack (or stale/mock) + Open-Meteo for origin and dest -> builds payload -> ml-service `/predict` -> Node logs to `PredictionLog` -> response `{prediction, flight, weather, source}`.

## 6. Folder structure
The full tree is created by `bootstrap.py` (every file at its final path; all empty except the seeded ones).
Top level: `/client`, `/server`, `/ml-service`, `/data`, `/docs`, plus `.github/workflows`, `docker-compose.yml`, `.env.example`, `.gitignore`, `README.md`.
Changes vs the original tree (already in `bootstrap.py`):
- REMOVED `ml-service/app/services/live_weather_client.py`
- ADDED `ml-service/app/security.py`, `app/services/duckdb_service.py`, `training/calibrate.py`, `artifacts/lookups/`, `artifacts/models/manifest.json`
- ADDED `server/src/data/mockFlights.json`, `server/src/models/ApiQuota.js`
- ADDED `client/src/lib/queryClient.js`
- Naming: kebab-case folders, PascalCase React components, camelCase JS, snake_case Python.

## 7. MongoDB schemas (final)
- **User**: name, email (unique, lowercase), passwordHash (select:false), role ('user'|'admin'), preferences{theme('light'|'dark'|'system'), alertsEnabled}, lastLoginAt. timestamps. (NO refreshTokens)
- **SavedSearch**: user(ref, index), type('route'|'flight'|'airport'), label, origin, destination, airline, flightNumber, isFavorite, alert{enabled, threshold(0.5), lastRiskLevel, lastNotifiedAt}. Index {user,type}.
- **PredictionLog**: user(nullable), source('manual'|'live'|'bulk'), input(Mixed), output{delayProbability, cancelProbability, predictedDelayMinutes, riskLevel, modelVersion}, actual{wasDelayed, delayMinutes, resolvedAt}, latencyMs. Index createdAt -1, output.modelVersion.
- **LiveFlightCache**: key(unique), kind('flight'|'weather'|'prediction'|**'analytics'**), payload(Mixed), fetchedAt, expiresAt (TTL index expireAfterSeconds 0).
- **ModelMetricSnapshot**: modelName('logreg'|'random_forest'|'xgboost'|'neural_net'), task('classifier'|'regressor'), version, isProduction, metrics{accuracy, precision, recall, f1, rocAuc, mae, rmse}, perClass, confusionMatrix, trainedAt.
- **ApiQuota**: provider ('aviationstack'), month ('YYYY-MM'), used, limit.

## 8. Express routes (base `/api/v1`)  (P=public, A=auth, X=admin)
| Method | Route | Access | Purpose |
|---|---|---|---|
| POST | /auth/register | P | create account |
| POST | /auth/login | P | returns `{token, user}` |
| GET | /users/me | A | profile |
| PATCH | /users/me | A | name, theme, alert prefs |
| GET | /flights/live?flight=AA100 | P | live status + weather (cached) |
| GET | /flights/live/route?origin=&destination= | P | upcoming flights on route |
| GET | /flights/historical?origin=&dest=&date=&airline= | P | proxied to ml-service |
| GET | /flights/airports | P | autocomplete list |
| POST | /predictions | P* | manual prediction (logged) |
| POST | /predictions/live | P* | fetch live data + predict + SHAP |
| POST | /predictions/bulk | A | CSV upload, batch (max 500 rows) |
| GET | /predictions/history | A | user's past predictions |
| GET | /analytics/overview | P | EDA aggregates |
| GET | /analytics/trends | P | time series |
| GET | /analytics/risk-map | P | per-airport delay rate |
| GET | /analytics/models/compare | P | model comparison (proxied) |
| GET/POST/PATCH/DELETE | /saved-searches[/:id] | A | CRUD, favorite, alert |
| GET | /admin/metrics, /admin/predictions, /admin/stats | X | monitoring |
| POST | /admin/metrics/refresh | X | pull metrics from ml-service into Mongo |
| GET | /health | P | service health incl. ml-service reachability |
*Rate-limited; logged-in users get a higher limit.

## 9. ML pipeline spec
1. One-time: `python -m training.data_cleaning --to-parquet` converts CSV -> parquet (downcast dtypes). Never `pd.read_csv` the full file in notebooks; use DuckDB or a sample.
2. First cell of notebook 01 prints `df.columns`; **map real column names into `training/config.py`** (names were NOT verified at design time).
3. Column groups in config: identifiers, route, scheduled times, **leakage list** (actual times, taxi, air time, elapsed), outcomes, delay-cause columns, weather, aircraft.
4. Cleaning: drop duplicates and impossible values; exclude diverted; weather nulls -> airport-month median + `weather_missing` flag; delay-cause nulls -> 0 for EDA only, excluded from modeling; regressor target winsorized at p99 (classifier keeps outliers).
5. Leakage rule: if it is not known before departure, it cannot be a feature (drop post-departure columns and delay-cause columns).
6. Features: hour bucket, day of week, month, holiday flag, route congestion (flights/route/day), carrier & airport rolling delay history (train-only lookup tables), weather severity index (coarse bands: precipitation, wind, visibility, snow, so observed training weather and Open-Meteo forecasts are comparable), distance, frequency-encoded airline/origin/dest/route.
7. Imbalance: class weights (`scale_pos_weight`) primary; SMOTE optional in notebook 04 for comparison only.
8. Models: LogReg (baseline), RandomForest, XGBoost (production), small feed-forward NN (PyTorch, offline). Two binary classifiers (delay, cancel) + XGBoost regressor on delayed flights only.
9. Metrics: accuracy, precision/recall/F1 per class, ROC-AUC, confusion matrix, Brier score + calibration curve; regressor MAE/RMSE. SHAP via `TreeExplainer(xgb_delay_clf)`.
10. Artifacts written to `ml-service/artifacts/`: `models/*.joblib`, `models/manifest.json` (version, exact feature order, production flags, threshold), `encoders/`, `lookups/`, `metrics/model_metrics.json`.
11. Train/serve skew defense: `feature_builder.py` is shared by training and serving and validates against `manifest.json`; mismatch must fail loudly.

## 10. FastAPI contract (all routes require header `X-Internal-Key`)
Endpoints: `POST /predict`, `POST /predict/batch` (<=500, no SHAP), `GET /models/compare`, `GET /models/production`, `GET /analytics/overview|historical|risk-map|trends`, `GET /health`.
Startup (lifespan): read manifest -> load models, calibrators, encoders, lookups -> build SHAP explainer once -> load metrics -> attach to `app.state`; fail fast if anything is missing.
Request/response:
```python
class WeatherInput(BaseModel):
    temperature_c: float | None = None; precipitation_mm: float | None = None
    wind_speed_kmh: float | None = None; visibility_km: float | None = None; snowfall_cm: float | None = None
class PredictRequest(BaseModel):
    airline: str; origin: str; destination: str; flight_number: str | None = None
    scheduled_departure: datetime; distance_miles: float | None = None
    origin_weather: WeatherInput | None = None; dest_weather: WeatherInput | None = None
class Explanation(BaseModel):
    feature: str; value: str; shap_value: float
    direction: Literal["increases_delay_risk", "decreases_delay_risk"]
class PredictResponse(BaseModel):
    delay_probability: float; cancel_probability: float
    predicted_delay_minutes: float | None   # null when delay_p < threshold
    risk_level: Literal["low", "medium", "high"]
    top_factors: list[Explanation]          # top 5
    model_version: str; warnings: list[str] = []
```
Rules: missing weather -> airport-month median + a `warnings` entry (never a 500). Regressor runs only if delay_p >= threshold.

## 11. Client design
Providers order: `QueryClientProvider > ThemeProvider > BrowserRouter > AuthProvider > App`.
Theme: class-based; preference `'light'|'dark'|'system'` in localStorage key `fdp-theme`; toggle cycles light -> dark -> system; blocking inline script in `index.html` prevents flash of wrong theme; `ThemeContext` listens to `prefers-color-scheme` only while preference is `system`; charts use `resolved` theme via `chartTheme(resolved)` because Recharts ignores Tailwind `dark:`; on login adopt `user.preferences.theme`, on change `PATCH /users/me`.
Inline script for `index.html` `<head>`:
```html
<script>
(function(){try{var p=localStorage.getItem('fdp-theme')||'system';
var d=p==='dark'||(p==='system'&&window.matchMedia('(prefers-color-scheme: dark)').matches);
if(d)document.documentElement.classList.add('dark');}catch(e){}})();
</script>
```
Auth: `axiosClient` baseURL = `VITE_API_URL + '/api/v1'`; request interceptor adds Bearer token; 401 response clears token and dispatches `auth:expired`; `AuthContext` exposes `{user, token, login, register, logout, isAdmin, loading}` and rehydrates via `GET /users/me`; `ProtectedRoute` waits for `loading` before redirecting (use `<Navigate state={{from}}>`).
Routes (lazy-loaded): `/` Landing, `/login`, `/register`, `/eda`, `/predict`, `/live`, `/historical`, `/models`, `/risk-map`, `/saved`*, `/bulk`*, `/profile`*, `/admin`**, `*` NotFound. (* protected, ** admin)
`vercel.json`: rewrite `/(.*)` -> `/index.html`. Tailwind config: `darkMode:'class'`, content `./index.html, ./src/**/*.{js,jsx}`, colors `brand`, `risk.{low,medium,high}`.

## 12. Environment variables
Root/server `.env`: `PORT=5000`, `NODE_ENV`, `MONGODB_URI`, `JWT_SECRET` (>=32 chars), `JWT_EXPIRES_IN=12h`, `CLIENT_URL` (CORS allowlist, comma-separated), `ML_SERVICE_URL=http://localhost:8000`, `ML_INTERNAL_KEY`, `AVIATIONSTACK_KEY`, `AVIATIONSTACK_MONTHLY_LIMIT=100`, `ADMIN_EMAILS` (comma-separated; these emails get role admin on register), SMTP vars for alerts.
ml-service `.env`: `INTERNAL_API_KEY` (must equal server `ML_INTERNAL_KEY`), `ARTIFACTS_DIR=./artifacts`, `PARQUET_DIR=../data/processed`.
client `.env`: `VITE_API_URL=http://localhost:5000`.

## 13. Stretch features chosen (pick 3-5; tick when done)
[ ] SHAP in UI (cheap: backend already returns top_factors)  [ ] Probability gauge  [ ] Risk map  [ ] Delay-cause chart  [ ] Historical trends  [ ] CSV bulk upload  [ ] Email alerts  [ ] PWA  [ ] NL chatbot
Recommended low-effort set: SHAP + gauge + risk map + delay-cause + trends.

## 14. BUILD STATUS (update as you go)
- [x] Step 1 folder structure   [x] Step 2 decisions 1-12 locked   [ ] `bootstrap.py` run (not on disk; scaffold is rebuilt by hand in Phase 1)
- NOTE (2026-10-27): earlier checkmarks described code written in a chat that never existed on disk. Everything below is treated as unbuilt until verified.
- [x] Server foundation (group C): env, db, cors, app, server, utils, errorHandler, auth/role middleware, validators, 6 models, auth + user controllers/routes, /health
- [x] Server services/routes (group C): cacheService, aviationStackService (+quota, mock), openMeteoService, airportDirectory, mlClientService, predictionService, historicalQueryService, flight/prediction/analytics/savedSearch/admin controllers+routes, rateLimiter, CSV upload, alertService, riskAlertJob; 87 tests pass, lint clean, live stack smoke-tested end to end (see 15e)
- [x] Phase 1 monorepo scaffold (empty files except seeded configs); ml-service venv on Python 3.11
- [x] Phase 2 dataset: `training/config.py` real column map + `training/data_cleaning.py --to-parquet` run OK (see 15b)
- [x] ML training (group A): config, data_cleaning, feature_engineering, encoders, trainers x4, regressor, calibrate, evaluate, compare_models, shap background, shared feature_builder/holidays/weather_severity, 7 notebooks; `tests/test_feature_builder.py` passes (6). See 15c.
- [x] ML serving (group B): config, security, main (lifespan), schemas, model_loader, feature_builder, weather_severity, predictor, explainer, metrics_service, duckdb_service, airport_lookup, 4 routers; 49 tests pass; service started and every route hit live. See 15d.
- [ ] Client: theme, auth, axios, queryClient, routes, layouts, common components, pages, charts, map
- [ ] Docker + docker-compose + CI + deploy configs
- [ ] Docs (architecture, api-spec, ml-methodology, report)
Suggested next order: ML training (longest lead time, everything else depends on artifacts) -> ML serving -> remaining server -> client.

## 15. TROUBLESHOOTING
| Symptom | Likely cause | Fix |
|---|---|---|
| Server exits at start with "Missing env" | `.env` not created | copy `.env.example` to `.env` and fill it |
| `MongooseServerSelectionError` | Atlas IP allowlist / wrong URI | allow 0.0.0.0/0 (dev) or your IP; URL-encode password |
| CORS error in browser | origin not in `CLIENT_URL` | add exact origin (no trailing slash), restart server |
| 401 on every request | token missing/expired or `JWT_SECRET` changed | log in again; check Authorization header |
| ml-service returns 403 | `X-Internal-Key` mismatch | same value in server `ML_INTERNAL_KEY` and ml `INTERNAL_API_KEY` |
| `/predict` 500 "feature mismatch" | manifest feature order differs from builder | retrain or regenerate manifest; never hand-edit feature lists |
| Notebook kernel dies loading CSV | full CSV in pandas | convert to parquet, query with DuckDB, or sample |
| Test accuracy far lower than validation | time-split distribution shift (season) | expected; explain; do not switch to random split to hide it |
| Probabilities look too high | class weights without calibration | run `calibrate.py` (Decision 9) |
| Flash of wrong theme on reload | inline script missing from `index.html` | add script in `<head>` before the bundle |
| Refresh on `/eda` is 404 on Vercel | no SPA rewrite | add `vercel.json` rewrite |
| Live flight endpoint returns mock data | AviationStack quota hit or key missing | check `ApiQuota`, key, `source` field |
| Render ml-service OOM | too many models/artifacts loaded | keep XGBoost only (Decision 7) |
| SHAP slow | explainer rebuilt per request | build once in lifespan |
| Leaflet icons missing / map blank | CSS or default icon path | `import 'leaflet/dist/leaflet.css'`; give the map container a fixed height |

### 15b. Dataset reality vs original design (verified 2026-10-27, confirmed by user)
Files in `data/`: `US_flights_2023.csv` (main, 6,743,404 non-cancelled non-diverted rows), `Cancelled_Diverted_2023.csv` (87,936 cancelled + 16,552 diverted), `weather_meteo_by_airport.csv` (DAILY weather: tavg,tmin,tmax,prcp,snow,wdir,wspd,pres), `airports_geolocation.csv`. `maj us flight - january 2024.csv` is ignored (misleading name, header identical to main).
Deviations from sections 9/10 (none touch section 4):
- No visibility column, so `visibility_km` stays in the API as optional but is NOT a model feature. Weather is daily, not hourly.
- No scheduled clock time or flight number: time feature = `DepTime_label` (Night/Morning/Afternoon/Evening). `/predict` maps `scheduled_departure.hour` to a label.
- No distance in miles: computed by haversine from airport coordinates (`distance_miles`).
- Leakage (never features): Dep_Delay, Dep_Delay_Tag, Dep_Delay_Type, Arr_Delay_Type, Flight_Duration, Delay_* causes. Tail_Number is an identifier, not a feature.
- Aircraft columns (Manufacturer, Model, Aicraft_age [sic]) exist only for non-cancelled flights, so they would leak the cancel label (NULL <=> cancelled). CORRECTION to the earlier plan: they are NOT features (also `PredictRequest` cannot supply them).
- Cancelled rows have no distinguishing columns, so exact-duplicate removal dropped 945 of them (about 1%); 43 other rows dropped as invalid. Final: 6,830,352 flights, 86,991 cancelled, 1,386,688 with arr_delay >= 15.
- Delay rate by month: about 22% Jan-Sep (peak 28.6% Jul), about 14-16% Oct-Dec. Expect a test-vs-validation shift (see section 15 row on time-split).
- Parquet is month-partitioned: `data/processed/flights/flights_MM.parquet` (glob in `training/config.py`), built month-by-month in DuckDB with a 1.5 GB memory cap because the dev machine has ~8 GB RAM and ~3.5 GB free disk.
- DuckDB 2.x: relations have no `.fetchone()`; use `con.execute(...).fetchone()`.

### 15c. ML pipeline as built (Phase 3A, 2026-10-27)
Features (33, exact order in `app/services/feature_builder.py::FEATURE_COLUMNS` and `manifest.json`): time-of-day idx, weekday, weekend, holiday flag + distance to nearest US federal holiday (rule based, any year), distance_miles, frequency-encoded airline/origin/dest/route, avg daily flights per route/origin (congestion), 28-day rolling delay + cancel rate for airline/origin/dest, smoothed static route delay rate and origin x time-of-day delay rate, weather bands (precip, snow, wind, freeze flag, severity) for origin and destination + mean temp, `weather_missing`.
Deviations / choices (none change section 4):
- **History features (Decision 6 "rolling history, train only")**: every lookup is fitted on Jan-Aug only (September stays unseen). Rolling rates use PRIOR days only (28-day window, shrinkage k=50 to the train prior). Jan-Sep rows use the true rolling value; Oct-Dec test rows and all serving use the shipped snapshot `lookups/rolling_snapshot.json` taken on 2023-10-01 (what a deployed model without a daily refresh sees, so it is deliberately a bit stale; mean test rolling delay rate 0.188 vs actual 0.147). A daily refresh job is the obvious production improvement.
- **`month` is not a feature**: training covers Jan-Aug so Oct-Dec values are unseen and cannot be extrapolated; ablation showed neutral for delay and +0.02 validation AUC for cancel without it.
- Hour -> label mapping used at serving: Night 00-05, Morning 06-11, Afternoon 12-17, Evening 18-23 (matches the label shares in the data).
- Cancel classifier: shallower trees + AUC stopping (the first run with aucpr stopped at iteration 0). Cancel base rate falls from 1.6% (train) to 0.3% (test), so precision is low by construction; probabilities are still calibrated (Brier 0.0031).
- Regressor: absolute-error objective on the p99-winsorized target (cap 484 min), predictions clipped to >= 15. A log-transform variant lost to the median baseline. The signal is weak without departure information (R2 slightly negative on the heavy tail, MAE 35.9 vs 36.5 for the median baseline): the UI should present it as "typical delay if delayed".
- Models are time-split honest: fit on Jan-Aug (4.46M delay rows), early stop + isotonic on September, tested on Oct-Dec (1.73M rows). Random-split XGBoost (not deployable) AUC 0.745 vs 0.661 time split: the gap is seasonality/weather-episode leakage plus the Oct-Dec base-rate drop.
- Test results, delay task (Oct-Dec): logreg AUC 0.646 / F1 0.317; random forest (300k rows) 0.657 / 0.325; **xgboost 0.661 / 0.330 (production, Brier 0.124 calibrated vs 0.201 raw)**; neural net 0.651 / 0.321. Cancel xgboost AUC 0.706. All models cluster within 0.015 AUC: the limit is information (no clock time, no departure state), not model class.
- Artifacts (models, calibrators, encoders, lookups, metrics, SHAP background) are COMMITTED (small) so the ml-service image can be built from the repo; raw/processed data and `artifacts_sample/` are not.
- Run order: `python -m training.data_cleaning --to-parquet` -> `training.feature_engineering` -> `train_xgboost` -> `train_regressor` -> `train_baseline` -> `train_random_forest` -> `train_neural_net` -> `train_xgboost --random-split` -> `generate_shap_background` -> `compare_models`. Use `--sample 0.15` on any trainer for a proving run (writes to `artifacts_sample/`). Always run from `ml-service/` (set `PYTHONPATH=.` for ad-hoc scripts).

### 15d. ML serving as built (Phase 3B)
- Run: `cd ml-service; venv\Scripts\python -m uvicorn app.main:app --port 8000`. `.env` holds a generated `INTERNAL_API_KEY` (git-ignored); the server's `ML_INTERNAL_KEY` must equal it (group C copies it).
- Contract additions (backward compatible): `WeatherInput.temperature_min_c` (optional, freeze flag; else min = mean - 5.1 C), `POST /predict/batch` body is `{"items": [...]}` (1-500) and returns `{"results": [...], "model_version"}`. `visibility_km` is accepted but ignored (no visibility in the dataset). Weather units are DAILY: C, mm/day, km/h, snowfall cm/day. Airline accepts IATA code, short name or exact training name (`resolve_airline`).
- Extra routes: `GET /analytics/airports`, `GET /analytics/airlines` (autocomplete lists; airports come from committed `data/external/airports.csv`, so serving does not need the parquet). `GET /analytics/historical` needs `origin` or `dest` (422 otherwise) and takes `dest` (not `destination`), optional `date`, `airline`, `limit` <= 500. `GET /analytics/trends?granularity=day|week|month&origin=&airline=`; `GET /analytics/risk-map?min_flights=3000`.
- `/health` also requires the key (contract: all routes). Render/Docker health checks must send `X-Internal-Key`, or probe the Node `/health` instead.
- Startup fails fast: missing artifact, empty manifest, feature-list mismatch, model/feature count mismatch, metrics version != manifest version. Missing flights parquet does NOT fail startup: `analytics_available=false`, `/analytics/{overview,historical,risk-map,trends}` answer 503 (ship the 145 MB parquet or mount it for full functionality; see deployment guide).
- Observed: first `/predict` 95 ms (SHAP ~7 ms), batch of 500 in 118 ms, cold overview 1.6 s then 47 ms cached; RSS about 300 MB serving, peak 629 MB during a cold analytics scan with the default 1GB DuckDB limit. On a 512 MB host set `DUCKDB_MEMORY_LIMIT=300MB`.
- Tests: `cd ml-service; set PYTHONPATH=.; venv\Scripts\python -m pytest tests -q` -> 49 pass (auth on every route, contract rules, warnings, batch == single, 500 limit, SQL-injection style inputs, SHAP additivity, fail-fast loading).

### 15e. Node server as built (Phase 3C)
Run: `cd server; npm run dev:db` (real mongod via mongodb-memory-server, data in `server/.data/mongo`, no install needed) -> `npm run dev`. Tests: `npm test` (87 pass; real in-memory MongoDB + stub servers for ml-service / AviationStack / Open-Meteo). `scripts/e2e-smoke.ps1` walks the live stack. `server/.env` is git-ignored and holds a generated `JWT_SECRET` plus the ml-service key as `ML_INTERNAL_KEY`.
Deviations / choices (none change section 4):
- **API JSON is camelCase** (`delayProbability`, `topFactors[].shapValue`, `scheduledDeparture`, weather `temperatureC/precipitationMm/windSpeedKmh/snowfallCm`); `mlClientService` converts to/from the ml-service's snake_case. Historical query uses `dest` as in section 8.
- **`LiveFlightCache` has two timestamps**: `freshUntil` = logical TTL (flight 5 min, weather 30 min, prediction 10 min, analytics 24 h), `expiresAt` = freshUntil + stale grace (24 h / 24 h / 1 h / 7 d) for the TTL index. A TTL index on the logical expiry would delete entries within a minute and make stale-if-error impossible. Responses carry `source: live|cache|mock`, `stale`, `demo` (true only for mock). Mock data is never cached. Concurrent identical misses share one upstream call.
- Quota (`ApiQuota`): atomic `findOneAndUpdate` with `used < floor(limit*0.9)`; every upstream attempt counts; at the cap the API is skipped (cache stale -> mock). Verified atomic under 12 concurrent calls (never exceeds 9 of 10).
- Prediction cache key = airline, route, date+hour, distance, weather rounded to 0.1 (flight number ignored). Every request is still logged to `PredictionLog` (`cached: true` when served from cache). Extra fields: `PredictionLog.cached`, `ModelMetricSnapshot.target`/`prAuc`/`brier`/`r2` (xgboost has a delay and a cancel classifier).
- Live flight times are treated as airport-local wall clock (any offset in the API string is dropped); the airline is sent to the ml-service as its IATA code. Weather comes from Open-Meteo daily mean/min temperature, precipitation sum, snowfall sum, mean wind (km/h); it never fails a request (null + ml-service warning).
- Airport coordinates for weather and autocomplete come from the ml-service (`/analytics/airports`), memoised 24 h.
- Alerts: only `route` and `flight` saved searches can have alerts (airport searches are rejected at validation). The 30-min job (`ALERTS_CRON`) emails when delay probability >= the user's threshold, risk is at least medium, and the risk level changed since the last check; without `SMTP_HOST` emails are logged as JSON. Max 50 saved searches per user.
- Bulk CSV: required columns `airline,origin,destination,scheduled_departure`; optional `flight_number, distance_miles, origin_|dest_ temperature_c, temperature_min_c, precipitation_mm, wind_speed_kmh, snowfall_cm`. Max 500 rows, 512 KB, `.csv` only, memory storage. Invalid rows are reported by line number, valid rows are predicted. No automatic weather lookup per row (ml-service fills typical values and warns).
- `/health` is 200 `ok` / 200 `degraded` (ml-service unreachable) / 503 `down` (no DB).
- Rate limits per 15 min: predictions 30 anonymous / 120 logged in, login+register 20 per IP, global 600; all env-configurable. `trust proxy` is on in production only.
- Bug found by tests and fixed: `Date.parse('2026-02-30')` silently rolls over, so dates are validated by round-tripping the calendar parts.
- Needs your input later: an AviationStack key and a MongoDB Atlas URI. Until then the app runs on demo flights and local Mongo.

## 16. HOW TO CHANGE SOMETHING
1. Find the decision number in section 4. Tell the assistant: "Changing Decision N from X to Y."
2. Impact map: encoding/features -> `encoders.py`, `feature_builder.py`, retrain, regenerate manifest. Target definition -> `data_cleaning.py`, all trainers, PredictionLog meaning. Auth change -> `jwt.js`, `authMiddleware`, `axiosClient`, `AuthContext`. Cache TTLs -> `cacheService.js`. Served models -> `model_loader.py`, `requirements.txt`, Docker image.
3. Update sections 4 and 14 of this file after every change.

## 17. RESUME PROMPT (copy into a new chat)
"I'm building the project described in the attached CONTEXT.md. Act as a senior full-stack + ML engineer. Continue from section 14. Generate the next unchecked group of files one file at a time with the exact path as a heading, full working code, and a one-line note on any decision. Flag trade-offs rather than silently choosing. Match section 4 decisions exactly."