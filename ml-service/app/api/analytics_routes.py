from datetime import date
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Query

from app.api.deps import get_bundle, get_duckdb
from app.schemas.analytics_schema import HistoricalResponse, OverviewResponse, RiskMapResponse, TrendsResponse
from app.security import require_internal_key
from app.services.duckdb_service import DuckDBService
from app.services.model_loader import ModelBundle
from app.utils.airport_lookup import AIRLINE_CODES, resolve_airline

router = APIRouter(prefix="/analytics", tags=["analytics"], dependencies=[Depends(require_internal_key)])
IATA = r"^[A-Za-z]{3}$"


@router.get("/overview", response_model=OverviewResponse)
def overview(db: DuckDBService = Depends(get_duckdb)):
    return db.overview()


@router.get("/historical", response_model=HistoricalResponse)
def historical(
    origin: str | None = Query(default=None, pattern=IATA),
    dest: str | None = Query(default=None, pattern=IATA),
    date_: date | None = Query(default=None, alias="date"),
    airline: str | None = Query(default=None, max_length=60),
    limit: int = Query(default=100, ge=1, le=500),
    db: DuckDBService = Depends(get_duckdb),
):
    """Historical 2023 flights. Needs at least an origin or a destination (a full scan of 6.8M rows is not a search)."""
    if not origin and not dest:
        raise HTTPException(422, detail="provide at least origin or dest")
    return db.historical(origin.upper() if origin else None, dest.upper() if dest else None, date_,
                         resolve_airline(airline) if airline else None, limit)


@router.get("/risk-map", response_model=RiskMapResponse)
def risk_map(min_flights: int = Query(default=3000, ge=100, le=100000), db: DuckDBService = Depends(get_duckdb)):
    return db.risk_map(min_flights)


@router.get("/trends", response_model=TrendsResponse)
def trends(
    granularity: Literal["day", "week", "month"] = "day",
    origin: str | None = Query(default=None, pattern=IATA),
    airline: str | None = Query(default=None, max_length=60),
    db: DuckDBService = Depends(get_duckdb),
):
    return db.trends(granularity, origin.upper() if origin else None, resolve_airline(airline) if airline else None)


# ---- small lookup lists for autocomplete (not parquet based, always available) ----
@router.get("/airports")
def airports(bundle: ModelBundle = Depends(get_bundle)):
    return {"airports": bundle.airports.records()}


@router.get("/airlines")
def airlines():
    return {"airlines": [{"code": c, "name": n} for c, n in AIRLINE_CODES.items()]}
