"""Pure prediction functions: features in, prediction out (Decision 8). No network calls, no state besides the bundle.

Contract rules (docs/CONTEXT.md section 10): missing weather -> airport-month median + a `warnings` entry, never a 500;
the regressor only runs when delay_probability >= the classifier threshold.
"""
import numpy as np
import pandas as pd

from app.schemas.predict_schema import PredictRequest, PredictResponse, WeatherInput
from app.services.feature_builder import build_features, hour_to_label
from app.services.model_loader import ModelBundle
from app.utils.airport_lookup import resolve_airline

TMIN_BELOW_MEAN_C = 5.1   # training median (tavg - tmin), used when only a mean temperature is supplied
WEATHER_FIELDS = ("temperature_c", "precipitation_mm", "wind_speed_kmh", "snowfall_cm")


def _weather_columns(prefix: str, w: WeatherInput | None) -> dict:
    """WeatherInput (daily units) -> training columns {prefix}_prcp/snow/wspd/tavg/tmin (NaN when absent)."""
    nan = float("nan")
    if w is None:
        return {f"{prefix}_{k}": nan for k in ("prcp", "snow", "wspd", "tavg", "tmin")}
    tmin = w.temperature_min_c
    if tmin is None and w.temperature_c is not None:
        tmin = w.temperature_c - TMIN_BELOW_MEAN_C
    return {
        f"{prefix}_prcp": nan if w.precipitation_mm is None else w.precipitation_mm,
        f"{prefix}_snow": nan if w.snowfall_cm is None else w.snowfall_cm * 10.0,   # cm -> mm
        f"{prefix}_wspd": nan if w.wind_speed_kmh is None else w.wind_speed_kmh,
        f"{prefix}_tavg": nan if w.temperature_c is None else w.temperature_c,
        f"{prefix}_tmin": nan if tmin is None else tmin,
    }


def _weather_warning(end: str, airport: str, w: WeatherInput | None) -> str | None:
    if w is None or all(getattr(w, f) is None for f in WEATHER_FIELDS):
        return f"{end} weather not supplied: used typical values for {airport} in this month"
    missing = [f for f in WEATHER_FIELDS if getattr(w, f) is None]
    if missing:
        return f"{end} weather incomplete ({', '.join(missing)} missing): filled with typical values for {airport}"
    return None


def requests_to_frame(reqs: list[PredictRequest], bundle: ModelBundle) -> tuple[pd.DataFrame, list[list[str]]]:
    rows, warns = [], []
    enc = bundle.lookups
    for r in reqs:
        w: list[str] = []
        airline = resolve_airline(r.airline)
        if airline not in enc.enc_airline.freq:
            w.append(f"airline '{r.airline}' not seen in training data: using a neutral encoding")
        for code in (r.origin, r.destination):
            if code not in enc.enc_origin.freq and code not in enc.enc_dest.freq:
                w.append(f"airport {code} not seen in training data: using a neutral encoding")
        dist = r.distance_miles if r.distance_miles is not None else bundle.airports.distance_miles(r.origin, r.destination)
        if dist is None:
            w.append("distance unknown (airport coordinates not found); prediction less reliable")
            dist = float("nan")
        for end, code, wx in (("origin", r.origin, r.origin_weather), ("destination", r.destination, r.dest_weather)):
            msg = _weather_warning(end, code, wx)
            if msg:
                w.append(msg)
        sd = r.scheduled_departure
        rows.append({
            "airline": airline, "origin": r.origin, "dest": r.destination,
            "flight_date": pd.Timestamp(sd.year, sd.month, sd.day), "dep_time_label": hour_to_label(sd.hour),
            "distance_miles": dist,
            **_weather_columns("o", r.origin_weather), **_weather_columns("d", r.dest_weather),
        })
        warns.append(w)
    return pd.DataFrame(rows), warns


def _level(p: float, medium: float, high: float) -> int:
    return 2 if p >= high else 1 if p >= medium else 0


def predict_frame(bundle: ModelBundle, X: pd.DataFrame) -> dict:
    """Vectorised model calls on a built feature matrix."""
    cal_d = bundle.cal_delay.predict(bundle.delay_clf.predict_proba(X)[:, 1])
    cal_c = bundle.cal_cancel.predict(bundle.cancel_clf.predict_proba(X)[:, 1])
    minutes = np.full(len(X), np.nan)
    mask = cal_d >= bundle.delay_threshold
    if mask.any():
        reg = bundle.manifest["models"]["delay_reg"]
        minutes[mask] = np.maximum(bundle.delay_reg.predict(X[mask]), reg["min_minutes"])
    rl = bundle.manifest["risk_levels"]
    levels = [max(_level(d, **rl["delay"]), _level(c, **rl["cancel"])) for d, c in zip(cal_d, cal_c)]
    return {"delay": cal_d, "cancel": cal_c, "minutes": minutes, "levels": levels}


RISK_NAMES = ("low", "medium", "high")


def predict_many(bundle: ModelBundle, reqs: list[PredictRequest], explain: bool = False) -> list[PredictResponse]:
    df, warns = requests_to_frame(reqs, bundle)
    X = build_features(df, bundle.lookups)
    out = predict_frame(bundle, X)
    results = []
    for i in range(len(reqs)):
        m = out["minutes"][i]
        results.append(PredictResponse(
            delay_probability=round(float(out["delay"][i]), 4),
            cancel_probability=round(float(out["cancel"][i]), 4),
            predicted_delay_minutes=None if np.isnan(m) else round(float(m), 1),
            risk_level=RISK_NAMES[out["levels"][i]],
            top_factors=bundle.explainer.explain(X.iloc[[i]]) if explain else [],
            model_version=bundle.version, warnings=warns[i]))
    return results


def predict_one(bundle: ModelBundle, req: PredictRequest) -> PredictResponse:
    return predict_many(bundle, [req], explain=True)[0]
