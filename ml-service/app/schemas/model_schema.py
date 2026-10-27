from typing import Any

from pydantic import BaseModel


class ModelMetricEntry(BaseModel):
    model_name: str
    task: str                       # classifier | regressor
    target: str | None = None       # delay | cancel | delay_minutes
    version: str
    is_production: bool
    threshold: float | None = None
    metrics: dict[str, Any]
    per_class: dict[str, Any] | None = None
    confusion_matrix: list[list[int]] | None = None
    validation_metrics: dict[str, Any] | None = None
    n_train: int | None = None
    extra: dict[str, Any] | None = None


class ModelCompareResponse(BaseModel):
    version: str
    generated_at: str
    split: dict[str, str]
    production_model: str
    models: list[ModelMetricEntry]
    roc: dict[str, list[dict[str, float]]]
    calibration: dict[str, Any]
    feature_importance: dict[str, float]
    random_split_experiment: dict[str, Any] | None = None
    time_split_vs_random_split_note: str | None = None


class ProductionModelResponse(BaseModel):
    version: str
    trained_at: str
    xgboost_version: str
    feature_columns: list[str]
    models: dict[str, Any]
    risk_levels: dict[str, dict[str, float]]
    delay_threshold_minutes: int
    split: dict[str, str]
