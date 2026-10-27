# ML methodology

Everything here is reproducible from `ml-service/training/` and reflects what was actually built and measured
(model version `v20261027-d4c7d1`). Numbers are copied from `ml-service/artifacts/metrics/model_metrics.json`.

## 1. Problem and target (Decision 4)

Two linked questions for a US domestic flight:

| Quantity | Definition |
|---|---|
| `is_cancelled` | the flight was cancelled (own classifier) |
| `is_delayed` | **arrival delay >= 15 minutes**, among flights that operated |
| `delay_minutes` | arrival delay in minutes, **only for delayed flights** (regressor) |

Diverted flights (16,552) are **excluded**: neither a clean delay nor a cancellation. The regressor is only called at serving time
when the delay probability is above the classifier threshold.

## 2. Data

Kaggle `bordanova/2023-us-civil-flights-delay-meteo-and-aircraft`, four files used:

| File | Rows | Role |
|---|---|---|
| `US_flights_2023.csv` | 6,743,404 | flights that operated (main file) |
| `Cancelled_Diverted_2023.csv` | 87,936 cancelled, 16,552 diverted | cancelled flights (the main file has none) |
| `weather_meteo_by_airport.csv` | 132,860 airport-days | **daily** weather: mean/min/max temperature, precipitation, snow, wind, pressure |
| `airports_geolocation.csv` | 364 | coordinates (distance, map) |

After cleaning (DuckDB, month by month, 8 GB machine): **6,830,352 flights**, 86,991 cancelled, 1,386,688 delayed (20.6% of flights that operated).
988 rows dropped as exact duplicates or impossible values (945 of them cancelled rows, which carry no field that distinguishes two
same-day same-route cancellations, so about 1% of cancellations may be real flights).

### What the data does NOT contain (and why it caps accuracy)

No scheduled clock time (only Night/Morning/Afternoon/Evening), no flight number, no hourly weather, no visibility, no aircraft state
before departure, no previous-leg delay of the same aircraft. These are the most predictive signals for a real delay forecast, which is why
the achievable AUC is modest (section 6).

## 3. Leakage rules (the part that matters most)

A feature must be knowable **before departure**. Dropped for that reason: `Dep_Delay`, `Dep_Delay_Tag`, `Dep_Delay_Type`, `Arr_Delay_Type`,
`Flight_Duration`, and all `Delay_*` cause columns (the causes are used for the EDA chart only). `Tail_Number` is an identifier, not a feature.

**Aircraft columns (manufacturer, model, age) are NOT features, deliberately.** They exist only for flights that operated, so they are
`NULL` exactly when a flight was cancelled: using them would let the cancel model read its own label. (Notebook 02 prints the proof.)

## 4. Split (Decision 5): honest, time-based

```
Jan-Aug  fit models, encoders, lookups        (4,457,130 delay rows)
Sep      validation: early stopping, isotonic calibration, threshold choice
Oct-Dec  test, never touched until the end     (1,725,347 delay rows)
```

September is not used by any lookup either: frequency encoders and static rates are fitted on Jan-Aug only.
A **random 80/20 split is also reported**, to show how much it flatters the model (section 6).

## 5. Features (33; `app/services/feature_builder.py` is shared by training and serving)

| Group | Features |
|---|---|
| Time | time-of-day bucket, weekday, weekend, US federal holiday flag, days from nearest holiday (rule-based, any year) |
| Route | distance (haversine from airport coordinates), frequency-encoded airline / origin / destination / route (Decision 6), average flights per day on the route and at the origin (congestion) |
| History | 28-day **rolling** delay and cancel rate for airline, origin and destination (prior days only, shrunk toward the global rate); smoothed static route delay rate; smoothed origin x time-of-day delay rate |
| Weather | coarse **bands** (precipitation, snow, wind), freeze flag, a severity index and mean temperature, for origin and destination, plus `weather_missing` |

Design choices worth defending:

- **Frequency encoding only, no target encoding** (Decision 6): no label information leaks into categorical features.
- **Weather as coarse bands** so observed daily weather in training and Open-Meteo *forecasts* at serving are comparable.
- **Rolling history uses prior days only.** Jan-Sep rows use the true rolling value. Oct-Dec test rows and all live predictions use the shipped **snapshot taken on 2023-10-01**, which is exactly what a deployed model without a daily refresh would see (so the test is not flattered). A daily refresh job is the obvious production improvement.
- **`month` is not a feature**: training covers Jan-Aug, so Oct-Dec values are unseen and trees cannot extrapolate. An ablation showed it neutral for delay and worse for cancel.
- **Train/serve skew guard**: `manifest.json` stores the exact feature order; the service refuses to start on any mismatch, and a test feeds raw December rows through the serving path and checks they reproduce the stored training features exactly.

## 6. Models and results

Class imbalance is handled with **class weights** (`scale_pos_weight` = neg/pos), then **isotonic calibration on September** so the gauge shows
real probabilities (Decision 9). The decision threshold is the F1-optimal one **chosen on September**, never on the test months.

### Delay classifier, test months Oct-Dec

| Model | Trained on | ROC AUC | PR AUC | F1 | Precision | Recall | Accuracy | Brier |
|---|---|---|---|---|---|---|---|---|
| Logistic regression | 1.0M rows | 0.646 | 0.250 | 0.317 | 0.228 | 0.522 | 0.663 | 0.200 |
| Random forest | 300k rows | 0.657 | 0.259 | 0.325 | 0.237 | 0.519 | 0.678 | 0.188 |
| **XGBoost (production)** | 4.46M rows | **0.661** | **0.260** | **0.330** | 0.238 | 0.534 | 0.675 | **0.124** (calibrated; 0.201 raw) |
| Neural network (PyTorch) | 4.46M rows | 0.651 | 0.256 | 0.321 | 0.227 | 0.545 | 0.654 | 0.198 |

Only XGBoost is deployed (Decision 7, 512 MB host); the others are metrics-only. Base rate in the test months is 15.0% delayed.
Validation (September, base rate 18.7%): XGBoost AUC 0.692, F1 0.401.

### Other models

| Model | Result |
|---|---|
| Cancel classifier (XGBoost) | test AUC **0.706**, Brier 0.0031 (calibrated; 0.076 raw). Precision is low (4.4%) because cancellations fall from 1.6% (train) to 0.3% (test) |
| Delay-minutes regressor (XGBoost, median/absolute-error objective, target winsorised at p99 = 484 min) | test MAE **35.9** min vs **36.5** for "always predict the median": a very small gain; RMSE and R^2 are no better than the baseline (R^2 -0.06) |
| XGBoost on a **random** 80/20 split (not deployable) | AUC **0.745**, F1 0.473 |

### How to read this honestly

1. **All four model families land within 0.015 AUC of each other.** The limit is the *information* available (no clock time, no aircraft state), not the algorithm. More tuning would not change that; notebook 05 shows hyperparameters sit on a plateau.
2. **0.661 vs 0.745:** the random split lets the model see the same weather episodes and seasonal delay levels it is tested on. We report the time split.
3. **The test months are easier to be wrong on:** Oct-Dec has far fewer delays (15% vs 22%), which lowers precision for every model.
4. **The probabilities are trustworthy even though the ranking is modest:** calibration cut the delay Brier score from 0.201 to 0.124 and the cancel Brier from 0.076 to 0.003.
5. **The minutes estimate is weak.** The UI says "typical delay if late", not a forecast.

What drives predictions (XGBoost gain share): origin delay history at that hour (14.7%), rain at origin (11.4%), route delay history (10.3%), rain at destination (8.4%), time of day (7.7%), weather severity at origin (6.2%), airline recent delays (4.2%).

## 7. Explainability

`shap.TreeExplainer` on the delay classifier with a 200-row validation background, built once at startup (about 7 ms per call). `/predict` returns
the top 5 factors by |SHAP| with the direction (raises or lowers risk); the UI shows them with readable names. A test checks the SHAP values add up to the model's
raw log-odds.

## 8. Reproduce

From `ml-service/` with the venv (Python 3.11, `requirements-dev.txt`):

```
python -m training.data_cleaning --to-parquet     # CSV -> parquet, about 90 s
python -m training.feature_engineering            # lookups (Jan-Aug) + feature files, about 60 s
python -m training.train_xgboost                  # delay + cancel classifiers, isotonic calibration
python -m training.train_regressor
python -m training.train_baseline
python -m training.train_random_forest
python -m training.train_neural_net
python -m training.train_xgboost --random-split   # the optimistic comparison
python -m training.generate_shap_background
python -m training.compare_models                 # model_metrics.json + manifest.json
```

Add `--sample 0.15` to any trainer for a quick proving run (outputs go to `artifacts_sample/`, never over the real artifacts).
Seven notebooks (`ml-service/notebooks/`, all executed, figures in `docs/images/`): EDA, cleaning and features, baselines, SMOTE vs class weights, XGBoost tuning, calibration and evaluation, SHAP.

## 9. Known limitations

- Daily (not hourly) weather and a time-of-day bucket instead of a clock time.
- Frequency/history lookups are fitted on 2023 only; airports or airlines unseen in 2023 get a neutral encoding and a warning.
- The model is trained on Jan-Aug only (to keep Oct-Dec honest). For production you would retrain on a full year (September kept for calibration) and refresh the rolling history daily.
- It cannot know about same-day ground stops, crew problems or the incoming aircraft's lateness.
