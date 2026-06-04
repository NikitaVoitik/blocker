// Runs once after the coverage test run: aggregate every raw __coverage__ dump
// written by the fixture and generate the reports.

const fs = require('node:fs');
const path = require('node:path');
const { CoverageReport } = require('monocart-coverage-reports');
const coverageOptions = require('./coverage-options.cjs');

module.exports = async () => {
  const rawDir = path.resolve(__dirname, '.raw');
  const files = fs.existsSync(rawDir)
    ? fs.readdirSync(rawDir).filter((f) => f.endsWith('.json'))
    : [];

  const mcr = new CoverageReport(coverageOptions);
  let added = 0;
  for (const f of files) {
    try {
      const data = JSON.parse(fs.readFileSync(path.join(rawDir, f), 'utf8'));
      if (data && Object.keys(data).length) {
        await mcr.add(data);
        added++;
      }
    } catch (e) {
      console.warn(`[coverage] skipped ${f}: ${e.message}`);
    }
  }

  if (!added) {
    console.warn('[coverage] no coverage data collected — was COVERAGE=1 set?');
    return;
  }

  await mcr.generate();
  console.log(
    `[coverage] aggregated ${added} dump(s) → ${path.join(coverageOptions.outputDir, 'index.html')}`,
  );
};
