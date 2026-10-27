# API specification

Two HTTP APIs. The browser only ever talks to the **Node API**; the **ML service** is internal.

```
Browser --Bearer JWT--> Node API (:5000, /api/v1) --X-Internal-Key--> ML service (:8000)
```

Conventions: JSON everywhere, **camelCase** in the Node API, snake_case in the ML service (the Node `mlClientService`
converts). Errors always look like `{ "error": { "code": "...", "message": "...", "details": [...]? } }`. Times of flights are
**airport-local wall clock** strings (`2026-12-22T09:30:00`, no zone). Timestamps such as `createdAt` are UTC instants.

---

## 1. Node API (`/api/v1`)

Access: **P** public, **A** needs `Authorization: Bearer <jwt>`, **X** admin only, **P\*** public but rate limited (logged-in users get a higher limit).

| Method | Route | Access | Purpose |
|---|---|---|---|
| POST | `/auth/register` | P | create account, returns `{ token, user }` |
| POST | `/auth/login` | P | returns `{ token, user }` |
| GET | `/users/me` | A | current user |
| PATCH | `/users/me` | A | `name`, `preferences.theme`, `preferences.alertsEnabled` |
| GET | `/flights/live?flight=AA100` | P | live status + weather (cached) |
| GET | `/flights/live/route?origin=JFK&destination=LAX` | P | upcoming flights on a route |
| GET | `/flights/historical?origin=&dest=&date=&airline=&limit=` | P | 2023 flights (proxied to the ML service) |
| GET | `/flights/airports?q=chi&limit=8` | P | airport autocomplete |
| POST | `/predictions` | P\* | manual prediction (logged) |
| POST | `/predictions/live` | P\* | fetch flight + weather, predict, explain |
| POST | `/predictions/bulk` | A | CSV upload, max 500 rows |
| GET | `/predictions/history?page=&limit=&source=` | A | caller's past predictions |
| GET | `/analytics/overview` | P | EDA aggregates (24 h cache) |
| GET | `/analytics/trends?granularity=day\|week\|month&origin=&airline=` | P | delay-rate time series |
| GET | `/analytics/risk-map?minFlights=3000` | P | per-airport delay and cancel rate with coordinates |
| GET | `/analytics/models/compare` | P | model comparison metrics |
| GET/POST/PATCH/DELETE | `/saved-searches[/:id]` | A | CRUD, favourite, alert |
| GET | `/admin/metrics`, `/admin/predictions`, `/admin/stats` | X | monitoring |
| POST | `/admin/metrics/refresh` | X | pull metrics from the ML service into MongoDB |
| GET | `/health` | P | `ok` / `degraded` (ML unreachable, still 200) / `down` (DB down, 503) |

There is deliberately **no** `/auth/refresh` and **no** `/auth/logout` (Decision 2): one 12 h JWT, logout = discard it client-side.

### Rate limits (per 15 minutes)

Predictions: 30 anonymous / 120 logged in. Login and register: 20 per IP. Everything: 600 per client. All configurable by
`RATE_LIMIT_*`. Over the limit: `429 { error: { code: "RATE_LIMITED", retryAfterSeconds } }`.

### Auth

`POST /auth/register` body: `{ name (2-60), email, password (8-72, one letter + one digit) }`. Emails listed in `ADMIN_EMAILS`
become `role: "admin"`. A client cannot choose its role. `POST /auth/login` body: `{ email, password }`; a wrong password and an
unknown email return the **same** `401 INVALID_CREDENTIALS`.

```json
{ "token": "eyJ...", "user": { "id": "...", "name": "Ada", "email": "ada@example.com", "role": "user",
  "preferences": { "theme": "system", "alertsEnabled": true }, "lastLoginAt": "2026-10-27T09:00:00Z", "createdAt": "..." } }
```

### Prediction input (manual)

`POST /predictions`

```json
{ "airline": "DL", "origin": "ORD", "destination": "LGA", "scheduledDeparture": "2026-12-22T17:30:00",
  "flightNumber": "DL100", "distanceMiles": 733,
  "originWeather": { "temperatureC": -6, "temperatureMinC": -10, "precipitationMm": 14, "windSpeedKmh": 42, "snowfallCm": 9 },
  "destWeather": { "temperatureC": 2 } }
```

`airline` is an IATA code or a name ("Delta Air Lines"); airports are 3-letter codes (case-insensitive). Weather is optional
and **daily** (mean temperature, minimum temperature, precipitation mm/day, mean wind km/h, snowfall cm/day). Missing weather
is replaced by typical values for that airport and month and a warning is returned, never an error. Unknown fields in
`originWeather` are rejected (400).

Response:

```json
{ "prediction": {
    "delayProbability": 0.5521, "cancelProbability": 0.0613, "predictedDelayMinutes": 48.4, "riskLevel": "high",
    "topFactors": [ { "feature": "o_severity", "value": "7.5", "shapValue": 0.4807, "direction": "increases_delay_risk" } ],
    "modelVersion": "v20261027-d4c7d1", "warnings": ["destination weather not supplied: used typical values for LGA in this month"] },
  "cached": false, "stale": false }
```

- `predictedDelayMinutes` is `null` when `delayProbability` is below the classifier threshold (the regressor only runs for likely delays).
- `riskLevel`: delay `low < 0.20 <= medium < 0.40 <= high`, cancel `0.03 / 0.08`; the overall level is the higher of the two.
- `cached: true` means it came from the 10-minute prediction cache; `stale: true` means the ML service was down and an expired entry was served.

### Live

`GET /flights/live?flight=AA100` (also `aa 100`, `AA-100`):

```json
{ "flight": { "flightIata": "AA100", "flightDate": "2026-10-27", "airline": { "name": "American Airlines", "iata": "AA" }, "status": "scheduled",
    "origin": { "iata": "JFK", "airport": "...", "terminal": "8", "gate": "B22", "scheduled": "2026-10-27T08:00:00", "estimated": null, "actual": null, "delayMinutes": 0 },
    "destination": { "iata": "LAX", "...": "..." }, "aircraft": "B77W", "demo": false },
  "weather": { "origin": { "temperatureC": 15.5, "precipitationMm": 6.5, "windSpeedKmh": 22.1, "snowfallCm": 0 }, "destination": null },
  "source": "live", "stale": false, "demo": false, "fetchedAt": "2026-10-27T09:00:00Z" }
```

`source` is `live` (just fetched), `cache` (fresh or stale cache; see `stale`) or `mock` (built-in demo flights; the UI shows a
"Demo data" badge). Weather is `null` per airport when unavailable.

`POST /predictions/live` body `{ "flight": "AA100" }` returns `{ prediction, flight, weather, source, demo, cached, stale }`.

### Bulk CSV

`POST /predictions/bulk` (auth), `multipart/form-data`, field `file`. Required columns: `airline, origin, destination, scheduled_departure`.
Optional: `flight_number, distance_miles, origin_temperature_c, origin_temperature_min_c, origin_precipitation_mm, origin_wind_speed_kmh, origin_snowfall_cm` and the same with `dest_`. Limits: `.csv`, 512 KB, 500 rows.

```json
{ "summary": { "total": 3, "ok": 2, "failed": 1 },
  "results": [ { "row": 2, "status": "ok", "input": { }, "prediction": { } },
               { "row": 4, "status": "error", "errors": ["scheduled_departure: must be an ISO date-time"] } ] }
```

`row` is the line number in the file (header = line 1). Bad rows never block good rows. Structural problems (no file, no rows, missing columns, ragged rows, more than 500 rows, wrong type) are 400; an oversized file is 413.

### Historical, analytics

- `GET /flights/historical`: needs `origin` or `dest`. Returns `{ summary: { flights, cancelled, delay_rate, cancel_rate, avg_arrival_delay, p90_arrival_delay, returned }, flights: [...], by_airline: [...], cached }`.
- `GET /analytics/overview`: `{ totals, by_airline, by_airport, by_month, by_day_of_week, by_time_of_day, by_weather, delay_causes, cached, stale, fetchedAt }`.
- `GET /analytics/trends`: `{ granularity, points: [{ date, flights, delay_rate, cancel_rate, delay_rate_ma7 }] }`.
- `GET /analytics/risk-map`: `{ airports: [{ airport, name, city, state, lat, lon, flights, delay_rate, cancel_rate, avg_departure_delay }] }`.
- `GET /analytics/models/compare`: the ML service's `model_metrics.json` (see ML service `/models/compare`).

If the ML service has no flights data these return `503` with a clear message; predictions keep working.

### Saved searches

`POST /saved-searches`: `{ type: "route"|"flight"|"airport", label, origin?, destination?, airline?, flightNumber?, isFavorite?, alert?: { enabled, threshold (0.05-0.95) } }`.
Route needs origin+destination, flight needs `flightNumber`, airport needs `origin`; airport searches cannot have alerts. `PATCH /saved-searches/:id` accepts only `label`, `isFavorite`, `alert`. Other users' ids return **404**, the same as missing ones. Maximum 50 per user.

### Admin

`GET /admin/stats` -> users, predictions (total, last 24 h, by source / risk / model version), average latency, cached share, AviationStack quota (`used`, `limit`, `stopsAt`), cache entries by kind. `GET /admin/predictions?page&limit&source&riskLevel&user&from&to`. `GET /admin/metrics?production=true`. `POST /admin/metrics/refresh` -> `{ version, upserted }`.

### Status codes

`200/201/204` ok, `400` validation (`details` lists `in`, `path`, `message`), `401` missing/invalid/expired token, `403` not an admin, `404`, `409` duplicate email, `413` too large, `429` rate limited, `502` ML service error, `503` ML service unreachable or analytics data missing.

---

## 2. ML service (internal, `:8000`)

**Every route requires the header `X-Internal-Key: <INTERNAL_API_KEY>`** (constant-time compare, `403` otherwise).

| Method | Route | Purpose |
|---|---|---|
| POST | `/predict` | one prediction with SHAP top-5 |
| POST | `/predict/batch` | `{ "items": [PredictRequest x 1..500] }`, no SHAP |
| GET | `/models/compare` | all model metrics (from `model_metrics.json`) |
| GET | `/models/production` | manifest summary: version, feature columns, thresholds, risk levels |
| GET | `/analytics/overview` `/historical` `/risk-map` `/trends` | DuckDB over the 2023 parquet |
| GET | `/analytics/airports` `/airlines` | autocomplete lists (always available) |
| GET | `/health` | model version, `analytics_available`, uptime |

```python
class WeatherInput:   temperature_c, temperature_min_c, precipitation_mm, wind_speed_kmh, visibility_km (ignored), snowfall_cm   # all optional, daily units
class PredictRequest: airline, origin, destination, flight_number?, scheduled_departure (datetime), distance_miles?, origin_weather?, dest_weather?
class PredictResponse:
    delay_probability, cancel_probability, predicted_delay_minutes | None,
    risk_level: "low"|"medium"|"high", top_factors: [{feature, value, shap_value, direction}], model_version, warnings: [str]
```

The ML service is a **pure function**: features in, prediction out. It never calls the internet (Decision 8). At startup it loads the manifest, models, calibrators, encoders, lookups and builds the SHAP explainer once, and **fails to start** if anything is missing or the manifest's feature list differs from the code.
