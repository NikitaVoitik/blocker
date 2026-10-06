#!/usr/bin/env python3
"""Exercise real cold starts under constrained CPU scheduling, without mocks."""
import os
import pathlib

root = pathlib.Path(__file__).resolve().parent.parent
os.chdir(root)
if hasattr(os, 'sched_getaffinity'):
    os.sched_setaffinity(0, {min(os.sched_getaffinity(0))})
os.environ['EXTENSION_UNDER_TEST'] = str(root / 'dist/test-extension')
os.environ['PLAYWRIGHT_HTML_OUTPUT_DIR'] = str(root / 'validation-results/startup/report')
os.execvp('bash', ['bash', 'scripts/browser-tests.sh', 'lifecycle.spec.ts', '--grep',
                   'browser restart retains custom blocks, removals and attempt evidence',
                   '--repeat-each=6', '--output=validation-results/startup/results'])
