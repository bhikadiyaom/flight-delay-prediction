"""Small feed-forward network (PyTorch, offline, metrics only; torch is in requirements-dev.txt only).

    python -m training.train_neural_net [--sample 0.15] [--epochs 5]
"""
import argparse
import logging
import time

import numpy as np
import torch
from torch import nn

from training import config as C
from training.evaluate import classifier_result, save_json
from training.feature_engineering import load_xy

log = logging.getLogger("train_neural_net")


def _predict(model, X: torch.Tensor, bs: int = 65536) -> np.ndarray:
    model.eval()
    out = []
    with torch.no_grad():
        for i in range(0, len(X), bs):
            out.append(torch.sigmoid(model(X[i:i + bs])).squeeze(1).numpy())
    return np.concatenate(out)


def main() -> None:
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(name)s %(message)s")
    ap = argparse.ArgumentParser()
    ap.add_argument("--sample", type=float, default=None)
    ap.add_argument("--epochs", type=int, default=5)
    a = ap.parse_args()
    t0 = time.time()
    torch.manual_seed(C.RANDOM_STATE)
    torch.set_num_threads(3)
    _, metrics_dir = C.run_dirs(a.sample)
    Xtr, ytr = load_xy("train", "delay", a.sample)
    Xva, yva = load_xy("valid", "delay", a.sample)
    Xte, yte = load_xy("test", "delay", a.sample)
    mu, sd = Xtr.mean().to_numpy(), Xtr.std().replace(0, 1).to_numpy()

    def prep(X):
        return torch.from_numpy(((X.to_numpy() - mu) / sd).astype("float32"))

    Ttr, Tva, Tte = prep(Xtr), prep(Xva), prep(Xte)
    ytr_t = torch.from_numpy(ytr.astype("float32"))
    del Xtr
    model = nn.Sequential(nn.Linear(Ttr.shape[1], 128), nn.ReLU(), nn.Dropout(0.1),
                          nn.Linear(128, 64), nn.ReLU(), nn.Linear(64, 1))
    pos_weight = torch.tensor(float((ytr == 0).sum() / (ytr == 1).sum()))
    loss_fn = nn.BCEWithLogitsLoss(pos_weight=pos_weight)
    opt = torch.optim.Adam(model.parameters(), lr=1e-3)
    bs, n = 4096, len(Ttr)
    best, best_state = 0.0, None
    from sklearn.metrics import roc_auc_score
    for epoch in range(a.epochs):
        model.train()
        perm = torch.randperm(n)
        for i in range(0, n, bs):
            idx = perm[i:i + bs]
            opt.zero_grad()
            loss = loss_fn(model(Ttr[idx]).squeeze(1), ytr_t[idx])
            loss.backward()
            opt.step()
        auc = roc_auc_score(yva, _predict(model, Tva))
        log.info("epoch %d val_auc=%.4f", epoch + 1, auc)
        if auc > best:
            best, best_state = auc, {k: v.clone() for k, v in model.state_dict().items()}
    model.load_state_dict(best_state)
    res = classifier_result("neural_net", yva, _predict(model, Tva), yte, _predict(model, Tte),
                            n_train=int(n), params={"layers": [128, 64, 1], "epochs": a.epochs, "batch": bs},
                            seconds=round(time.time() - t0, 1))
    save_json(metrics_dir / "neural_net_delay.json", res)
    m = res["test"]["metrics"]
    log.info("neural_net TEST auc=%.4f f1=%.4f acc=%.3f (%.0fs)", m["roc_auc"], m["f1"], m["accuracy"], res["seconds"])


if __name__ == "__main__":
    main()
