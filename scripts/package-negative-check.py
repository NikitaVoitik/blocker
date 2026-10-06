#!/usr/bin/env python3
"""Artifact-level negative controls: run the real package gate on broken ZIPs."""
import json
import pathlib
import subprocess
import sys
import zipfile

root = pathlib.Path(__file__).resolve().parent.parent
receipt = json.loads((root / 'dist/package-receipt.json').read_text())
output = root / 'validation-results/package-faults'
output.mkdir(parents=True, exist_ok=True)
with zipfile.ZipFile(root / 'dist' / receipt['archive']) as archive:
    original = {name: archive.read(name) for name in archive.namelist()}

cases = [
    ('missing-font', 'Missing web-accessible resource: assets/fonts/space-mono-400-latin.woff2', lambda files: files.pop('assets/fonts/space-mono-400-latin.woff2')),
    ('private-file', 'Unexpected release file', lambda files: files.update({'assets/.env': b'SYNTHETIC_NOT_A_SECRET=1'})),
    ('remote-resource', 'Non-local resource', lambda files: files.update({'popup/popup.css': files['popup/popup.css'] + b'\n@import url("https://telemetry.invalid/style.css");'})),
]
results = []
for name, expected, mutate in cases:
    files = original.copy()
    mutate(files)
    broken = output / f'{name}.zip'
    with zipfile.ZipFile(broken, 'w', zipfile.ZIP_DEFLATED) as archive:
        for filename, content in files.items():
            archive.writestr(filename, content)
    run = subprocess.run([sys.executable, str(root / 'scripts/validate-package.py'), str(broken)], capture_output=True, text=True, timeout=20)
    caught = run.returncode != 0 and expected in run.stderr
    results.append({'fault': name, 'caught': caught, 'exitCode': run.returncode, 'stderr': run.stderr})
    (output / 'results.json').write_text(json.dumps(results, indent=2) + '\n')
    if not caught:
        raise SystemExit(f'{name}: package gate accepted the fault or failed for the wrong reason')
print('All 3 broken packages rejected for the intended reason.')
