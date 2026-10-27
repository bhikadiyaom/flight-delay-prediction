"""Save a small background sample of validation feature rows for the SHAP TreeExplainer.

    python -m training.generate_shap_background [--sample 0.15] [--rows 200]
"""
import argparse
import logging

from training import config as C
from training.feature_engineering import load_xy

log = logging.getLogger("shap_background")


def main() -> None:
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(name)s %(message)s")
    ap = argparse.ArgumentParser()
    ap.add_argument("--sample", type=float, default=None)
    ap.add_argument("--rows", type=int, default=200)
    a = ap.parse_args()
    models_dir, _ = C.run_dirs(a.sample)
    X, _ = load_xy("valid", "delay", a.sample)
    bg = X.sample(n=min(a.rows, len(X)), random_state=C.RANDOM_STATE)
    bg.to_parquet(models_dir / "shap_background.parquet", index=False)
    log.info("wrote %s (%d rows)", models_dir / "shap_background.parquet", len(bg))


if __name__ == "__main__":
    main()
