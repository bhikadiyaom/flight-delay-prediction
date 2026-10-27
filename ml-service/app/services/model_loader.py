"""Startup loading. Fails fast (raises) if anything is missing or inconsistent (docs/CONTEXT.md section 10)."""
import json
from dataclasses import dataclass
from pathlib import Path

import joblib
import pandas as pd
import xgboost

from app.config import Settings
from app.schemas.model_schema import ModelCompareResponse
from app.services.explainer import Explainer
from app.services.feature_builder import FEATURE_COLUMNS, Lookups, validate_against_manifest
from app.services.metrics_service import load_metrics
from app.utils.airport_lookup import AirportLookup
from app.utils.logger import get_logger

log = get_logger("model_loader")


@dataclass
class ModelBundle:
    manifest: dict
    version: str
    lookups: Lookups
    delay_clf: object
    cancel_clf: object
    delay_reg: object
    cal_delay: object
    cal_cancel: object
    explainer: Explainer
    metrics: ModelCompareResponse
    airports: AirportLookup

    @property
    def delay_threshold(self) -> float:
        return float(self.manifest["models"]["delay_clf"]["threshold"])


def _require(path: Path) -> Path:
    if not path.exists():
        raise FileNotFoundError(f"missing artifact: {path}")
    return path


def load_bundle(settings: Settings) -> ModelBundle:
    art = settings.artifacts_path
    mp = _require(art / "models" / "manifest.json")
    manifest = json.loads(mp.read_text())
    if not manifest:
        raise RuntimeError(f"{mp} is empty: run the training pipeline (python -m training.compare_models)")
    validate_against_manifest(manifest)
    if manifest.get("xgboost_version") != xgboost.__version__:
        log.warning("xgboost version differs from training (%s vs %s)", manifest.get("xgboost_version"), xgboost.__version__)

    models = manifest["models"]
    mdir = art / "models"
    delay_clf = joblib.load(_require(mdir / models["delay_clf"]["file"]))
    cancel_clf = joblib.load(_require(mdir / models["cancel_clf"]["file"]))
    delay_reg = joblib.load(_require(mdir / models["delay_reg"]["file"]))
    cal_delay = joblib.load(_require(mdir / models["delay_clf"]["calibrator"]))
    cal_cancel = joblib.load(_require(mdir / models["cancel_clf"]["calibrator"]))
    for name, m in (("delay_clf", delay_clf), ("cancel_clf", cancel_clf), ("delay_reg", delay_reg)):
        if getattr(m, "n_features_in_", len(FEATURE_COLUMNS)) != len(FEATURE_COLUMNS):
            raise RuntimeError(f"{name} expects {m.n_features_in_} features, builder produces {len(FEATURE_COLUMNS)}")

    lookups = Lookups.load(art)
    background = pd.read_parquet(_require(mdir / manifest["shap_background"]))
    if list(background.columns) != FEATURE_COLUMNS:
        raise RuntimeError("shap background columns do not match FEATURE_COLUMNS")
    explainer = Explainer(delay_clf, background)

    metrics = load_metrics(art)
    if metrics.version != manifest["version"]:
        raise RuntimeError(f"model_metrics.json version {metrics.version} != manifest version {manifest['version']}")

    airports = AirportLookup(_require(settings.external_path / "airports.csv"))
    log.info("loaded model bundle %s (%d features, %d airports)", manifest["version"], len(FEATURE_COLUMNS), len(airports.frame))
    return ModelBundle(manifest, manifest["version"], lookups, delay_clf, cancel_clf, delay_reg, cal_delay, cal_cancel,
                       explainer, metrics, airports)
