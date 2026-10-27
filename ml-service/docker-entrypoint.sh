#!/bin/sh
# Optional first-boot download of the historical-analytics parquet (about 145 MB, too big for git).
# Without it the service still starts: predictions work, /analytics/{overview,historical,risk-map,trends} answer 503.
#   PARQUET_URL     https URL of a .tar.gz made by scripts/pack-data.py (contains flights/flights_NN.parquet)
#   PARQUET_SHA256  optional checksum; if set and different, the download is discarded
set -eu

DATA_DIR="${PARQUET_DIR:-../data/processed}"

have_data() { ls "$DATA_DIR"/flights/flights_*.parquet >/dev/null 2>&1; }

if [ -n "${PARQUET_URL:-}" ] && ! have_data; then
  echo "[entrypoint] analytics data missing, downloading from PARQUET_URL"
  mkdir -p "$DATA_DIR"
  TMP="$(mktemp)"
  if curl -fsSL --retry 3 --max-time 600 -o "$TMP" "$PARQUET_URL"; then
    if [ -n "${PARQUET_SHA256:-}" ] && [ "$(sha256sum "$TMP" | cut -d' ' -f1)" != "$PARQUET_SHA256" ]; then
      echo "[entrypoint] checksum mismatch, ignoring the download (analytics will be unavailable)"
    else
      tar -xzf "$TMP" -C "$DATA_DIR" && echo "[entrypoint] analytics data ready"
    fi
  else
    echo "[entrypoint] download failed (analytics will be unavailable)"
  fi
  rm -f "$TMP"
fi

if ! have_data; then
  echo "[entrypoint] no flights parquet in $DATA_DIR: /analytics/* will answer 503"
fi

exec "$@"
