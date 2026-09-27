# Punishment Mode: product direction

Punishment Mode is a Chrome extension for people who want distracting sites blocked outright. When a user chooses to block a site, the extension should hold that line, confront each attempted visit, and keep local evidence of the relapse. The tone is blunt, confrontational, and "no mercy," consistent with the existing shame selfie, roast, removal gauntlet, and report.

## Product rules

- A blocked site stays blocked until the user deliberately removes it. Do not add daily time allowances, automatic unblocking, or softer modes that make visiting a blocked site part of the normal flow.
- Make blocking dependable across URL variants, redirects, browser restarts, and other routes into the same site. Treat gaps in enforcement as core product bugs.
- Make attempts and removals visible in the local report. Consequences should be tied to what the user actually did, not arbitrary friction.
- Keep browsing history, stats, and shame photos on the device. The product currently promises no accounts, cloud service, or analytics; do not add telemetry or transmission without an explicit change to that direction and its privacy disclosures.
- Be honest about browser limits. A user can disable or uninstall a Chrome extension, and Incognito protection requires the user to allow it in Chrome settings. Never claim the block is impossible to bypass.
- Keep the existing brutalist, surveillance-terminal visual style. Functional improvements should still feel like Punishment Mode.

## Next directions

1. Audit and test blocking coverage first.
2. Consider an optional commitment lock that delays removal through the popup; it must never auto-unblock a site.
3. Warn clearly when Incognito access is off and explain how to enable it.
4. Sharpen the local shame report with repeat attempts, attempts after removal, and clean streaks.

See [IDEAS.md](IDEAS.md) for the working ideas list. These directions are proposals, not shipped features.
