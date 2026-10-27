# Database schema (MongoDB)

MongoDB (Atlas free tier, 512 MB) holds **application data only**. The 6.8M historical flights live in Parquet and are queried
with DuckDB inside the ML service (Decision 1), so they never touch MongoDB.

Six collections (Mongoose models in `server/src/models/`). All have `createdAt/updatedAt` unless noted.

## users

| Field | Type | Notes |
|---|---|---|
| `name` | String | 2-60 chars |
| `email` | String | **unique**, lower-cased, max 254 |
| `passwordHash` | String | bcrypt (cost 12), `select: false`, never returned |
| `role` | `'user' \| 'admin'` | default `user`; `admin` only via `ADMIN_EMAILS` at registration |
| `preferences.theme` | `'light' \| 'dark' \| 'system'` | default `system` |
| `preferences.alertsEnabled` | Boolean | master switch for saved-search alerts |
| `lastLoginAt` | Date | |

No refresh tokens (Decision 2).

## savedsearches

| Field | Type | Notes |
|---|---|---|
| `user` | ObjectId -> users | indexed |
| `type` | `'route' \| 'flight' \| 'airport'` | |
| `label` | String | max 80 |
| `origin`, `destination` | String | 3-letter IATA, upper-cased |
| `airline`, `flightNumber` | String | flight number normalised (`AA100`) |
| `isFavorite` | Boolean | |
| `alert.enabled` | Boolean | only route/flight |
| `alert.threshold` | Number | 0.05-0.95, default 0.5 |
| `alert.lastRiskLevel` | `'low'\|'medium'\|'high'\|null` | used to send an email only when the level changes |
| `alert.lastNotifiedAt` | Date | |

Index `{ user: 1, type: 1 }`. A user can keep at most 50.

## predictionlogs

| Field | Type | Notes |
|---|---|---|
| `user` | ObjectId \| null | null for anonymous predictions; indexed |
| `source` | `'manual' \| 'live' \| 'bulk'` | |
| `input` | Mixed | the validated request (plus `flight`, `flightSource` for live) |
| `output` | `{ delayProbability, cancelProbability, predictedDelayMinutes, riskLevel, modelVersion }` | |
| `actual` | `{ wasDelayed, delayMinutes, resolvedAt }` | reserved for closing the loop with real outcomes |
| `cached` | Boolean | served from the 10-minute cache |
| `latencyMs` | Number | |

Indexes: `{ createdAt: -1 }`, `{ 'output.modelVersion': 1 }`. Writing a log can never fail a prediction (errors are logged and swallowed).

## liveflightcaches (cache)

| Field | Type | Notes |
|---|---|---|
| `key` | String | **unique**; normalised, e.g. `flight:AA100`, `weather:JFK:2026-10-27`, `pred:<hash>`, `analytics:overview` |
| `kind` | `'flight' \| 'weather' \| 'prediction' \| 'analytics'` | |
| `payload` | Mixed | |
| `fetchedAt` | Date | |
| `freshUntil` | Date | **logical TTL**: flight 5 min, weather 30 min, prediction 10 min, analytics 24 h |
| `expiresAt` | Date | **physical deletion** (TTL index `expireAfterSeconds: 0`) = `freshUntil` + a grace window (24 h / 24 h / 1 h / 7 d) |

Why two dates: stale-if-error must serve an *expired* entry when the upstream fails. A TTL index on the logical expiry would delete
the entry within a minute and make that impossible. Mock (demo) data is never cached.

## modelmetricsnapshots

`modelName` (`logreg|random_forest|xgboost|neural_net`), `task` (`classifier|regressor`), `target` (`delay|cancel|delay_minutes`), `version`, `isProduction`, `metrics { accuracy, precision, recall, f1, rocAuc, prAuc, brier, mae, rmse, r2 }`, `perClass`, `confusionMatrix`, `threshold`, `trainedAt`. Unique index `{ modelName, task, target, version }`. Filled by `POST /admin/metrics/refresh` (idempotent upsert; older versions are flagged not-production).

## apiquotas

`provider` (`aviationstack`), `month` (`YYYY-MM`, UTC), `used`, `limit`. Unique `{ provider, month }`. Updated atomically with a conditional `findOneAndUpdate`, so concurrent requests can never exceed the cap (**90% of the monthly limit**, then the API serves cache/demo data).

## Entity relationships

```
users 1 --- * savedsearches
users 1 --- * predictionlogs      (user may be null)
liveflightcaches, apiquotas, modelmetricsnapshots: standalone
```

## Sizing

Cache entries are small and self-expiring. `predictionlogs` is the only collection that grows without bound (about 1 KB per row):
500 000 predictions is about 500 MB, so on the free tier consider a periodic purge of old `bulk` logs if usage becomes heavy.
