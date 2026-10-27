import time

from fastapi import APIRouter, Depends, Request

from app.security import require_internal_key

router = APIRouter(tags=["health"], dependencies=[Depends(require_internal_key)])


@router.get("/health")
def health(request: Request):
    s = request.app.state
    return {
        "status": "ok",
        "model_version": s.bundle.version,
        "models_loaded": ["delay_clf", "cancel_clf", "delay_reg", "calibrators", "shap_explainer"],
        "analytics_available": s.duckdb.available,
        "uptime_seconds": round(time.time() - s.started_at, 1),
    }
