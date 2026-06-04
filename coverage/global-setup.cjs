// Runs once before the coverage test run: clear stale artifacts and build the
// instrumented copy of the extension that tests will load.

const fs = require('fs');
const path = require('path');
const { buildInstrumented } = require('./instrument.cjs');

module.exports = async () => {
  const rawDir = path.resolve(__dirname, '.raw');
  const reportDir = path.resolve(__dirname, 'report');
  fs.rmSync(rawDir, { recursive: true, force: true });
  fs.rmSync(reportDir, { recursive: true, force: true });
  fs.mkdirSync(rawDir, { recursive: true });

  const out = buildInstrumented();
  console.log(`[coverage] built instrumented extension → ${out}`);
};
