"""Airport coordinates / distance and airline-name resolution.

Airports come from data/external/airports.csv (committed, 364 rows), so serving needs no parquet.
Airline names must match the training data; callers (AviationStack, users) often send IATA codes or short names.
"""
import re
from math import asin, cos, radians, sin, sqrt
from pathlib import Path

import pandas as pd

AIRLINE_CODES = {
    "WN": "Southwest Airlines Co.", "DL": "Delta Air Lines Inc", "AA": "American Airlines Inc.",
    "UA": "United Air Lines Inc.", "OO": "Skywest Airlines Inc.", "YX": "Republic Airways",
    "B6": "JetBlue Airways", "NK": "Spirit Air Lines", "AS": "Alaska Airlines Inc.",
    "MQ": "American Eagle Airlines Inc.", "9E": "Endeavor Air", "OH": "PSA Airlines",
    "F9": "Frontier Airlines Inc.", "G4": "Allegiant Air", "HA": "Hawaiian Airlines Inc.",
}
_CODE_OF = {v: k for k, v in AIRLINE_CODES.items()}


def _norm(s: str) -> str:
    return re.sub(r"[^a-z0-9 ]", "", s.lower()).strip()


def resolve_airline(value: str) -> str:
    """IATA code, full name or a name prefix (e.g. 'Delta Air Lines') -> training-data airline name.
    Unknown values are returned unchanged (the encoder then treats them as unseen)."""
    v = value.strip()
    if v.upper() in AIRLINE_CODES:
        return AIRLINE_CODES[v.upper()]
    n = _norm(v)
    names = list(AIRLINE_CODES.values())
    for name in names:
        if _norm(name) == n:
            return name
    for name in names:
        if _norm(name).startswith(n) and len(n) >= 4:
            return name
    return v


def airline_code(name: str) -> str | None:
    return _CODE_OF.get(name)


def haversine_miles(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    a = sin(radians(lat2 - lat1) / 2) ** 2 + cos(radians(lat1)) * cos(radians(lat2)) * sin(radians(lon2 - lon1) / 2) ** 2
    return 3958.8 * 2 * asin(sqrt(a))


class AirportLookup:
    def __init__(self, csv_path: Path):
        df = pd.read_csv(csv_path)
        self.frame = df
        self._coords = {r.iata: (float(r.lat), float(r.lon)) for r in df.itertuples()}

    def __contains__(self, iata: str) -> bool:
        return iata in self._coords

    def distance_miles(self, origin: str, dest: str) -> float | None:
        a, b = self._coords.get(origin), self._coords.get(dest)
        return None if a is None or b is None else haversine_miles(*a, *b)

    def records(self) -> list[dict]:
        return self.frame.to_dict(orient="records")
