from fastapi import APIRouter, Depends

from app.api.deps import get_bundle
from app.schemas.model_schema import ModelCompareResponse, ProductionModelResponse
from app.security import require_internal_key
from app.services.metrics_service import production_summary
from app.services.model_loader import ModelBundle

router = APIRouter(prefix="/models", tags=["models"], dependencies=[Depends(require_internal_key)])


@router.get("/compare", response_model=ModelCompareResponse)
def compare(bundle: ModelBundle = Depends(get_bundle)) -> ModelCompareResponse:
    """All model metrics (served from model_metrics.json; only XGBoost is deployed, Decision 7)."""
    return bundle.metrics


@router.get("/production", response_model=ProductionModelResponse)
def production(bundle: ModelBundle = Depends(get_bundle)) -> ProductionModelResponse:
    return production_summary(bundle.manifest)
