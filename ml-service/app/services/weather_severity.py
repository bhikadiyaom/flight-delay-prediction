"""Coarse weather bands + severity index.

Training data is DAILY observed weather (Meteostat-style) while serving uses Open-Meteo daily forecasts, so the
model only sees coarse bands (0-3) that are comparable between the two sources, not raw values.
Units: prcp mm/day, snow mm/day, wind km/h (daily mean), temperature deg C.
There is no visibility in the training data, so visibility is not a feature.
"""
import numpy as np

PRCP_EDGES = (0.1, 5.0, 15.0)     # <0.1 dry | <5 light | <15 moderate | >=15 heavy
SNOW_EDGES = (1.0, 25.0, 75.0)    # mm
WIND_EDGES = (20.0, 30.0, 45.0)   # km/h


def band(values, edges) -> np.ndarray:
    v = np.nan_to_num(np.asarray(values, dtype="float64"), nan=0.0)
    return np.digitize(v, edges).astype("float32")


def prcp_band(v):
    return band(v, PRCP_EDGES)


def snow_band(v):
    return band(v, SNOW_EDGES)


def wind_band(v):
    return band(v, WIND_EDGES)


def freeze_flag(tmin) -> np.ndarray:
    return (np.nan_to_num(np.asarray(tmin, dtype="float64"), nan=10.0) <= 0).astype("float32")


def severity(prcp_b, snow_b, wind_b, freeze) -> np.ndarray:
    """0 (calm) .. 9.5 (extreme)."""
    return (prcp_b + snow_b + wind_b + 0.5 * freeze).astype("float32")
