# Optional commitment lock

## Product contract

A commitment locks **removal**, not the duration of a block. Every site remains blocked until it is deliberately removed through the existing gauntlet. No expiry alarm removes a site or disables its rules. Locks, deadlines, attempts and photos stay on the device.

## UX candidates

The interactive source is `docs/demos/commitment-lock.html`; the standalone preview is `docs/demos/commitment-lock-preview.html`. Run `node docs/demos/exercise-commitment-lock.cjs` for three repeated rounds of each candidate, including actual dwell time in the active and expired states. Screenshots, a trace and timing receipts are written to `docs/demos/commitment-lock-evidence/`.

| Candidate | Strength | Cost | Decision |
| --- | --- | --- | --- |
| A: duration picker beside Add | Can block and commit in one flow | Adds a decision to ordinary blocking; leaves existing/default sites without a lock entry point | Keep as a comparison demo |
| B: Lock action in each blocked row | Works for default and custom sites; keeps commitment explicit and local to the affected site | Adds a small action to each unlocked row | Use in the extension |
| C: separate Commitments screen | Gives room for a commitment overview | Adds a navigation step and duplicates the blocked list in a 320px popup | Keep as a comparison demo |

These are an agent's scripted browser walkthroughs and design assessment, not human usability research or a multi-day field trial.

## Selected flow

1. Ordinary Block and preset actions keep their current behavior, with no lock by default.
2. Each unlocked blocked site has a text **Lock** button beside its removal action.
3. Lock opens a compact confirmation sheet: **NO EARLY REMOVAL.**, the site, choices **1 hour / 24 hours / 7 days / Custom**, and the exact local removal date and time. Custom accepts whole hours or days, from 1 hour to 365 days, and updates the preview as the user edits. Empty, fractional, non-positive or oversized values show an error and disable confirmation. Default selection is 24 hours each time the sheet opens; choosing a duration does not start a lock.
4. Explain before confirmation: **The site stays blocked after this deadline.** The commitment cannot be shortened here, and Chrome still permits disabling or uninstalling the extension.
5. Confirm with **Lock removal for [duration]**. Cancel, Escape and closing the popup leave storage untouched.
6. While active, the row replaces removal with **Locked · [time remaining]** and shows the deadline. Clicking it opens **YOU MADE A DEAL.** with details. There is no early-release or extend control.
7. Expiry changes the row to **Commitment served · still blocked** and restores Lock and the existing removal gauntlet. Expiry never counts as a surrender.

The visual system keeps black surfaces, acid yellow for commitment, red for surrender, square corners, Bebas Neue headings and Space Mono labels. The signature is a deadline receipt in the confirmation/details sheet, rather than a large countdown. Maintain a usable layout at the existing 320px popup width, visible focus, dialog focus containment and reduced-motion support.

## Storage and enforcement

Persist `lockStartedAt` and `lockUntil` with the blocked site. The service worker computes the deadline from its own clock and validates durations as integer hours in the range 1–8760 (365 days). The popup converts whole days to hours before sending the request. A popup-provided deadline is never authoritative. An active lock rejects attempts to replace, shorten or remove it. Site mutations read current local storage so a stale popup/worker cannot rely on an outdated list.

The removal owner checks the lock before capturing a removal selfie or writing surrender evidence. Its serial site-mutation queue covers concurrent normal popups. Storage changes refresh an open popup, and a timer refreshes expiration without requiring it to reopen. Existing sites without timestamps remain unlocked. Existing blockers, rules and photos need no migration.

## Failure cases to cover before implementation

- Choosing or cancelling a duration accidentally starts a commitment.
- An old/default site acquires a lock without deliberate confirmation.
- The popup submits a deadline based on its clock rather than the worker's.
- Zero, negative, fractional, unsupported, string or non-finite durations are accepted.
- An active lock is shortened, replaced or removed through a runtime message, duplicate Add, a stale gauntlet or another popup.
- A rejected removal captures a selfie, increments surrender/attempt counts or creates removal evidence.
- Closing/reopening the popup, terminating the worker or restarting Chrome loses the lock.
- A stale popup fails to display a commitment set elsewhere.
- Expiry silently unblocks the site, counts a surrender or bypasses the gauntlet.
- Expiry fails to update an already open popup.
- Legacy sites, custom domains, presets and unlocked removals stop working.
- Long site names overflow; dialog focus escapes; Escape mutates a lock; keyboard selection unexpectedly confirms it.

## Validation

Use real extension E2E tests at the popup/runtime/navigation boundaries. Test a last-seconds persisted deadline to exercise expiry without waiting an hour or adding production test hooks. Keep a screenshot, JSON evidence and Playwright trace for each new commitment test. Run the new tests before production implementation to demonstrate the missing behavior, then run the repository's syntax/type checks and full E2E suite after implementation.

## Evaluation results — October 2, 2026

- The demo walkthrough completed three rounds per candidate: A took 65 seconds, B took 63 seconds, C took 63 seconds. All exercised duration changes, cancellation, active-lock inspection, expiry retaining the block, gauntlet cancellation and deliberate removal. See `docs/demos/commitment-lock-evidence/walkthrough.json` and the trace/screenshots alongside it.
- The initial extension test failed on the pre-feature code because no Lock action existed. The six new commitment E2E cases were written before the production implementation.
- The first implemented pass caught a keyboard focus issue at the end of the confirmation sheet. Explicit focus wrapping fixed it; the keyboard test passed afterward.
- `pnpm run check` passed syntax, types and all 81 E2E tests, including six new commitment cases, blocking variants, real browser restarts, Incognito protection, existing removal selfies, stress and the default 30-second tracking soak.
- A separate real-extension check at 320×600, with reduced motion and a long custom domain, found no horizontal overflow. The confirmation sheet fit entirely inside the viewport. See the `extension-320-*.png` screenshots.
- E2E screenshots, JSON receipts and traces are attached in `playwright-report/index.html`; rerun with `pnpm run check` or `pnpm run check --project=tier2 commitment-lock.spec.ts`. Traces in the demo directory are intentionally ignored by Git; rerun the demo walkthrough to recreate them.

## Custom duration follow-up

The Custom option adds an amount and an Hours/Days selector while retaining the preset choices. It accepts whole quantities, starting at 1 hour and ending at 365 days (8760 hours). Editing updates the deadline and confirmation label. Invalid entries show instructions, remove the misleading deadline preview and prevent confirmation. Both the popup and worker validate the range; existing commitments cannot be replaced or shortened with a custom request.

Two new E2E scenarios were written before implementing Custom. The first failed on the old UI because no Custom control existed. Runtime coverage now includes arbitrary valid hours, the maximum boundary, invalid types and excessive values. The restart scenario uses a custom three-hour commitment.

The full repository check passed all 83 E2E tests, syntax and types. Screenshot review then found the Cancel button was partly clipped at 320×600. A browser assertion reproduced that failure; compact preset labels and helper text fixed it. All eight commitment tests, syntax and types passed again after that layout adjustment. The full report remains in `playwright-report/index.html`; the final layout report and evidence are in `playwright-report/custom-layout/index.html`. The final confirmation screenshot is `docs/demos/commitment-lock-evidence/extension-320-custom.png`.
