#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
VERSION=$(node -p "require('./manifest.json').version")
ZIP_FILE="dist/blocker-${VERSION}.zip"
mkdir -p dist
rm -f "$ZIP_FILE"
# Only ship runtime files. Local photos, test results and previous ZIPs stay out.
python3 - "$ZIP_FILE" <<'PY'
import pathlib
import sys
import zipfile

roots = ['manifest.json', 'rules.json', 'assets', 'background', 'blocked',
         'content', 'lib', 'offscreen', 'popup', 'report', 'setup']
with zipfile.ZipFile(sys.argv[1], 'w', zipfile.ZIP_DEFLATED) as archive:
    for root in roots:
        path = pathlib.Path(root)
        files = [path] if path.is_file() else sorted(path.rglob('*'))
        for file in files:
            if file.is_file():
                # Stable bytes let receipts identify the artifact across runs.
                entry = zipfile.ZipInfo(file.as_posix(), (2020, 1, 1, 0, 0, 0))
                entry.compress_type = zipfile.ZIP_DEFLATED
                entry.external_attr = 0o100644 << 16
                archive.writestr(entry, file.read_bytes())
PY
