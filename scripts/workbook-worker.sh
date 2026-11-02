#!/bin/bash
# The LaunchAgent's command for the workbook worker (D-200, docs/workbook-worker.md). It runs in the worker's dedicated
# checkout: moves it to origin/main, installs packages when package-lock.json changed, then starts the worker with
# --follow-main. The worker exits between runs when origin/main moves; launchd (KeepAlive) starts this script again,
# which pulls the new code. A failed fetch keeps the code it has.
set -u
cd "$(dirname "$0")/.." || exit 1
echo "$(date -u +%FT%TZ) workbook-worker.sh: starting in $(pwd)"
if git fetch --quiet origin main; then
  before=$(git rev-parse HEAD 2>/dev/null || echo none)
  git checkout --quiet --detach origin/main
  after=$(git rev-parse HEAD)
  if [ "$before" != "$after" ] || [ ! -d node_modules ]; then
    if [ ! -d node_modules ] || ! git diff --quiet "$before" "$after" -- package-lock.json 2>/dev/null; then
      echo "$(date -u +%FT%TZ) workbook-worker.sh: npm ci"
      npm ci --no-audit --no-fund || exit 1
    fi
  fi
  echo "$(date -u +%FT%TZ) workbook-worker.sh: on $(git rev-parse --short HEAD)"
else
  echo "$(date -u +%FT%TZ) workbook-worker.sh: git fetch failed; keeping $(git rev-parse --short HEAD)"
fi
exec node scripts/workbook-worker.mjs --follow-main
