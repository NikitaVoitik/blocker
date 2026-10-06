#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
export TEST_SEEDS="${TEST_SEEDS:-73421,1,42,20261002,4294967295}"
export TEST_SOAK_MS="${TEST_SOAK_MS:-900000}"
export PLAYWRIGHT_HTML_OUTPUT_DIR="$PWD/validation-results/deep/report"
pnpm run check --output=validation-results/deep/results
python3 scripts/check-startup.py
pnpm run test:mutations
