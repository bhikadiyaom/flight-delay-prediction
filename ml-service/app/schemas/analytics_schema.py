from typing import Any

from pydantic import BaseModel


class OverviewResponse(BaseModel):
    totals: dict[str, Any]
    by_airline: list[dict[str, Any]]
    by_airport: list[dict[str, Any]]
    by_month: list[dict[str, Any]]
    by_day_of_week: list[dict[str, Any]]
    by_time_of_day: list[dict[str, Any]]
    by_weather: list[dict[str, Any]]
    delay_causes: list[dict[str, Any]]


class HistoricalResponse(BaseModel):
    summary: dict[str, Any]
    flights: list[dict[str, Any]]
    by_airline: list[dict[str, Any]]


class RiskMapResponse(BaseModel):
    airports: list[dict[str, Any]]


class TrendsResponse(BaseModel):
    granularity: str
    points: list[dict[str, Any]]
