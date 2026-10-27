"""SHAP explanations for the delay classifier. The TreeExplainer is built ONCE at startup (lifespan)."""
import pandas as pd
import shap

from app.schemas.predict_schema import Explanation
from app.services.feature_builder import DEP_TIME_LABELS

WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"]
FLAGS = {"is_weekend", "is_holiday", "o_freeze", "d_freeze", "weather_missing"}
BANDS = {"o_prcp_band", "d_prcp_band", "o_snow_band", "d_snow_band", "o_wind_band", "d_wind_band"}
BAND_NAMES = ["none/low", "light", "moderate", "heavy"]


def format_value(feature: str, value: float) -> str:
    if feature == "dep_time_idx":
        return DEP_TIME_LABELS[int(round(value)) % 4]
    if feature == "day_of_week":
        return WEEKDAYS[int(round(value)) % 7]
    if feature in FLAGS:
        return "yes" if value >= 0.5 else "no"
    if feature in BANDS:
        return BAND_NAMES[min(int(round(value)), 3)]
    return f"{value:.3g}"


class Explainer:
    def __init__(self, model, background: pd.DataFrame, top_k: int = 5):
        self.top_k = top_k
        self.explainer = shap.TreeExplainer(model, data=background, feature_perturbation="interventional")
        self.base_value = float(self.explainer.expected_value)

    def explain(self, x: pd.DataFrame) -> list[Explanation]:
        """x: exactly one feature row. Returns the top-k factors by |SHAP| (log-odds contribution)."""
        sv = self.explainer.shap_values(x)[0]
        order = sorted(range(len(sv)), key=lambda i: -abs(sv[i]))[: self.top_k]
        out = []
        for i in order:
            name = x.columns[i]
            out.append(Explanation(
                feature=name, value=format_value(name, float(x.iloc[0, i])), shap_value=round(float(sv[i]), 4),
                direction="increases_delay_risk" if sv[i] > 0 else "decreases_delay_risk"))
        return out
