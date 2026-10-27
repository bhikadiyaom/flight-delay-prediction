"""Fit train-only lookups, then build the model feature matrix month by month.

    python -m training.feature_engineering          # fits lookups on Jan-Aug, writes data/processed/features/

Leakage controls (Decisions 5, 6):
  * frequency encoders, static delay rates, daily-average congestion: fitted on Jan-Aug only (September is the
    validation/calibration month and stays unseen by every lookup).
  * rolling 28-day delay/cancel history uses PRIOR days only. Months Jan-Sep use the true rolling value; Oct-Dec
    (test) use the shipped snapshot taken on 2023-10-01, i.e. exactly what a deployed model without a daily refresh
    would see. The `*_roll_all` copies (true rolling for every month) exist only for the random-split experiment.
"""
import json
import logging
import time
from datetime import date

import duckdb
import numpy as np
import pandas as pd

from app.services.feature_builder import FEATURE_COLUMNS, ROLL_COLS, WEATHER_INPUTS, Lookups, build_features
from training import config as C
from training.encoders import FrequencyEncoder

log = logging.getLogger("feature_engineering")

SMOOTH_K = 50          # shrinkage strength toward the prior for rates
ROLL_WINDOW = 28       # days
SNAPSHOT_DATE = pd.Timestamp("2023-10-01")
SPLIT_OF_MONTH = {**{m: "train" for m in range(1, 9)}, 9: "valid", **{m: "test" for m in (10, 11, 12)}}
ROLL_ALL_COLS = [c + "_all" for c in ROLL_COLS]


def _g() -> str:
    return str(C.FLIGHTS_GLOB).replace("\\", "/")


def _rolling_wide(daily: pd.DataFrame, entity: str, prior_d: float, prior_c: float):
    """date x entity tables of 28-day (prior days only) smoothed delay and cancel rates."""
    dates = pd.date_range("2023-01-01", "2023-12-31")
    wide = {}
    for col in ("n_all", "canc", "dly", "n_nc"):
        p = daily.pivot_table(index="flight_date", columns=entity, values=col, aggfunc="sum")
        p.index = pd.to_datetime(p.index)
        p = p.reindex(dates).fillna(0.0)
        wide[col] = p.rolling(ROLL_WINDOW, min_periods=1).sum().shift(1).fillna(0.0)
    delay = (wide["dly"] + SMOOTH_K * prior_d) / (wide["n_nc"] + SMOOTH_K)
    cancel = (wide["canc"] + SMOOTH_K * prior_c) / (wide["n_all"] + SMOOTH_K)
    return delay, cancel


def fit_lookups() -> dict:
    """Fit encoders + lookups on Jan-Aug, write them to artifacts/, return rolling tables for transform."""
    C.ENCODERS_DIR.mkdir(parents=True, exist_ok=True)
    C.LOOKUPS_DIR.mkdir(parents=True, exist_ok=True)
    con = duckdb.connect()
    con.execute("SET memory_limit='1500MB'")
    con.execute("SET threads=2")
    g, tm = _g(), C.TRAIN_MONTHS[-1] - 1  # Jan-Aug = months <= 8 (September is validation)
    train_where = f"month <= {tm}"

    # ---- frequency encoders ------------------------------------------------------------------
    for name, expr in (("airline", "airline"), ("origin", "origin"), ("dest", "dest"),
                       ("route", "origin || '-' || dest")):
        counts = con.execute(
            f"SELECT {expr} AS k, count(*) AS n FROM read_parquet('{g}') WHERE {train_where} GROUP BY 1").df()
        FrequencyEncoder(name).fit(counts.set_index("k")["n"]).to_json(C.ENCODERS_DIR / f"freq_{name}.json")

    # ---- priors and static smoothed rates ------------------------------------------------------
    prior_d, prior_c, n_days = con.execute(
        f"""SELECT avg((arr_delay >= {C.DELAY_THRESHOLD_MIN})::INT) FILTER (WHERE is_cancelled=0),
                   avg(is_cancelled), count(DISTINCT flight_date)
            FROM read_parquet('{g}') WHERE {train_where}""").fetchone()
    k = SMOOTH_K

    def rate_table(key_expr: str) -> dict:
        df = con.execute(
            f"""SELECT {key_expr} AS k, sum((arr_delay >= {C.DELAY_THRESHOLD_MIN})::INT) AS d, count(*) AS n
                FROM read_parquet('{g}') WHERE {train_where} AND is_cancelled=0 GROUP BY 1""").df()
        return dict(zip(df["k"], ((df["d"] + k * prior_d) / (df["n"] + k)).astype(float)))

    def daily_avg(key_expr: str) -> dict:
        df = con.execute(
            f"SELECT {key_expr} AS k, count(*) AS n FROM read_parquet('{g}') WHERE {train_where} GROUP BY 1").df()
        return dict(zip(df["k"], (df["n"] / n_days).astype(float)))

    static = {
        "priors": {"delay_rate": float(prior_d), "cancel_rate": float(prior_c)},
        "route_delay_rate": rate_table("origin || '-' || dest"),
        "origin_time_delay_rate": rate_table("origin || '|' || dep_time_label"),
        "route_daily_avg": daily_avg("origin || '-' || dest"),
        "origin_daily_avg": daily_avg("origin"),
        "fitted_on_months": f"1-{tm}",
    }
    (C.LOOKUPS_DIR / "static_lookups.json").write_text(json.dumps(static))

    # ---- rolling history (prior days only) + snapshot ----------------------------------------------
    rolling, snapshot = {}, {"as_of": str(SNAPSHOT_DATE.date()), "window_days": ROLL_WINDOW,
                             "priors": {"delay": float(prior_d), "cancel": float(prior_c)}}
    for entity in ("airline", "origin", "dest"):
        daily = con.execute(
            f"""SELECT {entity} AS {entity}, flight_date, count(*) AS n_all, sum(is_cancelled) AS canc,
                       count(*) FILTER (WHERE is_cancelled=0) AS n_nc,
                       sum((arr_delay >= {C.DELAY_THRESHOLD_MIN})::INT) FILTER (WHERE is_cancelled=0) AS dly
                FROM read_parquet('{g}') GROUP BY 1, 2""").df().fillna(0)
        delay, cancel = _rolling_wide(daily, entity, prior_d, prior_c)
        rolling[f"{entity}_delay"], rolling[f"{entity}_cancel"] = delay, cancel
        snapshot[f"{entity}_delay"] = delay.loc[SNAPSHOT_DATE].astype(float).to_dict()
        snapshot[f"{entity}_cancel"] = cancel.loc[SNAPSHOT_DATE].astype(float).to_dict()
    (C.LOOKUPS_DIR / "rolling_snapshot.json").write_text(json.dumps(snapshot))

    # ---- weather medians (airport-month, then month) for NaN weather at serving ---------------------------
    wcols = ", ".join(f"median({v}) AS {v}" for v in WEATHER_INPUTS)
    wp = str(C.WEATHER_PARQUET).replace("\\", "/")
    am = con.execute(f"SELECT airport, month, {wcols} FROM read_parquet('{wp}') GROUP BY 1, 2").df()
    mm = con.execute(f"SELECT month, {wcols} FROM read_parquet('{wp}') GROUP BY 1").df()
    med = {f"{r.airport}|{int(r.month)}": {v: float(getattr(r, v)) for v in WEATHER_INPUTS} for r in am.itertuples()}
    med["_month"] = {str(int(r.month)): {v: float(getattr(r, v)) for v in WEATHER_INPUTS} for r in mm.itertuples()}
    (C.LOOKUPS_DIR / "weather_medians.json").write_text(json.dumps(med))
    log.info("lookups fitted: prior_delay=%.4f prior_cancel=%.4f routes=%d", prior_d, prior_c, len(static["route_delay_rate"]))
    return rolling


def _attach_rolling(df: pd.DataFrame, rolling: dict, month: int) -> pd.DataFrame:
    """Add *_roll_all (true rolling) and *_roll (true for months<=9, snapshot for Oct-Dec)."""
    dates = pd.to_datetime(df["flight_date"])
    for entity in ("airline", "origin", "dest"):
        mi = pd.MultiIndex.from_arrays([dates, df[entity].astype(str)])
        for kind in ("delay", "cancel"):
            wide = rolling[f"{entity}_{kind}"]
            wide.columns = wide.columns.astype(str)
            df[f"{entity}_{kind}_roll_all"] = wide.stack().reindex(mi).to_numpy()
    return df


def build_all() -> dict:
    t0 = time.time()
    rolling = fit_lookups()
    lk = Lookups.load(C.ARTIFACTS_DIR)
    C.FEATURES_DIR.mkdir(parents=True, exist_ok=True)
    con = duckdb.connect()
    con.execute("SET memory_limit='1500MB'")
    cols = ["flight_date", "airline", "origin", "dest", "dep_time_label", "distance_miles", "arr_delay",
            "is_cancelled", "origin_weather_missing", "dest_weather_missing",
            *[f"{e}_{v}" for e in ("o", "d") for v in WEATHER_INPUTS]]
    summary = {}
    for month in range(1, 13):
        f = str(C.FLIGHTS_DIR / f"flights_{month:02d}.parquet").replace("\\", "/")
        df = con.execute(f"SELECT {', '.join(cols)} FROM read_parquet('{f}')").df()
        df = _attach_rolling(df, rolling, month)
        for c in ROLL_COLS:                       # model input: true rolling up to Sep, snapshot in Oct-Dec
            df[c] = df[c + "_all"]
        if month >= 10:
            df = df.drop(columns=ROLL_COLS)       # builder falls back to the shipped snapshot
        X = build_features(df, lk)
        out = X.copy()
        for c in ROLL_ALL_COLS:
            out[c] = df[c].astype("float32").to_numpy()
        cancelled = df["is_cancelled"].to_numpy() == 1
        out["is_cancelled"] = cancelled.astype("int8")
        out["is_delayed"] = np.where(cancelled, -1, (df["arr_delay"].to_numpy() >= C.DELAY_THRESHOLD_MIN)).astype("int8")
        out["arr_delay"] = df["arr_delay"].astype("float32").to_numpy()
        out["flight_date"] = pd.to_datetime(df["flight_date"]).to_numpy()
        out["split"] = SPLIT_OF_MONTH[month]
        out.to_parquet(C.FEATURES_DIR / f"features_{month:02d}.parquet", index=False, compression="zstd")
        summary[month] = len(out)
        log.info("features month %02d rows=%d split=%s", month, len(out), SPLIT_OF_MONTH[month])
    log.info("done in %.0fs", time.time() - t0)
    return summary


# ---------------------------------------------------------------------------------------------- loaders
def load_xy(split, task: str, sample: float | None = None, seed: int = C.RANDOM_STATE,
            random_split_rolling: bool = False):
    """Return (X float32 DataFrame, y ndarray) for split(s) 'train' | 'valid' | 'test' and task
    'delay' | 'cancel' | 'regressor' (regressor target = raw arr_delay of delayed flights, un-winsorized)."""
    splits = [split] if isinstance(split, str) else list(split)
    months = [m for m, s in SPLIT_OF_MONTH.items() if s in splits]
    cols = FEATURE_COLUMNS + ["is_cancelled", "is_delayed", "arr_delay"] + (ROLL_ALL_COLS if random_split_rolling else [])
    if task not in ("delay", "cancel", "regressor"):
        raise ValueError(task)
    parts, ys = [], []
    for i, m in enumerate(months):                 # filter + sample per month to keep peak memory low
        df = pd.read_parquet(C.FEATURES_DIR / f"features_{m:02d}.parquet", columns=cols)
        if task == "delay":
            df = df[df["is_cancelled"] == 0]
        elif task == "regressor":
            df = df[(df["is_cancelled"] == 0) & (df["is_delayed"] == 1)]
        if sample:
            df = df.sample(frac=sample, random_state=seed + i)
        if random_split_rolling:
            for c, ca in zip(ROLL_COLS, ROLL_ALL_COLS):
                df[c] = df[ca]
        ys.append({"delay": df["is_delayed"], "cancel": df["is_cancelled"], "regressor": df["arr_delay"]}[task].to_numpy())
        parts.append(df[FEATURE_COLUMNS])
        del df
    return pd.concat(parts, ignore_index=True), np.concatenate(ys)


def main() -> None:
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(name)s %(message)s")
    build_all()


if __name__ == "__main__":
    main()
