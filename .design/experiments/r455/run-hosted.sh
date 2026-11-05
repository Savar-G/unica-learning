#!/bin/sh
# Builds and runs one phase of scripts/scan-crops-hosted.ts: prepare, seed, check, deletion or cleanup.
# Needs .env.local, a dev server on SCAN_BASE, and SCAN_FIXTURE (a private path for the test families' passwords).
set -e
out=node_modules/.cache/scan-crops-hosted.mjs
npx esbuild scripts/scan-crops-hosted.ts --bundle --platform=node --format=esm --packages=external --tsconfig=tsconfig.json --alias:server-only=./node_modules/server-only/empty.js --alias:next/headers=next/headers.js --alias:next/navigation=next/navigation.js --log-level=warning --outfile="$out"
exec node "$out" "$1"
