// Deliberate faults validate the verifier. Never mutate the working extension.
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { createHash } = require('node:crypto');
const root = path.resolve(__dirname, '..');
process.chdir(root);
const output = path.join(root, 'validation-results/mutations');
fs.mkdirSync(output, { recursive: true });
const faults = [
  {
    name: 'commitment-bypass', file: 'background/service-worker.js',
    before: 'Number.isFinite(site.lockUntil) && site.lockUntil > Date.now()',
    after: 'Number.isFinite(site.lockUntil) && site.lockUntil < Date.now()',
    test: 'a popup clock set past the deadline cannot convince the worker to remove a committed site',
    owner: 'commitment-lock.spec.ts', assertion: 'COMMITMENT_ACTIVE',
  },
  {
    name: 'double-count-attempts', file: 'background/service-worker.js',
    before: 'const newAllTime = (result.attemptCount || 0) + 1;',
    after: 'const newAllTime = (result.attemptCount || 0) + 2;',
    test: 'each blocked visit is recorded once even without a photo, including concurrent visits',
    owner: 'enforcement-regressions.spec.ts', assertion: 'Expected: 6',
  },
  {
    name: 'outbound-telemetry', file: 'report/report.js',
    before: null, after: '\nfetch("https://telemetry.invalid/collect", { method: "POST", body: "synthetic-test-only" }).catch(() => {});\n',
    test: 'capture, report and gallery keep photos and browsing data on the device',
    owner: 'privacy.spec.ts', assertion: 'Unexpected network traffic',
  },
  {
    name: 'worker-telemetry', file: 'background/service-worker.js',
    before: null, after: '\nchrome.runtime.onMessage.addListener(message => { if (message.type === "GET_REPORT_DATA") fetch("https://telemetry.invalid/worker", { method: "POST", body: "synthetic-test-only" }).catch(() => {}); });\n',
    test: 'capture, report and gallery keep photos and browsing data on the device',
    owner: 'privacy.spec.ts', assertion: 'Unexpected network traffic',
  },
];
const summary = { startedAt: new Date().toISOString(), package: null, results: [] };
const save = () => fs.writeFileSync(path.join(output, 'summary.json'), JSON.stringify(summary, null, 2) + '\n');
function command(cmd, args, options = {}) {
  const result = spawnSync(cmd, args, { cwd: root, encoding: 'utf8', ...options });
  if (result.error || result.status !== 0) throw new Error(`${cmd} failed: ${result.error || result.stderr || result.stdout}`);
  return result;
}
const escape = value => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
function specs(suites) { return suites.flatMap(suite => [...suite.specs, ...specs(suite.suites || [])]); }
function run(name, extension, titles) {
  const folder = path.join(output, name);
  fs.rmSync(folder, { recursive: true, force: true });
  fs.mkdirSync(folder, { recursive: true });
  const log = fs.openSync(path.join(folder, 'runner.log'), 'w');
  console.log(`Checking ${name}; evidence: ${path.relative(root, folder)}`);
  let result;
  try {
    result = spawnSync('bash', ['scripts/browser-tests.sh', '--project=tier2', '--grep', titles.map(escape).join('|'), '--reporter=list,json,html', '--output', path.join(folder, 'results')], {
      cwd: root, timeout: 180_000, stdio: ['ignore', log, log],
      env: { ...process.env, EXTENSION_UNDER_TEST: extension, PLAYWRIGHT_JSON_OUTPUT_FILE: path.join(folder, 'results.json'), PLAYWRIGHT_HTML_OUTPUT_DIR: path.join(folder, 'report'), PLAYWRIGHT_HTML_OPEN: 'never' },
    });
  } finally { fs.closeSync(log); }
  if (result.error || result.signal) throw new Error(`${name}: runner infrastructure failure: ${result.error || result.signal}`);
  const report = JSON.parse(fs.readFileSync(path.join(folder, 'results.json'), 'utf8'));
  if (report.errors.length) throw new Error(`${name}: runner errors, not a behavioral failure`);
  const cases = specs(report.suites).flatMap(spec => spec.tests.map(test => ({ title: spec.title, ...test })));
  if (cases.length !== titles.length || cases.some(test => test.results.length !== 1)) throw new Error(`${name}: missing, duplicate or retried tests`);
  return { status: result.status, cases };
}

try {
  command('bash', ['scripts/package.sh']);
  command('python3', ['scripts/validate-package.py']);
  summary.package = JSON.parse(fs.readFileSync('dist/package-receipt.json', 'utf8'));
  const baselinePath = path.join(root, 'dist/test-extension');
  const baseline = run('baseline', baselinePath, [...new Set(faults.map(fault => fault.test))]);
  if (baseline.status !== 0 || baseline.cases.some(test => test.results[0].status !== 'passed')) throw new Error('Baseline must pass before injecting faults');
  summary.results.push({ name: 'baseline', status: 'passed', tests: baseline.cases.length });
  save();
  for (const fault of faults) {
    const extension = path.join(output, `extension-${fault.name}`);
    fs.rmSync(extension, { recursive: true, force: true });
    fs.cpSync(baselinePath, extension, { recursive: true });
    const file = path.join(extension, fault.file);
    let source = fs.readFileSync(file, 'utf8');
    if (fault.before) {
      if (source.split(fault.before).length !== 2) throw new Error(`${fault.name}: fault anchor changed; review the injection`);
      source = source.replace(fault.before, fault.after);
    } else source += fault.after;
    fs.writeFileSync(file, source);
    command(process.execPath, ['--check', file]);
    const result = run(fault.name, extension, [fault.test]);
    const failure = result.cases[0].results[0];
    const intended = result.status === 1 && failure.status === 'failed' && failure.errors.some(error =>
      error.location?.file.endsWith(fault.owner) && (error.message || '').replace(/\u001b\[[0-9;]*m/g, '').includes(fault.assertion));
    summary.results.push({ name: fault.name, status: intended ? 'caught' : 'inconclusive-or-survived', test: fault.test, file: fault.file, modifiedSha256: createHash('sha256').update(source).digest('hex'), errors: failure.errors });
    save();
    if (!intended) throw new Error(`${fault.name}: fault survived or failed for an unrelated reason; inspect its report`);
    fs.rmSync(extension, { recursive: true, force: true });
  }
  command('python3', ['scripts/package-negative-check.py']);
  summary.results.push({ name: 'package-faults', status: 'caught', cases: 3 });
  summary.finishedAt = new Date().toISOString();
  save();
  console.log('All 4 browser faults and 3 broken packages were caught at their intended checks.');
} catch (error) {
  summary.error = String(error);
  save();
  console.error(error.message);
  process.exitCode = 1;
}
