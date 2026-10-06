# Autonomous validation

The release gate is `pnpm run check`. Run it without filters before calling a change ready. It checks production JavaScript, validates the package, and runs real Chromium against the extracted release ZIP. No user browser profile, camera, or internet site is used: tests have disposable profiles, synthetic camera frames, and local HTTP/HTTPS sites.

## Failure model (written before extending the harness)

| Risk | Owning check and evidence |
| --- | --- |
| A block, commitment, counter, or migration breaks | Existing browser E2E tests, including redirects, frames, denied camera, Incognito and browser/worker restarts |
| A release omits a script, font or manifest resource; includes private/dev files | ZIP resource validation and browser tests loaded from that exact ZIP; SHA-256 receipt |
| A JavaScript typo survives syntax checking | Production ESLint with environment-specific globals and recommended correctness rules |
| A control is inaccessible or text unreadable | axe WCAG A/AA scans of loaded UI states; JSON scans and screenshots; existing keyboard commitment flow |
| Local photos/history leak through a new network feature | Resource validation plus observed HTTP(S)/WebSocket traffic during a real capture, report and gallery journey |
| Browser errors occur without failing an assertion | Every context records console, failed requests and uncaught page errors; uncaught errors fail teardown |
| A passing test never checks its promised behavior | Isolated fault injection must fail the owning test at its expected assertion; baseline must pass first; startup errors or whole-test timeouts do not count |
| Timing problems appear only after many actions | Reproducible navigation seeds and soak tests, with action journal and time/accounting assertions |
| Browser startup drops an attempt event | Six real profile restarts with the runner constrained to one CPU on Linux; preserved counts and new attempts are asserted |
| CI tests different bytes from the release | Publishing downloads the tested ZIP instead of rebuilding it |
| AI dismisses a failure or asks the user to finish testing | Agent completion rules in AGENTS.md; reports retained on success and failure |

New coverage belongs at observable browser boundaries. Do not add implementation-copying unit tests or production test hooks. A discovered defect needs a failing browser regression before its fix. Stop test processes before changing their checkout. Never turn retries on to hide a failure.

## Commands

- `pnpm run check`: complete release gate, HTML report in `playwright-report/`, per-test traces/screenshots/diagnostics in `test-results/`, package and manifest receipt in `dist/`.
- `pnpm run test:mutations`: baseline plus deliberate faults in isolated extracted copies; JSON verdicts and separate reports in `validation-results/mutations/`.
- `pnpm run check:deep`: full release gate, five navigation seeds, extended soak, six constrained startup runs and mutation checks. `TEST_SOAK_MS` overrides the default 15-minute soak for local investigations.
- `python3 scripts/check-startup.py`: replay constrained startup checks against the most recently validated `dist/test-extension` package.
- `pnpm exec playwright show-report`: inspect the default browser report. For the deep run, use `pnpm exec playwright show-report validation-results/deep/report`. Trace attachments open the actual actions and DOM.

An injected fault is a check of the verifier, not additional product coverage. If a mutation anchor no longer matches after refactoring, update the fault explicitly; do not silently skip it.

The mutation command checks four browser faults: commitment bypass, double-counted attempts, page telemetry, and worker telemetry. It also runs the actual package validator against ZIPs containing a missing font, a private file, and a remote stylesheet. Each negative control must fail for its intended reason.

## Defects found while building this system

The initial accessibility scans failed on muted-text contrast across the screens and the gallery capacity field's missing label. The affected text now uses readable contrast, and the capacity field has an accessible name and hint. The failing baseline is saved locally in `validation-results/a11y-before.json`.

A full browser run also exposed a cold-start accounting race: a site was blocked, but the attempt count stayed at one instead of increasing to two after restarting Chrome. Under constrained CPU scheduling, six of eight diagnostic runs reproduced it. Traces showed that Chrome loaded the blocked document without delivering its `webNavigation.onCommitted` event to the starting worker. The block page now acknowledges its navigation in its camera request; the worker saves the document ID together with the count to deduplicate both notification paths. Reload and back/forward navigation remain excluded. Evidence from the original failure and instrumented reproduction is in `validation-results/deep-first-failure/` and `validation-results/restart-instrumented/`.

## Verification on 2026-10-02

- Complete browser gate: **95 passed**, including five 100-action navigation seeds and a three-minute local soak. [HTML report](../validation-results/deep/report/index.html).
- Constrained browser restarts after the repair: **6 passed**. [Startup report](../validation-results/startup/report/index.html).
- Mutation gate: clean three-test baseline passed; **4 browser faults and 3 broken packages caught** at the intended checks. [Verdicts](../validation-results/mutations/summary.json), [package verdicts](../validation-results/package-faults/results.json).
- All 95 browser cases have a trace, screenshot and diagnostics attachment. [Evidence audit](../validation-results/evidence-audit.json).
- Runtime lint, syntax, TypeScript fixture checks and ZIP validation passed. Dependency audit reported no known vulnerabilities; actionlint 1.7.12 accepted both workflows.

Generated reports are local, ignored artifacts; CI creates and retains its own copies. The scheduled soak is 15 minutes; the local verification used three minutes. Changes have not been published.

CI runs the full deep gate for pull requests and main pushes: the complete release gate, five navigation seeds, a 15-minute soak, six constrained startup runs and mutation checks. Publishing depends on that job succeeding and on `manifest.json` having a higher numeric version than the revision before the push. An unchanged or decreased version skips publishing while still running the full suite. Publishing downloads the tested ZIP with a SHA-256 check. Reports are retained for 14 days even when validation fails. A separate scheduled/manual workflow also runs the deep gate. Checks do not automatically repair, commit or publish changes from scheduled runs.

## Research and limits

The pre-deployment wiring was revalidated on 2026-10-06 with `TEST_SOAK_MS=180000 pnpm run check:deep`: 95 browser cases and six constrained startup runs passed; all four browser faults and three broken packages were caught. This includes the unfiltered `pnpm run check` and mutation commands. Screenshots and traces for commitment and privacy flows were inspected. Both workflow files passed actionlint 1.7.12. The local soak was three minutes; the publishing workflow explicitly sets 15 minutes.

- [Chrome: end-to-end extension testing](https://developer.chrome.com/docs/extensions/how-to/test/end-to-end-testing): exercise user-visible behavior and test worker termination.
- [Playwright: Chrome extensions](https://playwright.dev/docs/chrome-extensions): persistent Chromium contexts are the supported extension test environment.
- [Playwright: accessibility](https://playwright.dev/docs/accessibility-testing): scan actual UI states and attach complete results. Automated scans cover only part of accessibility; passing them is not a WCAG certification.
- [OpenAI: harness engineering](https://openai.com/index/harness-engineering/): make repository instructions, invariants and evidence executable and available to future agents.
- Twitter/X research was attempted on 2026-10-02. Original Boris Cherny posts [1](https://x.com/bcherny/status/2007179832300581177) and [2](https://x.com/bcherny/status/2064426115255730578) returned HTTP 403. Reposts were not treated as verified technical sources.

This system reduces the need for the owner to test each change. It cannot prove perfection: bundled Chromium differs from every user's browser/OS, synthetic cameras do not cover hardware failures, fake sites do not cover every future YouTube markup change, and automated scans cannot judge every aspect of usability. Forced worker shutdown tests exercise restoration, not Chrome's exact natural idle timing. Network monitoring covers the exercised journey, not all conceivable delayed behavior. Keep these limitations explicit instead of presenting a green count as certainty.
