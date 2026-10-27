"""Random forest for the delay task (metrics only, Decision 7).

    python -m training.train_random_forest [--sample 0.15]

Trained on a capped random subsample of Jan-Aug (the dev machine has ~8 GB RAM); evaluated on the full val/test.
"""
import argparse
import logging
import time

from sklearn.ensemble import RandomForestClassifier

from training import config as C
from training.evaluate import classifier_result, save_json
from training.feature_engineering import load_xy

log = logging.getLogger("train_random_forest")
MAX_TRAIN_ROWS = 300_000


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
    params = dict(n_estimators=100, max_depth=14, min_samples_leaf=50, max_features="sqrt",
                  class_weight="balanced_subsample", n_jobs=3, random_state=C.RANDOM_STATE)
    model = RandomForestClassifier(**params).fit(Xtr, ytr)
    res = classifier_result("random_forest", yva, model.predict_proba(Xva)[:, 1], yte,
                            model.predict_proba(Xte)[:, 1], n_train=int(len(ytr)), params=params,
                            seconds=round(time.time() - t0, 1))
    save_json(metrics_dir / "random_forest_delay.json", res)
    m = res["test"]["metrics"]
    log.info("random_forest TEST auc=%.4f f1=%.4f acc=%.3f (%.0fs)", m["roc_auc"], m["f1"], m["accuracy"], res["seconds"])


if __name__ == "__main__":
    main()
