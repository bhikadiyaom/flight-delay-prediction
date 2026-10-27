"""Logistic regression baseline for the delay task (metrics only, Decision 7).

    python -m training.train_baseline [--sample 0.15]
"""
import argparse
import logging
import time

from sklearn.linear_model import LogisticRegression
from sklearn.pipeline import make_pipeline
from sklearn.preprocessing import StandardScaler

from training import config as C
from training.evaluate import classifier_result, save_json
from training.feature_engineering import load_xy

log = logging.getLogger("train_baseline")
MAX_TRAIN_ROWS = 1_000_000


def main() -> None:
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(name)s %(message)s")
    ap = argparse.ArgumentParser()
    ap.add_argument("--sample", type=float, default=None)
    a = ap.parse_args()
    t0 = time.time()
    _, metrics_dir = C.run_dirs(a.sample)
    Xtr, ytr = load_xy("train", "delay", a.sample)
    if len(Xtr) > MAX_TRAIN_ROWS:
        Xtr, ytr = load_xy("train", "delay", MAX_TRAIN_ROWS / len(Xtr))
    Xva, yva = load_xy("valid", "delay", a.sample)
    Xte, yte = load_xy("test", "delay", a.sample)
    model = make_pipeline(StandardScaler(),
                          LogisticRegression(class_weight="balanced", max_iter=300, C=1.0, n_jobs=2))
    model.fit(Xtr, ytr)
    res = classifier_result("logreg", yva, model.predict_proba(Xva)[:, 1], yte, model.predict_proba(Xte)[:, 1],
                            n_train=int(len(ytr)), params={"class_weight": "balanced", "max_iter": 300},
                            seconds=round(time.time() - t0, 1))
    save_json(metrics_dir / "logreg_delay.json", res)
    m = res["test"]["metrics"]
    log.info("logreg TEST auc=%.4f f1=%.4f acc=%.3f (%.0fs)", m["roc_auc"], m["f1"], m["accuracy"], res["seconds"])


if __name__ == "__main__":
    main()
