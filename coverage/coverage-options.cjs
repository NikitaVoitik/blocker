// Shared monocart-coverage-reports config. Coverage data is istanbul format
// (read from `__coverage__`), keyed by absolute original source paths, so the
// report renders against the real (un-instrumented) files.

const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const SRC_RE = /\/(?:background|blocked|popup|report|lib|setup|offscreen|content)\/[^/]+\.js$/;

module.exports = {
  name: 'Blocker Extension Coverage',
  outputDir: path.join(ROOT, 'coverage', 'report'),
  baseDir: ROOT,
  reports: [['console-details'], ['html'], ['lcov'], ['json-summary']],
  // Safety net: only our 9 source files. (Keys are already exactly these.)
  sourceFilter: (sourcePath) => SRC_RE.test(`/${String(sourcePath).replace(/\\/g, '/')}`),
  watermarks: [80, 95],
  clean: true,
  cleanCache: false,
  logging: 'info',
};
