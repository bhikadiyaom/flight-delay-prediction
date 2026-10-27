from fastapi import APIRouter, Depends

from app.api.deps import get_bundle
from app.schemas.predict_schema import PredictBatchRequest, PredictBatchResponse, PredictRequest, PredictResponse
from app.security import require_internal_key
from app.services.model_loader import ModelBundle
from app.services.predictor import predict_many, predict_one

router = APIRouter(prefix="/predict", tags=["predict"], dependencies=[Depends(require_internal_key)])


@router.post("", response_model=PredictResponse)
def predict(req: PredictRequest, bundle: ModelBundle = Depends(get_bundle)) -> PredictResponse:
    """Single prediction with SHAP top-5 factors."""
    return predict_one(bundle, req)


@router.post("/batch", response_model=PredictBatchResponse)
def predict_batch(body: PredictBatchRequest, bundle: ModelBundle = Depends(get_bundle)) -> PredictBatchResponse:
    """Up to 500 predictions, no SHAP (top_factors is empty)."""
    return PredictBatchResponse(results=predict_many(bundle, body.items, explain=False), model_version=bundle.version)
