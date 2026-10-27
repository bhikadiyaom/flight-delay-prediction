#!/usr/bin/env bash
# One-shot setup on macOS / Linux (the Windows equivalent is scripts/setup.ps1). Safe to re-run.
#   bash scripts/setup.sh [--with-training] [--skip-npm]
set -euo pipefail
cd "$(dirname "$0")/.."
ROOT="$PWD"
WITH_TRAINING=0; SKIP_NPM=0
for a in "$@"; do case "$a" in --with-training) WITH_TRAINING=1;; --skip-npm) SKIP_NPM=1;; esac; done

step() { printf '\n==> %s\n' "$1"; }
fail() { printf 'ERROR: %s\n' "$1" >&2; exit 1; }
rand_hex() { node -e "console.log(require('crypto').randomBytes($1).toString('hex'))"; }

step "Checking prerequisites"
command -v node >/dev/null || fail "Node.js not found (need 20+): https://nodejs.org"
[ "$(node -p 'process.versions.node.split(".")[0]')" -ge 20 ] || fail "Node $(node -v) is too old; need 20 or newer."
PY=""
for c in python3.11 python3 python; do
  if command -v "$c" >/dev/null && "$c" --version 2>&1 | grep -q "Python 3\.11\."; then PY="$c"; break; fi
done
[ -n "$PY" ] || fail "Python 3.11 not found (3.12+ is NOT supported). macOS: brew install python@3.11   Ubuntu: sudo apt install python3.11 python3.11-venv"
echo "Node $(node -v), $($PY --version)"

step "ML service virtualenv"
VENV_PY="$ROOT/ml-service/venv/bin/python"
[ -x "$VENV_PY" ] || "$PY" -m venv "$ROOT/ml-service/venv"
"$VENV_PY" -m pip install --quiet --upgrade pip
REQ="ml-service/requirements.txt"; [ "$WITH_TRAINING" = 1 ] && REQ="ml-service/requirements-dev.txt"
"$VENV_PY" -m pip install --quiet -r "$REQ" || fail "pip install failed. See docs/TROUBLESHOOTING.md (pip install fails)"

if [ "$SKIP_NPM" = 0 ]; then
  for d in server client; do step "npm ci in $d"; (cd "$d" && npm ci --no-audit --no-fund) || fail "npm ci failed in $d"; done
fi

step "Environment files"
if [ ! -f ml-service/.env ]; then
  printf 'INTERNAL_API_KEY=%s\nARTIFACTS_DIR=./artifacts\nPARQUET_DIR=../data/processed\n' "$(rand_hex 32)" > ml-service/.env
  echo "created ml-service/.env"
fi
ML_KEY="$(grep '^INTERNAL_API_KEY=' ml-service/.env | cut -d= -f2-)"
if [ ! -f server/.env ]; then
  JWT="$(rand_hex 48)"
  sed -E -e "s|^JWT_SECRET=.*|JWT_SECRET=$JWT|" -e "s|^ML_INTERNAL_KEY=.*|ML_INTERNAL_KEY=$ML_KEY|" -e 's|[[:space:]]+#.*$||' server/.env.example > server/.env
  echo "created server/.env (ML_INTERNAL_KEY copied from ml-service/.env)"
fi
[ -f client/.env ] || { cp client/.env.example client/.env; echo "created client/.env"; }

step "Doctor"
node scripts/doctor.mjs || true
echo; echo "Next: three terminals ->  (cd server && npm run dev:db)  (cd ml-service && venv/bin/python -m uvicorn app.main:app --port 8000)  (cd server && npm run dev)  (cd client && npm run dev)"
