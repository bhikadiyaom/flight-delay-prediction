import os

# must be set before app.config is imported anywhere (get_settings is cached)
os.environ["INTERNAL_API_KEY"] = "test-internal-key-0123456789abcdef"

import pytest
from fastapi.testclient import TestClient

from app.config import get_settings
from app.main import app
from app.services.model_loader import load_bundle

KEY = {"X-Internal-Key": os.environ["INTERNAL_API_KEY"]}


@pytest.fixture(scope="session")
def client():
    with TestClient(app) as c:      # runs the lifespan: loads models once
        yield c


@pytest.fixture(scope="session")
def bundle():
    return load_bundle(get_settings())


@pytest.fixture()
def auth():
    return KEY


def calm_request(**over):
    body = {"airline": "Delta Air Lines Inc", "origin": "ATL", "destination": "JFK",
            "scheduled_departure": "2023-11-14T09:30:00", "flight_number": "DL100",
            "origin_weather": {"temperature_c": 18, "precipitation_mm": 0, "wind_speed_kmh": 8, "snowfall_cm": 0},
            "dest_weather": {"temperature_c": 12, "precipitation_mm": 0, "wind_speed_kmh": 10, "snowfall_cm": 0}}
    body.update(over)
    return body
