"""FastAPI entrypoint. Run: uvicorn app.main:app --port 8000 (from ml-service/)."""
import time
from contextlib import asynccontextmanager

from fastapi import FastAPI

from app.api import analytics_routes, health_routes, model_routes, predict_routes
from app.config import get_settings
from app.services.duckdb_service import DuckDBService
from app.services.model_loader import load_bundle
from app.utils.logger import get_logger, setup_logging


@asynccontextmanager
async def lifespan(app: FastAPI):
    settings = get_settings()
    setup_logging(settings.log_level)
    log = get_logger("startup")
    # manifest -> models, calibrators, encoders, lookups -> SHAP explainer -> metrics; raises if anything is missing
    app.state.bundle = load_bundle(settings)
    app.state.duckdb = DuckDBService(settings.parquet_path, settings.external_path / "airports.csv",
                                     settings.duckdb_memory_limit, settings.duckdb_threads)
    app.state.started_at = time.time()
    log.info("ml-service ready: model %s, analytics=%s", app.state.bundle.version, app.state.duckdb.available)
    yield


app = FastAPI(title="Flight Delay ML Service", version="1.0.0", lifespan=lifespan,
              description="Internal service. Every route requires the X-Internal-Key header.")
for r in (health_routes.router, predict_routes.router, model_routes.router, analytics_routes.router):
    app.include_router(r)
