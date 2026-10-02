#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
pnpm run check:syntax
pnpm run check:types
if [[ -z "${DISPLAY:-}" && "$(uname -s)" == "Linux" ]]; then
  xvfb-run -a pnpm exec playwright test "$@"
else
  pnpm exec playwright test "$@"
fi
