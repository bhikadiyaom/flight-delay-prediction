#!/usr/bin/env python3
"""Pack the processed flight parquet into one .tar.gz for hosts without the data folder (Render, HF Spaces...).

    python scripts/pack-data.py                 # -> dist-data/flights-parquet.tar.gz (+ prints its SHA-256)

Upload the file somewhere with a direct download URL (a GitHub Release asset is ideal), then set on the ML service:
    PARQUET_URL=<that url>   PARQUET_SHA256=<the printed checksum>
The container entrypoint downloads it once, verifies the checksum and unpacks it into PARQUET_DIR.
Standard library only.
"""
import hashlib
import sys
import tarfile
from pathlib import Path

root = Path(__file__).resolve().parents[1]
src = root / "data" / "processed" / "flights"
files = sorted(src.glob("flights_*.parquet"))
if len(files) != 12:
    sys.exit(f"expected 12 monthly files in {src}, found {len(files)}. Build them first: "
             "cd ml-service && python -m training.data_cleaning --to-parquet")

out_dir = root / "dist-data"
out_dir.mkdir(exist_ok=True)
out = out_dir / "flights-parquet.tar.gz"
with tarfile.open(out, "w:gz", compresslevel=6) as tar:
    for f in files:
        tar.add(f, arcname=f"flights/{f.name}")  # unpacks to <PARQUET_DIR>/flights/flights_NN.parquet

h = hashlib.sha256()
with open(out, "rb") as fh:
    for chunk in iter(lambda: fh.read(1 << 20), b""):
        h.update(chunk)
print(f"wrote {out} ({out.stat().st_size / 1e6:.0f} MB)")
print(f"PARQUET_SHA256={h.hexdigest()}")
