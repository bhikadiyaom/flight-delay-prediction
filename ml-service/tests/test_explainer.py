import numpy as np
import pandas as pd

from app.services.explainer import format_value
from app.services.feature_builder import FEATURE_COLUMNS, build_features


def _row(bundle, **over):
    base = {"airline": "Delta Air Lines Inc", "origin": "ORD", "dest": "LGA", "flight_date": pd.Timestamp("2023-01-10"),
            "dep_time_label": "Evening", "distance_miles": 733.0,
            "o_prcp": 12.0, "o_snow": 80.0, "o_wspd": 35.0, "o_tavg": -5.0, "o_tmin": -9.0,
            "d_prcp": 0.0, "d_snow": 0.0, "d_wspd": 10.0, "d_tavg": 2.0, "d_tmin": -2.0}
    base.update(over)
    return build_features(pd.DataFrame([base]), bundle.lookups)


def test_top_factors_sorted_and_signed(bundle):
    X = _row(bundle)
    f = bundle.explainer.explain(X)
    assert len(f) == 5
    assert [abs(x.shap_value) for x in f] == sorted((abs(x.shap_value) for x in f), reverse=True)
    assert {x.feature for x in f} <= set(FEATURE_COLUMNS)
    assert all((x.shap_value > 0) == (x.direction == "increases_delay_risk") for x in f)


def test_shap_is_additive_over_the_model_margin(bundle):
    """base value + sum(all SHAP values) == raw log-odds of the delay classifier."""
    X = _row(bundle)
    sv = bundle.explainer.explainer.shap_values(X)[0]
    p = float(bundle.delay_clf.predict_proba(X)[0, 1])
    logit = np.log(p / (1 - p))
    assert abs(bundle.explainer.base_value + sv.sum() - logit) < 1e-2


def test_winter_storm_is_explained_by_weather_features(bundle):
    names = {x.feature for x in bundle.explainer.explain(_row(bundle))}
    assert names & {"o_prcp_band", "o_snow_band", "o_severity", "o_wind_band", "o_freeze"}


def test_value_formatting():
    assert format_value("dep_time_idx", 3.0) == "Evening"
    assert format_value("day_of_week", 0.0) == "Sunday"
    assert format_value("is_holiday", 1.0) == "yes"
    assert format_value("o_snow_band", 2.0) == "moderate"
    assert format_value("distance_miles", 733.4) == "733"
