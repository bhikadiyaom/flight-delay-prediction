"""XGBoost delay-minutes regressor, trained on DELAYED flights only (Decision 4).

    python -m training.train_regressor [--sample 0.15]

Target = arr_delay winsorized at the train p99 (classifier keeps outliers). Objective is absolute error (median
regression): a log-transform + squared error variant was tried first and under-predicted the median, losing to the
median baseline on MAE. Predictions are clipped to >= 15 (a delayed flight is >= 15 min late).
Serving only calls it when the delay probability is above the classifier threshold.
"""
import argparse
import logging
import time

import joblib
import numpy as np
import xgboost as xgb

from training import config as C
from training.evaluate import reg_metrics, save_json
from training.feature_engineering import load_xy

log = logging.getLogger("train_regressor")
MIN_MINUTES = float(C.DELAY_THRESHOLD_MIN)

PARAMS = dict(n_estimators=500, learning_rate=0.08, max_depth=6, min_child_weight=20, subsample=0.8,
              colsample_bytree=0.8, max_bin=128, tree_method="hist", n_jobs=4, random_state=C.RANDOM_STATE,
              objective="reg:absoluteerror", eval_metric="mae", early_stopping_rounds=30)


def predict_minutes(model, X) -> np.ndarray:
    return np.maximum(model.predict(X), MIN_MINUTES)


def main() -> None:
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(name)s %(message)s")
    ap = argparse.ArgumentParser()
    ap.add_argument("--sample", type=float, default=None)
    a = ap.parse_args()
    t0 = time.time()
    models_dir, metrics_dir = C.run_dirs(a.sample)
    Xtr, ytr = load_xy("train", "regressor", a.sample)
    Xva, yva = load_xy("valid", "regressor", a.sample)
    Xte, yte = load_xy("test", "regressor", a.sample)
    cap = float(np.quantile(ytr, C.REGRESSOR_WINSOR_PCT))
    ytr_w, yva_w, yte_w = (np.minimum(y, cap) for y in (ytr, yva, yte))

    model = xgb.XGBRegressor(**PARAMS)
    model.fit(Xtr, ytr_w, eval_set=[(Xva, yva_w)], verbose=50)
    pred_te = predict_minutes(model, Xte)
    pred_va = predict_minutes(model, Xva)
    baseline = np.full_like(yte_w, np.median(ytr_w), dtype="float64")

    res = {
        "model_name": "xgboost", "task": "regressor", "artifact": "xgb_delay_reg.joblib",
        "winsor_cap_minutes": cap, "objective": "reg:absoluteerror", "min_minutes": MIN_MINUTES,
        "best_iteration": int(model.best_iteration),
        "n_train": int(len(ytr)), "n_valid": int(len(yva)), "n_test": int(len(yte)),
        "validation": reg_metrics(yva_w, pred_va),
        "test": reg_metrics(yte_w, pred_te),
        "test_vs_raw_unwinsorized": reg_metrics(yte, pred_te),
        "baseline_median_test": reg_metrics(yte_w, baseline),
        "seconds": round(time.time() - t0, 1),
    }
    joblib.dump(model, models_dir / res["artifact"])
    save_json(metrics_dir / "xgboost_regressor.json", res)
    log.info("regressor TEST mae=%.2f rmse=%.2f r2=%.3f | median baseline mae=%.2f | cap=%.0f (%.0fs)",
             res["test"]["mae"], res["test"]["rmse"], res["test"]["r2"], res["baseline_median_test"]["mae"], cap,
             res["seconds"])


if __name__ == "__main__":
    main()
