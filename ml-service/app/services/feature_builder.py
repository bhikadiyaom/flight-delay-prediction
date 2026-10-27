"""Feature construction shared by training and serving (guards against train/serve skew).

`build_features` turns raw flight rows (airline, origin, dest, date, time-of-day label, distance, daily weather)
into the model matrix. Everything learned from data (frequency encoders, delay-history lookups, weather medians)
comes from a `Lookups` object that training writes to artifacts/ and serving loads once at startup.

`validate_against_manifest` must be called at load time: if the manifest's feature list differs from
FEATURE_COLUMNS the service refuses to start (docs/CONTEXT.md section 9.11).
"""
from __future__ import annotations

import json
from dataclasses import dataclass, field
from datetime import date
from pathlib import Path

import numpy as np
import pandas as pd

from app.services import weather_severity as ws
from app.utils.holidays import holiday_distance, us_federal_holidays
from training.encoders import FrequencyEncoder

DEP_TIME_LABELS = ["Night", "Morning", "Afternoon", "Evening"]
WEATHER_INPUTS = ["prcp", "snow", "wspd", "tavg", "tmin"]   # per end: o_<name> / d_<name>

ROLL_COLS = ["airline_delay_roll", "origin_delay_roll", "dest_delay_roll",
             "airline_cancel_roll", "origin_cancel_roll", "dest_cancel_roll"]

FEATURE_COLUMNS = [
    # calendar / time
    # `month` is deliberately NOT a feature: training covers Jan-Aug only, so Oct-Dec month values are unseen and
    # the tree splits cannot extrapolate (ablation: neutral for delay, +0.02 val AUC for cancel without it).
    "dep_time_idx", "day_of_week", "is_weekend", "is_holiday", "holiday_distance",
    # route
    "distance_miles", "airline_freq", "origin_freq", "dest_freq", "route_freq",
    "route_daily_avg", "origin_daily_avg",
    # delay / cancel history (rolling snapshot + static smoothed rates)
    *ROLL_COLS, "route_delay_rate", "origin_time_delay_rate",
    # weather (coarse bands, comparable between observed training data and forecasts)
    "o_prcp_band", "o_snow_band", "o_wind_band", "o_freeze", "o_severity", "o_tavg",
    "d_prcp_band", "d_snow_band", "d_wind_band", "d_freeze", "d_severity", "d_tavg",
    "weather_missing",
]


def hour_to_label(hour: int) -> str:
    """Night 00-05, Morning 06-11, Afternoon 12-17, Evening 18-23 (matches the label shares in the dataset)."""
    return DEP_TIME_LABELS[0 if hour < 6 else 1 if hour < 12 else 2 if hour < 18 else 3]


@dataclass
class Lookups:
    enc_airline: FrequencyEncoder
    enc_origin: FrequencyEncoder
    enc_dest: FrequencyEncoder
    enc_route: FrequencyEncoder
    static: dict
    rolling_snapshot: dict
    weather_medians: dict
    extras: dict = field(default_factory=dict)

    @classmethod
    def load(cls, artifacts_dir: Path) -> "Lookups":
        a = Path(artifacts_dir)
        enc = a / "encoders"
        lk = a / "lookups"
        need = [enc / f"freq_{n}.json" for n in ("airline", "origin", "dest", "route")]
        need += [lk / "static_lookups.json", lk / "rolling_snapshot.json", lk / "weather_medians.json"]
        missing = [str(p) for p in need if not p.exists()]
        if missing:
            raise FileNotFoundError(f"missing lookup artifacts: {missing}")
        return cls(
            enc_airline=FrequencyEncoder.from_json(enc / "freq_airline.json"),
            enc_origin=FrequencyEncoder.from_json(enc / "freq_origin.json"),
            enc_dest=FrequencyEncoder.from_json(enc / "freq_dest.json"),
            enc_route=FrequencyEncoder.from_json(enc / "freq_route.json"),
            static=json.loads((lk / "static_lookups.json").read_text()),
            rolling_snapshot=json.loads((lk / "rolling_snapshot.json").read_text()),
            weather_medians=json.loads((lk / "weather_medians.json").read_text()),
        )


def validate_against_manifest(manifest: dict) -> None:
    got = manifest.get("feature_columns")
    if got != FEATURE_COLUMNS:
        only_m = [c for c in (got or []) if c not in FEATURE_COLUMNS]
        only_c = [c for c in FEATURE_COLUMNS if c not in (got or [])]
        raise RuntimeError(
            "feature mismatch between manifest.json and feature_builder.FEATURE_COLUMNS "
            f"(only in manifest: {only_m}, only in code: {only_c}, or order differs). Retrain / regenerate the manifest.")


def _impute_weather(df: pd.DataFrame, lk: Lookups) -> pd.DataFrame:
    """Fill NaN weather with airport-month medians (then global month medians). Returns df + imputed mask column."""
    df = df.copy()
    month = pd.to_datetime(df["flight_date"]).dt.month.to_numpy()
    imputed = np.zeros(len(df), dtype=bool)
    gm = lk.weather_medians.get("_month", {})
    for end, airport_col in (("o", "origin"), ("d", "dest")):
        keys = (df[airport_col].astype(str) + "|" + pd.Series(month, index=df.index).astype(str))
        for name in WEATHER_INPUTS:
            col = f"{end}_{name}"
            if col not in df:
                df[col] = np.nan
            vals = df[col].astype("float64")
            nan = vals.isna().to_numpy()
            if nan.any():
                am = keys.map(lambda k, n=name: lk.weather_medians.get(k, {}).get(n))
                fill = pd.Series(am, index=df.index).astype("float64")
                fb = pd.Series(month, index=df.index).map(lambda m, n=name: gm.get(str(m), {}).get(n)).astype("float64")
                vals = vals.fillna(fill).fillna(fb)
                imputed |= nan
            df[col] = vals
    df["_weather_imputed"] = imputed
    return df


def build_features(df: pd.DataFrame, lk: Lookups) -> pd.DataFrame:
    """Raw rows -> float32 matrix with columns exactly FEATURE_COLUMNS.

    Required columns: airline, origin, dest, flight_date, dep_time_label, distance_miles and
    o_/d_ {prcp, snow, wspd, tavg, tmin} (NaN allowed -> imputed, weather_missing=1).
    If the ROLL_COLS are present they are used as is (training); otherwise the shipped snapshot is looked up.
    """
    df = _impute_weather(df.reset_index(drop=True), lk)
    n = len(df)
    dates = pd.to_datetime(df["flight_date"])
    out = pd.DataFrame(index=df.index)

    # calendar
    out["dep_time_idx"] = df["dep_time_label"].map({l: i for i, l in enumerate(DEP_TIME_LABELS)}).fillna(1).astype("float32")
    out["day_of_week"] = ((dates.dt.day_of_week + 1) % 7).astype("float32")   # Sunday=0 like the source data
    out["is_weekend"] = (dates.dt.day_of_week >= 5).astype("float32")
    uniq = pd.Series(dates.dt.date.unique())
    hd = {d: holiday_distance(d) for d in uniq}
    hol = {d: float(d in us_federal_holidays(d.year)) for d in uniq}
    day = dates.dt.date
    out["is_holiday"] = day.map(hol).astype("float32")
    out["holiday_distance"] = day.map(hd).astype("float32")

    # route + encoders
    route = df["origin"].astype(str) + "-" + df["dest"].astype(str)
    out["distance_miles"] = df["distance_miles"].astype("float32")
    out["airline_freq"] = lk.enc_airline.transform(df["airline"])
    out["origin_freq"] = lk.enc_origin.transform(df["origin"])
    out["dest_freq"] = lk.enc_dest.transform(df["dest"])
    out["route_freq"] = lk.enc_route.transform(route)
    st = lk.static
    out["route_daily_avg"] = route.map(st["route_daily_avg"]).fillna(0.0).astype("float32")
    out["origin_daily_avg"] = df["origin"].astype(str).map(st["origin_daily_avg"]).fillna(0.0).astype("float32")

    # history: rolling snapshot unless precomputed
    snap = lk.rolling_snapshot
    src = {"airline_delay_roll": ("airline_delay", "airline"), "origin_delay_roll": ("origin_delay", "origin"),
           "dest_delay_roll": ("dest_delay", "dest"), "airline_cancel_roll": ("airline_cancel", "airline"),
           "origin_cancel_roll": ("origin_cancel", "origin"), "dest_cancel_roll": ("dest_cancel", "dest")}
    for col, (table, key) in src.items():
        if col in df:
            out[col] = df[col].astype("float32")
        else:
            prior = snap["priors"]["delay" if "delay" in table else "cancel"]
            out[col] = df[key].astype(str).map(snap[table]).fillna(prior).astype("float32")
    out["route_delay_rate"] = route.map(st["route_delay_rate"]).fillna(st["priors"]["delay_rate"]).astype("float32")
    key = df["origin"].astype(str) + "|" + df["dep_time_label"].astype(str)
    out["origin_time_delay_rate"] = key.map(st["origin_time_delay_rate"]).fillna(st["priors"]["delay_rate"]).astype("float32")

    # weather bands + severity
    for end in ("o", "d"):
        pb, sb, wb = ws.prcp_band(df[f"{end}_prcp"]), ws.snow_band(df[f"{end}_snow"]), ws.wind_band(df[f"{end}_wspd"])
        fr = ws.freeze_flag(df[f"{end}_tmin"])
        out[f"{end}_prcp_band"], out[f"{end}_snow_band"], out[f"{end}_wind_band"], out[f"{end}_freeze"] = pb, sb, wb, fr
        out[f"{end}_severity"] = ws.severity(pb, sb, wb, fr)
        out[f"{end}_tavg"] = df[f"{end}_tavg"].astype("float32")
    miss = df["_weather_imputed"].to_numpy()
    for c in ("origin_weather_missing", "dest_weather_missing"):
        if c in df:
            miss = miss | (df[c].to_numpy() == 1)
    out["weather_missing"] = miss.astype("float32")

    assert len(out) == n
    return out[FEATURE_COLUMNS].astype("float32")
