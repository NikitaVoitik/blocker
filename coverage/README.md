# Coverage

Measures test coverage of the extension's JavaScript by running the existing
Playwright suite against an **istanbul-instrumented copy** of the extension.

```bash
npm run coverage
```

Open `coverage/report/index.html` for the line-by-line HTML report. `npm test`
and the `test:tier*` scripts are unaffected — coverage only activates when the
`coverage` script sets `COVERAGE=1`.

## How it works

1. `coverage/global-setup.cjs` builds an instrumented copy of the extension into
   `coverage/.instrumented/` (via `coverage/instrument.cjs`, using
   `istanbul-lib-instrument`). MV3 forbids `eval`/`new Function`, so it
   instruments with `coverageGlobalScopeFunc:false`.
2. `tests/e2e/fixtures/extension.ts` (gated on `COVERAGE=1`) loads that copy
   instead of the repo root. On context teardown it reads the cumulative
   `__coverage__` counter from the service worker (`Worker.evaluate`) and every
   page, writing raw dumps to `coverage/.raw/`. A `page.close` hook flushes
   coverage for pages a test closes before teardown.
3. `coverage/global-teardown.cjs` aggregates the dumps with
   `monocart-coverage-reports` into `coverage/report/` (console + HTML + lcov +
   json-summary).

Only tier1 + tier2 feed the report (tier3 is soak/stress and adds no new lines).

## Results

Run `npm run coverage` to regenerate the report for the current source tree.
