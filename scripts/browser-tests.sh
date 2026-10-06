#!/usr/bin/env bash
set -euo pipefail
if [[ "${1:-}" == "--" ]]; then shift; fi
cd "$(dirname "$0")/.."
if [[ -z "${DISPLAY:-}" && "$(uname -s)" == "Linux" ]]; then
  exec xvfb-run -a pnpm exec playwright test "$@"
else
  exec pnpm exec playwright test "$@"
fi
