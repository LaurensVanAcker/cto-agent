#!/usr/bin/env bash
# Wordt door Claude Code aangeroepen na elke Edit/Write/MultiEdit.
# Doel: snelle, gerichte feedback (lint + test op relevante scope) zodat Claude
# zelf kan zien wat hij heeft stukgemaakt en zonder vraag aan jou kan corrigeren.

set -u

FILE="${1:-}"
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"

# Skip niet-source bestanden (markdown, json config, lockfiles, ...)
case "$FILE" in
  *.ts|*.tsx|*.html|*.scss|*.css|*.js) ;;
  *) exit 0 ;;
esac

echo "[post-edit] $FILE"

# Bepaal of we frontend- of backend-scope raken
if [[ "$FILE" == *"/frontend/"* ]]; then
  cd "$ROOT/frontend" || exit 0
  echo "[post-edit] frontend lint"
  npx --no-install ng lint --quiet 2>&1 | tail -n 40 || true
  echo "[post-edit] frontend unit tests (headless, no watch)"
  npx --no-install ng test --watch=false --browsers=ChromeHeadless --code-coverage=false 2>&1 | tail -n 60 || true
else
  cd "$ROOT" || exit 0
  echo "[post-edit] backend typecheck"
  npm run -s typecheck 2>&1 | tail -n 40 || true
fi
