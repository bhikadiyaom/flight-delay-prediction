"""Request/response models for /predict (contract: docs/CONTEXT.md section 10).

Weather units are DAILY values (the model was trained on daily weather): temperature deg C (daily mean),
precipitation mm/day, wind km/h (daily mean), snowfall cm/day. `temperature_min_c` is an optional extension
(daily minimum) used for the freeze flag; without it the minimum is estimated as mean - 5.1 deg C (training median).
`visibility_km` is accepted for forward compatibility but is NOT a model feature (the dataset has no visibility).
"""
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field, field_validator

IATA = r"^[A-Za-z]{3}$"


class WeatherInput(BaseModel):
    temperature_c: float | None = Field(default=None, ge=-80, le=60)
    temperature_min_c: float | None = Field(default=None, ge=-90, le=60)
    precipitation_mm: float | None = Field(default=None, ge=0, le=1500)
    wind_speed_kmh: float | None = Field(default=None, ge=0, le=450)
    visibility_km: float | None = Field(default=None, ge=0, le=200)
    snowfall_cm: float | None = Field(default=None, ge=0, le=500)


class PredictRequest(BaseModel):
    airline: str = Field(min_length=2, max_length=60)
    origin: str = Field(pattern=IATA)
    destination: str = Field(pattern=IATA)
    flight_number: str | None = Field(default=None, max_length=12)
    scheduled_departure: datetime
    distance_miles: float | None = Field(default=None, gt=0, le=8000)
    origin_weather: WeatherInput | None = None
    dest_weather: WeatherInput | None = None

    @field_validator("origin", "destination")
    @classmethod
    def _upper(cls, v: str) -> str:
        return v.upper()


class Explanation(BaseModel):
    feature: str
    value: str
    shap_value: float
    direction: Literal["increases_delay_risk", "decreases_delay_risk"]


class PredictResponse(BaseModel):
    delay_probability: float
    cancel_probability: float
    predicted_delay_minutes: float | None   # null when delay_probability < threshold
    risk_level: Literal["low", "medium", "high"]
    top_factors: list[Explanation]          # top 5 (empty for batch)
    model_version: str
    warnings: list[str] = []


class PredictBatchRequest(BaseModel):
    items: list[PredictRequest] = Field(min_length=1, max_length=500)


class PredictBatchResponse(BaseModel):
    results: list[PredictResponse]
    model_version: str
