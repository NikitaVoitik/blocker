# Daily Usage Limits

## Overview

Each tracked site can have an optional **daily usage limit**. When today's tracked
time on that site reaches the limit, the site is blocked for the rest of the day
(local time) and auto-unblocks at midnight. Hitting a limit is treated like a
relapse — the block page captures a shame selfie and increments the attempt count —
but uses a dedicated set of limit-specific roasts and a "DAILY LIMIT REACHED" banner.

Default limit when a user enables one: **60 minutes**. Limits are opt-in per site.

## Data Model

Daily limit is a property of a tracked site (`trackedSites` entries):

```js
{ id: 'reddit', label: 'Reddit', domains: ['reddit.com', ...], builtin: true, dailyLimitSeconds: 3600 }
```

- `dailyLimitSeconds` absent / `0` / `null` → no limit.
- Reuses existing `trackingData.time['<siteId>:<YYYY-MM-DD>']` (seconds). No new time store.
- "Today" keying already resets at local midnight, so limits reset daily for free.
- Validation (via UI / `SET_SITE_LIMIT`): `60`–`86400` seconds, or `0` to clear.

## Enforcement (service worker)

A limited tracked site is **over limit** when its time for today's key `>=`
`dailyLimitSeconds`. Over-limit sites are blocked via the same redirect target as
regular blocks, with a `reason=limit` query param:
`/blocked/blocked.html?site=<id>&reason=limit`.

- **Primary — declarativeNetRequest dynamic rules** in a dedicated ID range
  (`LIMIT_RULE_ID_BASE = 100000`+), separate from block rules (`1000`+).
  `syncBlockRules` removes/adds only IDs `< LIMIT_RULE_ID_BASE`; `syncLimitRules`
  removes/adds only IDs `>= LIMIT_RULE_ID_BASE`. They never clobber each other.
  `verifyBlockRules` counts only the block range.
- **Backup — `webNavigation.onBeforeNavigate`** also redirects over-limit sites.
- **Active-tab boot — `enforceLimits()`** runs after each time flush (the existing
  1-minute alarm + the focus/activate/onUpdated handlers). It flushes time,
  recomputes the over-limit set, re-syncs limit rules, and redirects the currently
  focused tab if it just crossed. So an open binge is cut off within ~1 minute.
- **Midnight** — after midnight the flush writes to the new day's key;
  `enforceLimits()` sees 0s for the new day, so `syncLimitRules()` emits no rules and
  removes the stale ones (~1-minute granularity).

### New messages

- `SET_SITE_LIMIT { siteId, limitSeconds }` → validates, updates the tracked site,
  saves, re-syncs limit rules. `limitSeconds = 0` clears the limit. Returns
  `{ success, sites }` or `{ success: false, error }`.
- `CHECK_LIMITS` → forces flush + enforce + sync, returns `{ overLimit: [siteId...] }`.
  Used by the popup on open and by tests for determinism.

## Block Page (`reason=limit`)

Same capture flow as a relapse (selfie + attempt increment), but when
`reason=limit`:

- Shows a **"DAILY LIMIT REACHED"** banner above the shame text.
- Uses a dedicated `limitMessages` roast set and `limitQuotes` quote set instead of
  the per-site messages.

## Popup UI (Tracker tab)

Each tracked-site row gains a daily-limit control:

- Shows the current limit (e.g. `LIMIT 60m`) or `NO LIMIT`.
- Lets the user set a limit in minutes (default value 60) or clear it.
- Shows today's usage vs. limit and an over-limit indicator.
- Brutalist design system, cyan (`--track`) accent (Tracker tab). Built with the
  frontend-design skill.

## Tests (all tiers)

- **tier1** `daily-limits.spec.ts` — set/clear limit persists; under-limit site not
  blocked; site seeded over limit → `SET_SITE_LIMIT` syncs a rule → navigation
  redirects to `blocked.html?...&reason=limit`; clearing removes the block.
- **tier2** `daily-limit-enforcement.spec.ts` — real accrual crossing a small
  (seeded) limit blocks the site; active tab booted after `CHECK_LIMITS`; boundary
  (just under vs. just over); per-day keying (over yesterday ≠ blocked today); one
  limited site doesn't affect another; clearing restores access.
- **tier3** `limit-stress.spec.ts` — randomized limits + seeded times + rapid
  cycling over many iterations; invariants: limit-rule count == over-limit count,
  no leftover/duplicate rules, no ID collision between block and limit ranges.

## Edge Cases

- Camera denied: block still applies; capture simply fails (existing behavior).
- A site both always-blocked and limited: stays blocked (block rule wins); limit
  rule is redundant but harmless.
- Service-worker restart: `enforceLimits()` on init rebuilds limit rules from
  ground truth (today's tracking data + tracked-site limits).
- Removing a tracked site that is over its limit re-syncs limit rules so the
  redirect rule isn't orphaned (site becomes reachable again).
- External / direct writes to `trackedSites` (e.g. storage import) re-sync limit
  rules via the `storage.onChanged` listener.
- Re-focusing a tab that is already over its limit boots it immediately via a cheap
  in-memory `overLimitSiteIds` check in the focus/activation handlers — no DNR work.

## Concurrency

`syncBlockRules` and `syncLimitRules` both call
`chrome.declarativeNetRequest.updateDynamicRules` (a read-modify-write on a shared
rule set). They are funnelled through a single promise-chain lock (`withRuleLock`) so
concurrent callers (alarm, `SET_SITE_LIMIT`, `onChanged`, init) can't clobber each
other or produce duplicate/dangling rule IDs.

## Accepted Limitations

- **Midnight unblock granularity (~1 min):** stale limit rules clear on the next
  1-minute flush alarm after local midnight, not exactly at midnight. Acceptable per
  the agreed design.
- **Midnight time attribution:** active time spanning midnight is charged to the new
  day's key (inherited from the existing tracker's `flushActiveTime`). Worst case is a
  few seconds mis-attributed at the boundary — negligible against an hour-scale limit.
- **Alarm path not directly time-tested:** the `TRACKING_FLUSH_ALARM` handler is a
  one-liner that calls the same `enforceLimits()` covered by the `CHECK_LIMITS` tests;
  a 60s+ alarm-timing test was judged not worth the runtime.
