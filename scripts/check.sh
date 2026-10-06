#!/usr/bin/env bash
set -euo pipefail
if [[ "${1:-}" == "--" ]]; then shift; fi
cd "$(dirname "$0")/.."
pnpm run check:syntax
pnpm run check:lint
pnpm run check:types
pnpm run package:ext
pnpm run check:package
EXTENSION_UNDER_TEST="$PWD/dist/test-extension" bash scripts/browser-tests.sh "$@"
