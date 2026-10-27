from fastapi import HTTPException, Request, status

from app.services.duckdb_service import DuckDBService
from app.services.model_loader import ModelBundle


def get_bundle(request: Request) -> ModelBundle:
    return request.app.state.bundle


def get_duckdb(request: Request) -> DuckDBService:
    db: DuckDBService = request.app.state.duckdb
    if not db.available:
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE,
                            detail="historical data not available on this deployment (flights parquet missing)")
    return db
