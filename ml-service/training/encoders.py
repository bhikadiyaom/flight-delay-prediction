"""Frequency encoding (Decision 6): category -> share of training rows. No target information is used."""
import json
from pathlib import Path

import pandas as pd


class FrequencyEncoder:
    def __init__(self, name: str):
        self.name = name
        self.freq: dict[str, float] = {}
        self.unseen: float = 0.0

    def fit(self, counts: pd.Series) -> "FrequencyEncoder":
        """counts: index = category, value = row count in the training period."""
        total = float(counts.sum())
        self.freq = {str(k): float(v) / total for k, v in counts.items()}
        self.unseen = min(self.freq.values()) / 2 if self.freq else 0.0
        return self

    def transform(self, series: pd.Series) -> pd.Series:
        return series.astype(str).map(self.freq).fillna(self.unseen).astype("float32")

    def to_json(self, path: Path) -> None:
        Path(path).write_text(json.dumps({"name": self.name, "unseen": self.unseen, "freq": self.freq}))

    @classmethod
    def from_json(cls, path: Path) -> "FrequencyEncoder":
        d = json.loads(Path(path).read_text())
        enc = cls(d["name"])
        enc.freq, enc.unseen = d["freq"], d["unseen"]
        return enc
