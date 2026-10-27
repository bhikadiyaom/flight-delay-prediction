"""Metric helpers shared by all trainers (classification, regression, calibration, ROC points)."""
import json
from pathlib import Path

import numpy as np
from sklearn.calibration import calibration_curve
from sklearn.metrics import (average_precision_score, brier_score_loss, confusion_matrix, f1_score,
                             mean_absolute_error, mean_squared_error, precision_recall_curve,
                             precision_recall_fscore_support, r2_score, roc_auc_score, roc_curve)


def best_f1_threshold(y_true, p) -> float:
    prec, rec, thr = precision_recall_curve(y_true, p)
    f1 = 2 * prec[:-1] * rec[:-1] / np.clip(prec[:-1] + rec[:-1], 1e-12, None)
    return float(thr[int(np.argmax(f1))])


def clf_metrics(y_true, p, threshold: float) -> dict:
    y_true = np.asarray(y_true).astype(int)
    pred = (np.asarray(p) >= threshold).astype(int)
    prec, rec, f1, sup = precision_recall_fscore_support(y_true, pred, labels=[0, 1], zero_division=0)
    cm = confusion_matrix(y_true, pred, labels=[0, 1])
    return {
        "threshold": float(threshold),
        "metrics": {
            "accuracy": float((pred == y_true).mean()),
            "precision": float(prec[1]), "recall": float(rec[1]), "f1": float(f1[1]),
            "roc_auc": float(roc_auc_score(y_true, p)),
            "pr_auc": float(average_precision_score(y_true, p)),
            "brier": float(brier_score_loss(y_true, p)),
            "positive_rate": float(y_true.mean()),
        },
        "per_class": {str(i): {"precision": float(prec[i]), "recall": float(rec[i]), "f1": float(f1[i]),
                               "support": int(sup[i])} for i in (0, 1)},
        "confusion_matrix": cm.tolist(),   # [[tn, fp], [fn, tp]]
    }


def roc_points(y_true, p, n: int = 60) -> list[dict]:
    fpr, tpr, _ = roc_curve(y_true, p)
    idx = np.unique(np.linspace(0, len(fpr) - 1, n).astype(int))
    return [{"fpr": float(fpr[i]), "tpr": float(tpr[i])} for i in idx]


def calibration_points(y_true, p, bins: int = 10) -> list[dict]:
    frac, mean_pred = calibration_curve(y_true, p, n_bins=bins, strategy="quantile")
    return [{"predicted": float(a), "observed": float(b)} for a, b in zip(mean_pred, frac)]


def reg_metrics(y_true, pred) -> dict:
    return {
        "mae": float(mean_absolute_error(y_true, pred)),
        "rmse": float(np.sqrt(mean_squared_error(y_true, pred))),
        "r2": float(r2_score(y_true, pred)),
    }


def classifier_result(model_name: str, yva, p_va, yte, p_te, **extra) -> dict:
    """Result record for a metrics-only comparison model (threshold = best F1 on validation)."""
    thr = best_f1_threshold(yva, p_va)
    return {"model_name": model_name, "task": "classifier", "target": "delay", "threshold": thr,
            "validation": clf_metrics(yva, p_va, thr), "test": clf_metrics(yte, p_te, thr),
            "roc": roc_points(yte, p_te), **extra}


def save_json(path: Path, obj) -> None:
    Path(path).parent.mkdir(parents=True, exist_ok=True)
    Path(path).write_text(json.dumps(obj, indent=2))
