# Product ideas

Punishment Mode's promise: when someone blocks a distracting site, the extension holds that line and shows them what happened when they tried to cross it. Keep blocking absolute and evidence local. Daily time allowances do not fit the "no mercy" idea.

## 1. Close blocking gaps — first priority

Implemented in `f014d3e`: blocking fixes and real-browser regression coverage for direct links, mobile hosts, subdomains, redirects, worker termination, browser restarts and embedded frames. Future gaps remain core product bugs.

## 2. Optional commitment lock

Implemented locally: each blocked site has an optional removal lock with presets (1 hour, 24 hours or 7 days) or a custom duration in whole hours or days, from 1 hour to 365 days. An explicit confirmation shows the deadline. When it ends, the site stays blocked; the existing removal gauntlet becomes available again. Chrome still lets people disable or uninstall the extension. See [the UX comparison and design](docs/superpowers/specs/2026-10-02-commitment-lock-design.md).

## 3. Incognito protection warning

Implemented in `f014d3e`: the popup checks Chrome's Incognito permission, warns when it is off and opens extension settings. The user must enable it in Chrome; the extension cannot switch it on itself.

## 4. Sharper shame report

Show repeat attempts at the same site, attempts after removing a block, and the longest clean streak. Use the existing local attempt and removal history where possible; keep the report and photos on the device.
