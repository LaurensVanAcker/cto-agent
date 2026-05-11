#!/usr/bin/env bash
# Loopt voor Claude een sessie afsluit. Print state in chat zodat jij of
# de volgende sessie meteen ziet of er nog werk open ligt.

set -u
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"

echo "[pre-stop] backend typecheck"
( cd "$ROOT" && npm run -s typecheck ) 2>&1 | tail -n 10

echo "[pre-stop] frontend build smoke"
( cd "$ROOT/frontend" && npx --no-install ng build --configuration=development --output-path=dist/smoke 2>&1 | tail -n 10 ) || true

echo "[pre-stop] git status"
( cd "$ROOT" && git status --short )
