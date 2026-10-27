"""Production classifiers (Decision 7): XGBoost delay and cancel classifiers + isotonic calibration.

    python -m training.train_xgboost [--task delay|cancel|both] [--sample 0.15] [--random-split]

Train = Jan-Aug (early stopping + isotonic calibration on September), test = Oct-Dec.
Class imbalance: scale_pos_weight = neg/pos (Decision 9), then isotonic calibration.
"""
import argparse
import logging
import time

import joblib
import numpy as np
import xgboost as xgb
from sklearn.model_selection import train_test_split

from training import config as C
from training.calibrate import calibration_report, fit_isotonic
from training.evaluate import best_f1_threshold, clf_metrics, roc_points, save_json
from training.feature_engineering import load_xy

log = logging.getLogger("train_xgboost")

PARAMS = dict(n_estimators=600, learning_rate=0.1, max_depth=7, min_child_weight=10, subsample=0.8,
              colsample_bytree=0.8, reg_lambda=1.0, max_bin=128, tree_method="hist", n_jobs=4,
              random_state=C.RANDOM_STATE, eval_metric="aucpr", early_stopping_rounds=30)

# cancel is rare (about 1.6% train, 0.3% test) and episodic: shallower trees, larger leaves, and a rank-based
# stopping metric (aucpr on a rare class is too noisy; it stopped at iteration 0 in the first full run).
TASK_PARAMS = {"delay": {}, "cancel": dict(max_depth=5, min_child_weight=100, learning_rate=0.08,
                                           eval_metric="auc", early_stopping_rounds=40)}

FILES = {"delay": ("xgb_delay_clf.joblib", "calibrator_delay.joblib"),
         "cancel": ("xgb_cancel_clf.joblib", "calibrator_cancel.joblib")}


def train_task(task: str, sample: float | None) -> dict:
    t0 = time.time()
    models_dir, metrics_dir = C.run_dirs(sample)
    Xtr, ytr = load_xy("train", task, sample)
    Xva, yva = load_xy("valid", task, sample)
    Xte, yte = load_xy("test", task, sample)
    spw = float((ytr == 0).sum() / max((ytr == 1).sum(), 1))
    log.info("[%s] train=%s valid=%s test=%s scale_pos_weight=%.2f", task, Xtr.shape, Xva.shape, Xte.shape, spw)

    model = xgb.XGBClassifier(scale_pos_weight=spw, **{**PARAMS, **TASK_PARAMS[task]})
    model.fit(Xtr, ytr, eval_set=[(Xva, yva)], verbose=50)

    p_va_raw, p_te_raw = model.predict_proba(Xva)[:, 1], model.predict_proba(Xte)[:, 1]
    iso = fit_isotonic(yva, p_va_raw)
    p_va, p_te = iso.predict(p_va_raw), iso.predict(p_te_raw)
    thr = best_f1_threshold(yva, p_va)           # chosen on validation only

    fi = dict(sorted(((k, float(v)) for k, v in zip(Xtr.columns, model.feature_importances_)),
                     key=lambda kv: -kv[1]))
    res = {
        "model_name": "xgboost", "task": "classifier", "target": task, "version_note": "isotonic-calibrated",
        "artifact": FILES[task][0], "calibrator": FILES[task][1], "threshold": thr,
        "best_iteration": int(model.best_iteration), "scale_pos_weight": spw,
        "n_train": int(len(ytr)), "n_valid": int(len(yva)), "n_test": int(len(yte)),
        "validation": clf_metrics(yva, p_va, thr),
        "test": clf_metrics(yte, p_te, thr),
        "test_uncalibrated_raw": clf_metrics(yte, p_te_raw, best_f1_threshold(yva, p_va_raw)),
        "calibration": calibration_report(yte, p_te_raw, p_te),
        "roc": roc_points(yte, p_te),
        "feature_importance": fi,
        "seconds": round(time.time() - t0, 1),
    }
    joblib.dump(model, models_dir / FILES[task][0])
    joblib.dump(iso, models_dir / FILES[task][1])
    save_json(metrics_dir / f"xgboost_{task}.json", res)
    m = res["test"]["metrics"]
    log.info("[%s] TEST auc=%.4f f1=%.4f prec=%.3f rec=%.3f brier=%.4f (raw brier %.4f) thr=%.3f  %.0fs",
             task, m["roc_auc"], m["f1"], m["precision"], m["recall"], m["brier"],
             res["calibration"]["brier_before"], thr, res["seconds"])
    return res


def random_split_experiment(sample: float | None) -> dict:
    """Honest-vs-optimistic gap: same model family on a RANDOM 80/20 split of the whole year."""
    t0 = time.time()
    _, metrics_dir = C.run_dirs(sample)
    frac = sample or 0.4          # memory: 40% of the year (~2.7M rows) is plenty for this comparison
    X, y = load_xy(["train", "valid", "test"], "delay", frac, random_split_rolling=True)
    Xtr, Xte, ytr, yte = train_test_split(X, y, test_size=0.2, random_state=C.RANDOM_STATE, stratify=y)
    Xtr, Xva, ytr, yva = train_test_split(Xtr, ytr, test_size=0.1, random_state=C.RANDOM_STATE, stratify=ytr)
    spw = float((ytr == 0).sum() / (ytr == 1).sum())
    model = xgb.XGBClassifier(scale_pos_weight=spw, **PARAMS)
    model.fit(Xtr, ytr, eval_set=[(Xva, yva)], verbose=100)
    p_va, p_te = model.predict_proba(Xva)[:, 1], model.predict_proba(Xte)[:, 1]
    thr = best_f1_threshold(yva, p_va)
    res = {"description": "random 80/20 split over Jan-Dec (leaks seasonality + same-day conditions); NOT deployable",
           "n_rows": int(len(y)), "test": clf_metrics(yte, p_te, thr), "seconds": round(time.time() - t0, 1)}
    save_json(metrics_dir / "xgboost_delay_random_split.json", res)
    log.info("[random split] auc=%.4f f1=%.4f", res["test"]["metrics"]["roc_auc"], res["test"]["metrics"]["f1"])
    return res


def main() -> None:
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(name)s %(message)s")
    ap = argparse.ArgumentParser()
    ap.add_argument("--task", choices=["delay", "cancel", "both"], default="both")
    ap.add_argument("--sample", type=float, default=None, help="fraction of rows (proving run)")
    ap.add_argument("--random-split", action="store_true", help="run only the random-split experiment")
    a = ap.parse_args()
    if a.random_split:
        random_split_experiment(a.sample)
        return
    for t in (["delay", "cancel"] if a.task == "both" else [a.task]):
        train_task(t, a.sample)


if __name__ == "__main__":
    main()
