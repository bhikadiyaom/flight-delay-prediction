import copy
import json
import shutil

import numpy as np
import pytest

from app.config import Settings, get_settings
from app.services.model_loader import load_bundle
from tests.conftest import KEY, calm_request

needs_parquet = pytest.mark.skipif(not any((get_settings().parquet_path / "flights").glob("flights_*.parquet")),
                                   reason="flights parquet not present")


# ------------------------------------------------------------------------------ auth
@pytest.mark.parametrize("method,path", [("get", "/health"), ("get", "/models/compare"), ("get", "/models/production"),
                                         ("get", "/analytics/overview"), ("get", "/analytics/airports"),
                                         ("post", "/predict"), ("post", "/predict/batch")])
def test_every_route_requires_internal_key(client, method, path):
    assert getattr(client, method)(path).status_code == 403
    assert getattr(client, method)(path, headers={"X-Internal-Key": "wrong"}).status_code == 403


def test_health(client, auth):
    r = client.get("/health", headers=auth)
    assert r.status_code == 200
    body = r.json()
    assert body["status"] == "ok" and body["model_version"].startswith("v")


# ------------------------------------------------------------------------------ /predict
def test_predict_contract(client, auth, bundle):
    r = client.post("/predict", json=calm_request(), headers=auth)
    assert r.status_code == 200, r.text
    b = r.json()
    assert 0 <= b["delay_probability"] <= 1 and 0 <= b["cancel_probability"] <= 1
    assert b["risk_level"] in ("low", "medium", "high")
    assert b["model_version"] == bundle.version
    assert len(b["top_factors"]) == 5
    mags = [abs(f["shap_value"]) for f in b["top_factors"]]
    assert mags == sorted(mags, reverse=True)
    for f in b["top_factors"]:
        assert f["direction"] == ("increases_delay_risk" if f["shap_value"] > 0 else "decreases_delay_risk")
    assert b["warnings"] == []


def test_regressor_only_runs_above_threshold(client, auth, bundle):
    thr = bundle.delay_threshold
    for body in (calm_request(), calm_request(origin="ORD", destination="LGA", scheduled_departure="2023-07-14T18:30:00",
                                                 origin_weather={"temperature_c": 31, "precipitation_mm": 22, "wind_speed_kmh": 40})):
        b = client.post("/predict", json=body, headers=auth).json()
        if b["delay_probability"] >= thr:
            assert b["predicted_delay_minutes"] is not None and b["predicted_delay_minutes"] >= 15
        else:
            assert b["predicted_delay_minutes"] is None


def test_bad_weather_raises_risk(client, auth):
    calm = client.post("/predict", json=calm_request(origin="ORD", destination="LGA", scheduled_departure="2023-01-10T08:00:00"),
                       headers=auth).json()
    storm = client.post("/predict", json=calm_request(
        origin="ORD", destination="LGA", scheduled_departure="2023-01-10T08:00:00",
        origin_weather={"temperature_c": -8, "precipitation_mm": 20, "wind_speed_kmh": 50, "snowfall_cm": 12}), headers=auth).json()
    assert storm["delay_probability"] > calm["delay_probability"]
    assert storm["cancel_probability"] >= calm["cancel_probability"]


def test_missing_weather_is_a_warning_not_an_error(client, auth):
    body = calm_request()
    body.pop("origin_weather"), body.pop("dest_weather")
    r = client.post("/predict", json=body, headers=auth)
    assert r.status_code == 200
    w = " | ".join(r.json()["warnings"])
    assert "origin weather not supplied" in w and "destination weather not supplied" in w


def test_partial_weather_warns_with_fields(client, auth):
    r = client.post("/predict", json=calm_request(origin_weather={"temperature_c": 10}), headers=auth)
    assert r.status_code == 200
    assert any("origin weather incomplete" in w and "wind_speed_kmh" in w for w in r.json()["warnings"])


def test_unknown_entities_do_not_crash(client, auth):
    r = client.post("/predict", json=calm_request(airline="Imaginary Air", origin="ZZZ", destination="QQQ"), headers=auth)
    assert r.status_code == 200
    w = " ".join(r.json()["warnings"])
    assert "airline 'Imaginary Air'" in w and "airport ZZZ" in w and "distance unknown" in w


def test_airline_code_and_name_resolve_to_same_prediction(client, auth):
    a = client.post("/predict", json=calm_request(airline="DL"), headers=auth).json()
    b = client.post("/predict", json=calm_request(airline="Delta Air Lines"), headers=auth).json()
    assert a["warnings"] == [] and b["warnings"] == []
    assert a["delay_probability"] == b["delay_probability"]


@pytest.mark.parametrize("patch", [{"origin": "ATLANTA"}, {"origin": "A1"}, {"scheduled_departure": "not-a-date"},
                                    {"distance_miles": -5}, {"origin_weather": {"precipitation_mm": -1}},
                                    {"origin_weather": {"temperature_c": 500}}, {"airline": ""}])
def test_validation_errors_are_422(client, auth, patch):
    assert client.post("/predict", json=calm_request(**patch), headers=auth).status_code == 422


def test_lowercase_iata_is_normalised(client, auth):
    a = client.post("/predict", json=calm_request(origin="atl", destination="jfk"), headers=auth).json()
    b = client.post("/predict", json=calm_request(), headers=auth).json()
    assert a["delay_probability"] == b["delay_probability"]


# ------------------------------------------------------------------------------ /predict/batch
def test_batch_matches_single_and_has_no_shap(client, auth):
    items = [calm_request(), calm_request(origin="ORD", destination="LGA", scheduled_departure="2023-12-22T17:00:00"),
             calm_request(origin="DEN", destination="LAX", airline="UA")]
    r = client.post("/predict/batch", json={"items": items}, headers=auth)
    assert r.status_code == 200
    res = r.json()["results"]
    assert len(res) == 3 and all(x["top_factors"] == [] for x in res)
    for it, got in zip(items, res):
        single = client.post("/predict", json=it, headers=auth).json()
        assert got["delay_probability"] == single["delay_probability"]
        assert got["cancel_probability"] == single["cancel_probability"]
        assert got["predicted_delay_minutes"] == single["predicted_delay_minutes"]


def test_batch_limits(client, auth):
    assert client.post("/predict/batch", json={"items": []}, headers=auth).status_code == 422
    assert client.post("/predict/batch", json={"items": [calm_request()] * 501}, headers=auth).status_code == 422
    assert client.post("/predict/batch", json={"items": [calm_request()] * 500}, headers=auth).status_code == 200


# ------------------------------------------------------------------------------ /models
def test_models_compare(client, auth, bundle):
    b = client.get("/models/compare", headers=auth).json()
    assert b["version"] == bundle.version and b["production_model"] == "xgboost"
    names = {(m["model_name"], m["target"]) for m in b["models"]}
    assert {("logreg", "delay"), ("random_forest", "delay"), ("xgboost", "delay"), ("neural_net", "delay"),
            ("xgboost", "cancel"), ("xgboost", "delay_minutes")} <= names
    assert b["random_split_experiment"]["test"]["metrics"]["roc_auc"] > \
        next(m for m in b["models"] if m["model_name"] == "xgboost" and m["target"] == "delay")["metrics"]["roc_auc"]


def test_models_production(client, auth):
    b = client.get("/models/production", headers=auth).json()
    assert len(b["feature_columns"]) == 33 and "month" not in b["feature_columns"]
    assert b["models"]["delay_clf"]["production"] is True


# ------------------------------------------------------------------------------ /analytics
def test_lookup_lists(client, auth):
    assert len(client.get("/analytics/airports", headers=auth).json()["airports"]) == 364
    assert len(client.get("/analytics/airlines", headers=auth).json()["airlines"]) == 15


@needs_parquet
def test_overview(client, auth):
    b = client.get("/analytics/overview", headers=auth).json()
    assert b["totals"]["flights"] == 6830352 and b["totals"]["cancelled"] == 86991
    assert len(b["by_airline"]) == 15 and len(b["by_month"]) == 12 and len(b["by_day_of_week"]) == 7
    assert [t["time_of_day"] for t in b["by_time_of_day"]] == ["Night", "Morning", "Afternoon", "Evening"]
    assert abs(sum(c["share"] for c in b["delay_causes"]) - 1) < 1e-3
    assert {w["dimension"] for w in b["by_weather"]} == {"precipitation", "wind", "snow"}


@needs_parquet
def test_historical(client, auth):
    r = client.get("/analytics/historical", params={"origin": "ATL", "dest": "JFK", "limit": 20}, headers=auth)
    assert r.status_code == 200
    b = r.json()
    assert 0 < b["summary"]["flights"] and len(b["flights"]) == b["summary"]["returned"] <= 20
    assert all(f["origin"] == "ATL" and f["dest"] == "JFK" for f in b["flights"])
    one = client.get("/analytics/historical", params={"origin": "ATL", "date": "2023-07-04", "airline": "DL"}, headers=auth).json()
    assert all(f["flight_date"].startswith("2023-07-04") and f["airline"] == "Delta Air Lines Inc" for f in one["flights"])


@needs_parquet
@pytest.mark.parametrize("params", [{}, {"origin": "AT'; DROP TABLE x;--"}, {"origin": "ATLX"}, {"origin": "ATL", "limit": 9999},
                                    {"origin": "ATL", "date": "2023-13-45"}])
def test_historical_rejects_bad_input(client, auth, params):
    assert client.get("/analytics/historical", params=params, headers=auth).status_code == 422


@needs_parquet
def test_risk_map_and_trends(client, auth):
    rm = client.get("/analytics/risk-map", headers=auth).json()["airports"]
    assert len(rm) > 100 and all(-90 <= a["lat"] <= 90 for a in rm)
    assert [a["delay_rate"] for a in rm] == sorted((a["delay_rate"] for a in rm), reverse=True)
    t = client.get("/analytics/trends", params={"granularity": "month"}, headers=auth).json()
    assert len(t["points"]) == 12
    d = client.get("/analytics/trends", params={"granularity": "day", "origin": "ATL"}, headers=auth).json()
    assert len(d["points"]) == 365
    assert client.get("/analytics/trends", params={"granularity": "year"}, headers=auth).status_code == 422


# ------------------------------------------------------------------------------ fail fast
def test_startup_fails_fast_when_artifact_missing(tmp_path):
    art = tmp_path / "artifacts"
    shutil.copytree(get_settings().artifacts_path, art)
    (art / "models" / "xgb_delay_clf.joblib").unlink()
    s = Settings(internal_api_key="x" * 20, artifacts_dir=art)
    with pytest.raises(FileNotFoundError, match="xgb_delay_clf"):
        load_bundle(s)


def test_startup_fails_fast_on_feature_mismatch(tmp_path):
    art = tmp_path / "artifacts"
    shutil.copytree(get_settings().artifacts_path, art)
    mp = art / "models" / "manifest.json"
    m = json.loads(mp.read_text())
    m["feature_columns"] = m["feature_columns"][:-1]
    mp.write_text(json.dumps(m))
    with pytest.raises(RuntimeError, match="feature mismatch"):
        load_bundle(Settings(internal_api_key="x" * 20, artifacts_dir=art))


def test_startup_fails_on_empty_manifest(tmp_path):
    art = tmp_path / "artifacts"
    shutil.copytree(get_settings().artifacts_path, art)
    (art / "models" / "manifest.json").write_text("{}")
    with pytest.raises(RuntimeError, match="empty"):
        load_bundle(Settings(internal_api_key="x" * 20, artifacts_dir=art))
