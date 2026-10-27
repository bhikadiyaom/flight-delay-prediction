"""Train/serve parity and manifest guard for feature_builder (docs/CONTEXT.md section 9.11)."""
import copy
import json
from pathlib import Path

import duckdb
import numpy as np
import pandas as pd
import pytest

from app.services.feature_builder import (FEATURE_COLUMNS, Lookups, build_features, hour_to_label,
                                          validate_against_manifest)
from training import config as C

ARTIFACTS = Path(C.ARTIFACTS_DIR)
needs_artifacts = pytest.mark.skipif(not (ARTIFACTS / "lookups" / "static_lookups.json").exists()
                                     or not (C.FLIGHTS_DIR / "flights_12.parquet").exists(),
                                     reason="trained artifacts / parquet not present")


@pytest.fixture(scope="module")
def lk():
    return Lookups.load(ARTIFACTS)


def test_manifest_matches_feature_columns():
    manifest = json.loads((ARTIFACTS / "models" / "manifest.json").read_text())
    validate_against_manifest(manifest)


def test_manifest_mismatch_fails_loudly():
    manifest = json.loads((ARTIFACTS / "models" / "manifest.json").read_text())
    bad = copy.deepcopy(manifest)
    bad["feature_columns"] = bad["feature_columns"][::-1]
    with pytest.raises(RuntimeError, match="feature mismatch"):
        validate_against_manifest(bad)
    bad["feature_columns"] = bad["feature_columns"][:-1]
    with pytest.raises(RuntimeError, match="feature mismatch"):
        validate_against_manifest(bad)


def test_hour_to_label_boundaries():
    assert [hour_to_label(h) for h in (0, 5, 6, 11, 12, 17, 18, 23)] == [
        "Night", "Night", "Morning", "Morning", "Afternoon", "Afternoon", "Evening", "Evening"]


@needs_artifacts
def test_serving_path_reproduces_training_features(lk):
    """Raw December rows through the serving path (snapshot rolling lookup) == stored training features."""
    f = str(C.FLIGHTS_DIR / "flights_12.parquet").replace("\\", "/")
    raw = duckdb.connect().execute(f"SELECT * FROM read_parquet('{f}') LIMIT 3000").df()
    got = build_features(raw, lk)
    stored = pd.read_parquet(C.FEATURES_DIR / "features_12.parquet", columns=FEATURE_COLUMNS).iloc[:3000]
    assert list(got.columns) == FEATURE_COLUMNS
    np.testing.assert_allclose(got.to_numpy(), stored.to_numpy(), rtol=1e-5, atol=1e-6)


@needs_artifacts
def test_missing_weather_is_imputed_and_flagged(lk):
    row = pd.DataFrame([{"airline": "Delta Air Lines", "origin": "ATL", "dest": "JFK",
                         "flight_date": pd.Timestamp("2026-01-15"), "dep_time_label": "Morning",
                         "distance_miles": 760.0}])
    X = build_features(row, lk)
    assert X.isna().sum().sum() == 0
    assert X.loc[0, "weather_missing"] == 1.0


@needs_artifacts
def test_unknown_airport_and_airline_do_not_crash(lk):
    row = pd.DataFrame([{"airline": "Nonexistent Air", "origin": "ZZZ", "dest": "QQQ",
                         "flight_date": pd.Timestamp("2026-12-25"), "dep_time_label": "Evening",
                         "distance_miles": 500.0}])
    X = build_features(row, lk)
    assert X.loc[0, "is_holiday"] == 1.0   # Christmas 2026 is a Friday
    assert X.loc[0, "airline_freq"] == pytest.approx(lk.enc_airline.unseen)
