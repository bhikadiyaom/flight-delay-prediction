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
- [ ] Server foundation: env, db, cors, app, server, utils, errorHandler, auth/role middleware, validators, models, auth + user controllers/routes, routes/index with /health
- [ ] Server: cacheService, aviationStackService, openMeteoService, mlClientService, flight/prediction/analytics/savedSearch/admin controllers+routes, rateLimiter, upload, alertService, riskAlertJob, tests
- [ ] ML training: config, data_cleaning (parquet), feature_engineering, encoders, trainers x4, regressor, calibrate, evaluate, compare_models, shap background
- [ ] ML serving: config, security, main (lifespan), schemas, model_loader, feature_builder, weather_severity, predictor, explainer, duckdb_service, routes
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

## 16. HOW TO CHANGE SOMETHING
1. Find the decision number in section 4. Tell the assistant: "Changing Decision N from X to Y."
2. Impact map: encoding/features -> `encoders.py`, `feature_builder.py`, retrain, regenerate manifest. Target definition -> `data_cleaning.py`, all trainers, PredictionLog meaning. Auth change -> `jwt.js`, `authMiddleware`, `axiosClient`, `AuthContext`. Cache TTLs -> `cacheService.js`. Served models -> `model_loader.py`, `requirements.txt`, Docker image.
3. Update sections 4 and 14 of this file after every change.

## 17. RESUME PROMPT (copy into a new chat)
"I'm building the project described in the attached CONTEXT.md. Act as a senior full-stack + ML engineer. Continue from section 14. Generate the next unchecked group of files one file at a time with the exact path as a heading, full working code, and a one-line note on any decision. Flag trade-offs rather than silently choosing. Match section 4 decisions exactly."