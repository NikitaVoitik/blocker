# Unblock Punishment System

## Overview

When a user removes a site from the blocklist, they must go through a 3-step shame gauntlet culminating in a shame selfie capture. Every removal is logged and surfaced as stats in the popup and report page.

## User Flow

1. User clicks × on a blocked site in the popup
2. **Step 1 modal**: "REMOVING [site]? COWARD." — Continue / Cancel
3. **Step 2 modal**: "You're really giving up? This goes on your permanent record." — Continue / Cancel
4. **Step 3 modal**: "Last chance. Your shame selfie is about to be taken." — Remove / Cancel
5. Camera fires via existing offscreen document flow. Photo saved to Hall of Shame with "COWARD" or "QUITTER" caption.
6. Site removed from blocklist. Removal logged to storage.

Clicking Cancel at any step aborts the entire removal — site stays blocked, nothing logged.

## Data Model

New storage key `removalLog` — array of removal entries:

```json
{
  "removalLog": [
    {
      "siteId": "twitter",
      "siteLabel": "Twitter / X",
      "timestamp": 1715400000000,
      "photoId": "removal_twitter_1715400000000"
    }
  ]
}
```

The `photoId` references a photo stored in the existing photo storage system (same as block page shame selfies).

## Stats Display

### Popup

Add "Sites Surrendered: X" stat to the blocker tab stats section, alongside existing attempt count and shame level. Uses `--danger` color to emphasize cowardice.

### Report Page

New "Coward Log" section after the existing stats sections:
- Section header: "COWARD LOG" with `// SURRENDERS` label
- Table/list of every removal: date, site name, shame selfie thumbnail
- Total removal count stat
- Empty state if no removals: dashed border box with "No surrenders yet. Stay strong."

## Modal Design

Brutalist style consistent with the design system:
- Fixed overlay with semi-transparent black background
- Centered modal panel with `--surface` background, `1px solid var(--border)`
- Step indicator: "STEP 1/3", "STEP 2/3", "STEP 3/3" in `--text-muted`
- Shame message in Bebas Neue, uppercase
- Body text in Space Mono
- Continue button: `--danger` background (red, not accent — this is a destructive/shame action)
- Cancel button: secondary style (transparent, border)
- No border-radius anywhere
- Scan-line overlay applied

## File Changes

| File | Change |
|------|--------|
| `popup/popup.js` | Replace `removeSite()` with `startRemovalGauntlet(siteId, siteLabel)`. Add modal step logic. Add camera capture call via `CAPTURE_SHAME_PHOTO` message. Add `LOG_REMOVAL` message. Show removal stat. |
| `popup/popup.html` | Add modal container markup (hidden by default) |
| `popup/popup.css` | Modal overlay, modal panel, step indicator, shame text, button styles |
| `background/service-worker.js` | Handle `LOG_REMOVAL` message — append to `removalLog` in storage. Handle `GET_REMOVAL_STATS` message — return removal count and log. |
| `report/report.js` | Fetch removal log via `GET_REMOVAL_STATS`, render Coward Log section |
| `report/report.html` | Add Coward Log section markup |
| `report/report.css` | Coward Log table/list styles |

## Camera Capture

Reuses the existing offscreen document camera flow:
1. Popup sends `CAPTURE_SHAME_PHOTO` message to service worker
2. Service worker uses offscreen document to capture photo
3. Photo stored with `photoId` format: `removal_[siteId]_[timestamp]`
4. Photo metadata includes `type: 'removal'` to distinguish from block-page captures

## Edge Cases

- If camera permission is denied: removal still proceeds after the gauntlet, but no photo is captured. The removal is still logged (with `photoId: null`).
- If user closes the popup mid-gauntlet: removal is aborted, nothing logged.
- Multiple rapid removals: each triggers its own gauntlet sequentially.
