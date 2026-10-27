"""Merge per-model result files into artifacts/metrics/model_metrics.json and write models/manifest.json.

    python -m training.compare_models [--sample 0.15]

Run after train_baseline, train_random_forest, train_xgboost, train_neural_net, train_regressor.
The manifest is what serving trusts: exact feature order, production artifacts, thresholds, risk bands.
"""
import argparse
import hashlib
import json
import logging
from datetime import datetime, timezone

import xgboost

from app.services.feature_builder import DEP_TIME_LABELS, FEATURE_COLUMNS
from training import config as C
from training.evaluate import save_json

log = logging.getLogger("compare_models")

RISK_LEVELS = {  # calibrated probabilities; low < medium <= p < high <= p
    "delay": {"medium": 0.20, "high": 0.40},
    "cancel": {"medium": 0.03, "high": 0.08},
}
CLASSIFIER_FILES = {"logreg": "logreg_delay.json", "random_forest": "random_forest_delay.json",
                    "xgboost": "xgboost_delay.json", "neural_net": "neural_net_delay.json"}


def _load(metrics_dir, name):
    p = metrics_dir / name
    return json.loads(p.read_text()) if p.exists() else None


def _entry(res: dict, version: str, production: bool) -> dict:
    t = res["test"]
    m = dict(t["metrics"]) if "metrics" in t else dict(t)
    return {
        "model_name": res["model_name"], "task": res["task"], "target": res.get("target"),
        "version": version, "is_production": production, "threshold": res.get("threshold"),
        "metrics": m, "per_class": t.get("per_class"), "confusion_matrix": t.get("confusion_matrix"),
        "validation_metrics": (res.get("validation") or {}).get("metrics", res.get("validation")),
        "n_train": res.get("n_train"), "seconds": res.get("seconds"),
    }


def main() -> None:
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(name)s %(message)s")
    ap = argparse.ArgumentParser()
    ap.add_argument("--sample", type=float, default=None)
    a = ap.parse_args()
    models_dir, metrics_dir = C.run_dirs(a.sample)

    trained_at = datetime.now(timezone.utc).isoformat(timespec="seconds")
    fhash = hashlib.sha1(",".join(FEATURE_COLUMNS).encode()).hexdigest()[:6]
    version = f"v{trained_at[:10].replace('-', '')}-{fhash}" + ("-sample" if a.sample else "")

    clf = {k: _load(metrics_dir, f) for k, f in CLASSIFIER_FILES.items()}
    cancel = _load(metrics_dir, "xgboost_cancel.json")
    reg = _load(metrics_dir, "xgboost_regressor.json")
    rnd = _load(metrics_dir, "xgboost_delay_random_split.json")
    missing = [k for k, v in clf.items() if v is None] + [n for n, v in (("cancel", cancel), ("regressor", reg)) if v is None]
    if missing:
        raise SystemExit(f"missing results for: {missing}. Run the trainers first.")

    models = [_entry(clf[k], version, k == "xgboost") for k in CLASSIFIER_FILES]
    models.append(_entry(cancel, version, True))
    models.append({"model_name": "xgboost", "task": "regressor", "target": "delay_minutes", "version": version,
                   "is_production": True, "threshold": None, "metrics": reg["test"],
                   "validation_metrics": reg["validation"], "n_train": reg["n_train"],
                   "extra": {"test_vs_raw_unwinsorized": reg["test_vs_raw_unwinsorized"],
                             "baseline_median": reg["baseline_median_test"], "winsor_cap_minutes": reg["winsor_cap_minutes"]}})

    out = {
        "version": version, "generated_at": trained_at, "sample_run": a.sample,
        "split": {"train": "Jan-Aug (fit)", "validation": "September (early stopping + isotonic calibration)",
                  "test": "Oct-Dec (held out in time)"},
        "production_model": "xgboost",
        "models": models,
        "roc": {k: clf[k]["roc"] for k in CLASSIFIER_FILES},
        "calibration": {"delay": clf["xgboost"]["calibration"], "cancel": cancel["calibration"]},
        "feature_importance": clf["xgboost"]["feature_importance"],
        "random_split_experiment": rnd,
        "time_split_vs_random_split_note": (
            "A random split mixes every month and lets the model see the same weather episodes and seasonal delay "
            "levels as its test rows, so it scores higher than the honest time split. Oct-Dec also has a much lower "
            "base delay rate than the training months, which lowers precision and F1 for any model."),
    }
    save_json(metrics_dir / "model_metrics.json", out)

    manifest = {
        "version": version, "trained_at": trained_at, "xgboost_version": xgboost.__version__,
        "feature_columns": FEATURE_COLUMNS, "dep_time_labels": DEP_TIME_LABELS,
        "models": {
            "delay_clf": {"file": clf["xgboost"]["artifact"], "calibrator": clf["xgboost"]["calibrator"],
                          "threshold": clf["xgboost"]["threshold"], "production": True},
            "cancel_clf": {"file": cancel["artifact"], "calibrator": cancel["calibrator"],
                           "threshold": cancel["threshold"], "production": True},
            "delay_reg": {"file": reg["artifact"], "objective": reg["objective"],
                          "min_minutes": reg["min_minutes"], "winsor_cap_minutes": reg["winsor_cap_minutes"],
                          "production": True},
        },
        "risk_levels": RISK_LEVELS,
        "delay_threshold_minutes": C.DELAY_THRESHOLD_MIN,
        "shap_background": "shap_background.parquet",
        "split": out["split"],
    }
    save_json(models_dir / "manifest.json", manifest)

    print(f"\nversion {version}\n")
    hdr = f"{'model':<14}{'task':<11}{'target':<14}{'acc':>7}{'prec':>7}{'rec':>7}{'f1':>7}{'auc':>7}{'brier':>8}"
    print(hdr + "\n" + "-" * len(hdr))
    for m in models:
        x = m["metrics"]
        if m["task"] == "classifier":
            print(f"{m['model_name']:<14}{'clf':<11}{m['target']:<14}{x['accuracy']:7.3f}{x['precision']:7.3f}"
                  f"{x['recall']:7.3f}{x['f1']:7.3f}{x['roc_auc']:7.3f}{x['brier']:8.4f}")
        else:
            print(f"{m['model_name']:<14}{'reg':<11}{m['target']:<14} MAE {x['mae']:.2f} min  RMSE {x['rmse']:.2f}  R2 {x['r2']:.3f}")
    if rnd:
        r = rnd["test"]["metrics"]
        print(f"\nrandom-split XGBoost (not deployable): auc {r['roc_auc']:.3f} f1 {r['f1']:.3f}")


if __name__ == "__main__":
    main()
