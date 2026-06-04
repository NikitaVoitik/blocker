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

## Result

**97.4% lines** overall. Per file (lines): service-worker 96%, blocked 99%,
content 100%, filters 97%, popup 99%, report 100%, setup 100%; storage 89% and
offscreen 82% (see below).

## Documented remainder

These lines are intentionally uncovered — they need browser events the harness
can't deliver, defensive error paths that can't fail in the test environment, or
dead code. They are auditable, not forgotten.

| File | Lines | Why |
|------|-------|-----|
| `background/service-worker.js` | 243-250 | `verifyBlockRules` — only invoked by the periodic RULE_CHECK alarm |
| | 1405-1411 | `alarms.onAlarm` dispatch — alarms don't fire within a short test |
| | 549, 564-576, 588 | `tabs.onActivated` catch + `windows.onFocusChanged` + SPA-nav branch — depend on real OS focus/tab events not delivered under Xvfb |
| | 1392-1394, 1400 | `onInstalled` *update* branch + `onStartup` — one-shot lifecycle events (install fires `"install"`; startup fires before tests attach) |
| `blocked/blocked.js` | 628, 656 | Error-status branches for `SET_PHOTO_LIMIT`/`CLEAR_PHOTOS` responses that can't fail for valid input |
| `lib/filters.js` | 86-87 | `default` overlay-position case — no shipped overlay config uses it |
| `lib/storage.js` | 27-29, 33 | `onupgradeneeded` — the service worker always creates the DB first, so this unused legacy helper never triggers an upgrade |
| `offscreen/offscreen.js` | 15, 44-45, 55-57, 65-67 | Video-ready early-return, `error` handler, and 5s load-timeout — require real-camera failure/timing (the fake device always loads cleanly) |
| `popup/popup.js` | 389, 508, 646 | `try/catch` error handlers for messaging/storage calls that don't fail in tests |
| | 245 | "Always" clicked on an already-always restriction (UI no-op branch) |
