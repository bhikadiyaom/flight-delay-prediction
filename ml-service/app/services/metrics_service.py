"""model_metrics.json + manifest access for /models/* (read once at startup, validated)."""
import json
from pathlib import Path

from app.schemas.model_schema import ModelCompareResponse, ProductionModelResponse


def load_metrics(artifacts_dir: Path) -> ModelCompareResponse:
    p = Path(artifacts_dir) / "metrics" / "model_metrics.json"
    if not p.exists():
        raise FileNotFoundError(f"missing metrics file: {p}")
    return ModelCompareResponse.model_validate(json.loads(p.read_text()))


def production_summary(manifest: dict) -> ProductionModelResponse:
    return ProductionModelResponse.model_validate({k: manifest[k] for k in ProductionModelResponse.model_fields})
