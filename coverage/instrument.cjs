// Builds a throwaway, istanbul-instrumented copy of the extension under
// coverage/.instrumented/. The coverage run loads THIS copy instead of the
// repo root, so every executed line bumps a cumulative `__coverage__` counter
// (including service-worker startup code, which V8 precise-coverage misses).
//
// MV3 forbids eval/new Function under CSP, so we instrument with
// coverageGlobalScopeFunc:false + coverageGlobalScope:'globalThis'.

const fs = require('node:fs');
const path = require('node:path');
const { createInstrumenter } = require('istanbul-lib-instrument');

const ROOT = path.resolve(__dirname, '..');
const INSTRUMENTED_DIR = path.join(ROOT, 'coverage', '.instrumented');

// Everything the unpacked extension needs at runtime.
const COPY = [
  'manifest.json',
  'rules.json',
  'background',
  'blocked',
  'popup',
  'report',
  'lib',
  'setup',
  'offscreen',
  'content',
  'assets',
];

// The source files we measure (relative to repo root).
const INSTRUMENT = [
  'background/service-worker.js',
  'blocked/blocked.js',
  'popup/popup.js',
  'report/report.js',
  'lib/filters.js',
  'lib/storage.js',
  'setup/setup.js',
  'offscreen/offscreen.js',
  'content/youtube-shorts.js',
];

function buildInstrumented() {
  fs.rmSync(INSTRUMENTED_DIR, { recursive: true, force: true });
  fs.mkdirSync(INSTRUMENTED_DIR, { recursive: true });

  for (const item of COPY) {
    const src = path.join(ROOT, item);
    if (!fs.existsSync(src)) continue;
    fs.cpSync(src, path.join(INSTRUMENTED_DIR, item), { recursive: true });
  }

  const instrumenter = createInstrumenter({
    coverageVariable: '__coverage__',
    coverageGlobalScope: 'globalThis',
    coverageGlobalScopeFunc: false, // CSP-safe: no `new Function`
    esModules: false, // plain classic scripts
    compact: false,
    produceSourceMap: false,
  });

  for (const rel of INSTRUMENT) {
    const origPath = path.join(ROOT, rel);
    const code = fs.readFileSync(origPath, 'utf8');
    // filename = absolute original path → coverage keys point at the real source,
    // so the report renders against the un-instrumented file on disk.
    const instrumented = instrumenter.instrumentSync(code, origPath);
    fs.writeFileSync(path.join(INSTRUMENTED_DIR, rel), instrumented);
  }

  return INSTRUMENTED_DIR;
}

module.exports = { buildInstrumented, INSTRUMENTED_DIR, ROOT, INSTRUMENT };
