# Punishment Mode: product direction

Punishment Mode is a Chrome extension for people who want distracting sites blocked outright. When a user chooses to block a site, the extension should hold that line, confront each attempted visit, and keep local evidence of the relapse. The tone is blunt, confrontational, and "no mercy," consistent with the existing shame selfie, roast, removal gauntlet, and report.

## Product rules

- A blocked site stays blocked until the user deliberately removes it. Do not add daily time allowances, automatic unblocking, or softer modes that make visiting a blocked site part of the normal flow.
- Make blocking dependable across URL variants, redirects, browser restarts, and other routes into the same site. Treat gaps in enforcement as core product bugs.
- Make attempts and removals visible in the local report. Consequences should be tied to what the user actually did, not arbitrary friction.
- Keep browsing history, stats, and shame photos on the device. The product currently promises no accounts, cloud service, or analytics; do not add telemetry or transmission without an explicit change to that direction and its privacy disclosures.
- Be honest about browser limits. A user can disable or uninstall a Chrome extension, and Incognito protection requires the user to allow it in Chrome settings. Never claim the block is impossible to bypass.
- Keep the existing brutalist, surveillance-terminal visual style. Functional improvements should still feel like Punishment Mode.

## Testing rules

- NEVER write unit tests after writing the code they test.
- Highly prefer E2E tests as the sole testing mechanism for complex features. Use them to verify the feature works, and produce a verifiable, repeatable artifact at the end of each E2E test.
- If a system must be tested in isolation, FIRST write all the ways it could fail, THEN write the code.

## Autonomous completion gate

- Own validation through completion; do not hand routine browser testing back to the owner. See [docs/validation.md](docs/validation.md) for the failure model, commands and limitations.
- Reproduce a discovered bug with a failing browser regression before fixing it. Keep source and tests unchanged while a runner is using their checkout.
- Run `pnpm run check` without filters before declaring a change ready. This lints runtime JavaScript and tests the extracted release ZIP. Inspect the screenshots and traces for affected flows, not only the pass count.
- For changes to enforcement, privacy, lifecycle, or the validation harness, also run `pnpm run test:mutations` and a multi-seed/extended soak run (`TEST_SOAK_MS=180000 pnpm run check:deep` is a bounded local run; CI uses 15 minutes).
- Fix failures or report the specific blocker and saved evidence. Do not weaken assertions, turn on retries, or silently update a baseline to get green. State what was actually run and any remaining limits. Never claim automated checks prove perfection.

## Next directions

1. Audit and test blocking coverage first.
2. Consider an optional commitment lock that delays removal through the popup; it must never auto-unblock a site.
3. Warn clearly when Incognito access is off and explain how to enable it.
4. Sharpen the local shame report with repeat attempts, attempts after removal, and clean streaks.

See [IDEAS.md](IDEAS.md) for the working ideas list. These directions are proposals, not shipped features.
