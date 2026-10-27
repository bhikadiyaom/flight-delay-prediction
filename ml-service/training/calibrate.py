"""Isotonic calibration on the validation slice (Decision 9).

Class weights make raw XGBoost probabilities too high. An isotonic map fitted on September (held out from the
tree fit except for early stopping) turns them into real probabilities for the gauge.
"""
import numpy as np
from sklearn.isotonic import IsotonicRegression

from training.evaluate import calibration_points
from sklearn.metrics import brier_score_loss


def fit_isotonic(y_val, p_val) -> IsotonicRegression:
    iso = IsotonicRegression(y_min=0.0, y_max=1.0, out_of_bounds="clip")
    iso.fit(np.asarray(p_val, dtype="float64"), np.asarray(y_val, dtype="float64"))
    return iso


def calibration_report(y, p_raw, p_cal) -> dict:
    return {
        "brier_before": float(brier_score_loss(y, p_raw)),
        "brier_after": float(brier_score_loss(y, p_cal)),
        "curve_before": calibration_points(y, p_raw),
        "curve_after": calibration_points(y, p_cal),
    }
