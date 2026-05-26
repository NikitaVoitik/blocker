# Unblock Punishment System Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Punish users with a 3-step shame gauntlet and selfie capture when they remove a site from the blocklist, and track all removals as stats in the popup and report page.

**Architecture:** The popup gets a modal overlay for the 3-step gauntlet. On final confirm, it sends `CAPTURE_PHOTO` to the service worker (reusing the existing offscreen camera flow), then `LOG_REMOVAL` to persist the event. The service worker stores removals in `removalLog` array in `chrome.storage.local`. The popup shows a "Sites Surrendered" count, and the report page shows a "Coward Log" section with the full removal history and thumbnails.

**Tech Stack:** Plain HTML/CSS/JS, Chrome Extension APIs (storage, runtime messaging, offscreen document)

---

### Task 1: Service Worker — Removal Logging

**Files:**
- Modify: `background/service-worker.js:765-770` (removeBlockedSite), `:869-872` (message handler area)

- [ ] **Step 1: Add `logRemoval` function after `removeBlockedSite`**

In `background/service-worker.js`, after the `removeBlockedSite` function (line 770), add:

```javascript
async function logRemoval(siteId, siteLabel, photoId) {
  const result = await chrome.storage.local.get('removalLog');
  const log = result.removalLog || [];
  log.push({
    siteId,
    siteLabel,
    timestamp: Date.now(),
    photoId: photoId || null
  });
  await chrome.storage.local.set({ removalLog: log });
}

async function getRemovalLog() {
  const result = await chrome.storage.local.get('removalLog');
  return result.removalLog || [];
}
```

- [ ] **Step 2: Add message handlers for `LOG_REMOVAL` and `GET_REMOVAL_LOG`**

In the `chrome.runtime.onMessage.addListener` block, before the `return false;` at the end (line 915), add:

```javascript
if (message.type === 'LOG_REMOVAL') {
  logRemoval(message.siteId, message.siteLabel, message.photoId).then(() => sendResponse({ success: true }));
  return true;
}

if (message.type === 'GET_REMOVAL_LOG') {
  getRemovalLog().then(sendResponse);
  return true;
}
```

- [ ] **Step 3: Verify service worker loads without errors**

Run: Open `chrome://extensions`, reload the extension, check for errors in the service worker console.
Expected: No errors. Service worker loads cleanly.

- [ ] **Step 4: Commit**

```bash
git add background/service-worker.js
git commit -m "feat: add removal logging to service worker"
```

---

### Task 2: Popup — 3-Step Removal Gauntlet Modal

**Files:**
- Modify: `popup/popup.html:93-94` (before closing tags)
- Modify: `popup/popup.css` (append modal styles)
- Modify: `popup/popup.js:177-182` (replace `removeSite`)

- [ ] **Step 1: Add modal markup to popup.html**

In `popup/popup.html`, before the closing `</div>` of `.popup-container` (line 93) and before the `<script>` tag (line 96), add:

```html
  </div>

  <div class="gauntlet-overlay" id="gauntlet-overlay" style="display: none;">
    <div class="gauntlet-modal">
      <div class="gauntlet-step" id="gauntlet-step">STEP 1/3</div>
      <h2 class="gauntlet-title" id="gauntlet-title"></h2>
      <p class="gauntlet-body" id="gauntlet-body"></p>
      <div class="gauntlet-actions">
        <button class="gauntlet-btn gauntlet-btn-continue" id="gauntlet-continue">Continue</button>
        <button class="gauntlet-btn gauntlet-btn-cancel" id="gauntlet-cancel">Cancel</button>
      </div>
    </div>
  </div>

  <script src="popup.js"></script>
```

This replaces the existing lines 93-96 which are:
```html
  </div>

  <script src="popup.js"></script>
```

- [ ] **Step 2: Add modal CSS to popup.css**

Append to the end of `popup/popup.css`:

```css
/* Removal gauntlet modal */
.gauntlet-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.85);
  z-index: 9998;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px;
}

.gauntlet-modal {
  background: var(--surface);
  border: 1px solid var(--border);
  padding: 24px 20px;
  width: 100%;
  max-width: 288px;
}

.gauntlet-step {
  font-family: 'Space Mono', monospace;
  font-size: 0.6rem;
  color: var(--text-muted);
  letter-spacing: 0.1em;
  margin-bottom: 12px;
}

.gauntlet-title {
  font-family: 'Bebas Neue', sans-serif;
  font-size: 1.3rem;
  color: var(--danger);
  letter-spacing: 0.1em;
  text-transform: uppercase;
  margin-bottom: 8px;
  border: none;
  padding: 0;
  text-align: left;
}

.gauntlet-body {
  font-size: 0.7rem;
  color: var(--text-muted);
  line-height: 1.5;
  margin-bottom: 16px;
}

.gauntlet-actions {
  display: flex;
  gap: 8px;
}

.gauntlet-btn {
  flex: 1;
  padding: 10px 12px;
  font-family: 'Bebas Neue', sans-serif;
  font-size: 0.85rem;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  cursor: pointer;
  transition: all 0.1s;
}

.gauntlet-btn-continue {
  background: var(--danger);
  color: #fff;
  border: 1px solid var(--danger);
}

.gauntlet-btn-continue:hover {
  background: #ff4d4d;
  border-color: #ff4d4d;
}

.gauntlet-btn-cancel {
  background: transparent;
  color: var(--text-muted);
  border: 1px solid var(--border);
}

.gauntlet-btn-cancel:hover {
  border-color: var(--text);
  color: var(--text);
}
```

- [ ] **Step 3: Replace `removeSite` with gauntlet logic in popup.js**

In `popup/popup.js`, replace the `removeSite` function (lines 177-182) with:

```javascript
const GAUNTLET_STEPS = [
  {
    title: 'REMOVING {site}? COWARD.',
    body: 'You blocked this site for a reason. Giving up already?',
    continueLabel: 'Continue'
  },
  {
    title: "YOU'RE REALLY GIVING UP?",
    body: 'This goes on your permanent record. Every surrender is tracked.',
    continueLabel: 'Continue'
  },
  {
    title: 'LAST CHANCE.',
    body: 'Your shame selfie is about to be taken. Everyone will know you caved.',
    continueLabel: 'Remove'
  }
];

let gauntletState = null;

function startRemovalGauntlet(siteId, siteLabel) {
  gauntletState = { siteId, siteLabel, step: 0 };
  showGauntletStep();
}

function showGauntletStep() {
  const overlay = document.getElementById('gauntlet-overlay');
  const stepEl = document.getElementById('gauntlet-step');
  const titleEl = document.getElementById('gauntlet-title');
  const bodyEl = document.getElementById('gauntlet-body');
  const continueBtn = document.getElementById('gauntlet-continue');

  const step = GAUNTLET_STEPS[gauntletState.step];
  stepEl.textContent = `STEP ${gauntletState.step + 1}/3`;
  titleEl.textContent = step.title.replace('{site}', gauntletState.siteLabel);
  bodyEl.textContent = step.body;
  continueBtn.textContent = step.continueLabel;
  overlay.style.display = '';
}

function closeGauntlet() {
  document.getElementById('gauntlet-overlay').style.display = 'none';
  gauntletState = null;
}

async function advanceGauntlet() {
  if (!gauntletState) return;

  gauntletState.step++;

  if (gauntletState.step < GAUNTLET_STEPS.length) {
    showGauntletStep();
    return;
  }

  // Final step passed — capture photo, log removal, remove site
  const { siteId, siteLabel } = gauntletState;
  closeGauntlet();

  let photoId = null;
  try {
    const capture = await chrome.runtime.sendMessage({ type: 'CAPTURE_PHOTO' });
    if (capture && capture.success) {
      photoId = 'removal_' + siteId + '_' + Date.now();
    }
  } catch (e) {
    // Camera denied or failed — proceed without photo
  }

  await chrome.runtime.sendMessage({
    type: 'LOG_REMOVAL',
    siteId,
    siteLabel,
    photoId
  });

  const result = await chrome.runtime.sendMessage({ type: 'REMOVE_BLOCKED_SITE', siteId });
  if (result && result.success) {
    await loadBlockedSites();
    await loadRemovalStats();
  }
}

document.getElementById('gauntlet-continue').addEventListener('click', advanceGauntlet);
document.getElementById('gauntlet-cancel').addEventListener('click', closeGauntlet);
```

- [ ] **Step 4: Update `renderBlockedSites` to use `startRemovalGauntlet`**

In `popup/popup.js`, change line 142 from:

```javascript
removeBtn.addEventListener('click', () => removeSite(site.id));
```

to:

```javascript
removeBtn.addEventListener('click', () => startRemovalGauntlet(site.id, site.label || site.id));
```

- [ ] **Step 5: Verify the modal appears in the popup**

Run: Click the extension icon, click × on a blocked site.
Expected: The gauntlet modal appears with "STEP 1/3" and the site name. Cancel returns to normal. Clicking Continue 3 times triggers photo capture and removes the site.

- [ ] **Step 6: Commit**

```bash
git add popup/popup.html popup/popup.css popup/popup.js
git commit -m "feat: add 3-step removal gauntlet modal to popup"
```

---

### Task 3: Popup — Removal Stats Display

**Files:**
- Modify: `popup/popup.html:35` (after photos stat)
- Modify: `popup/popup.css` (stats-card grid)
- Modify: `popup/popup.js` (add loadRemovalStats, call on init)

- [ ] **Step 1: Add surrendered stat to popup HTML**

In `popup/popup.html`, after the "Photos Saved" stat div (line 34-35), add a new stat:

```html
        <div class="stat">
          <span class="stat-value" id="photos">0</span>
          <span class="stat-label">Photos Saved</span>
        </div>
        <div class="stat stat-surrendered">
          <span class="stat-value stat-value-surrendered" id="surrendered">0</span>
          <span class="stat-label">Surrendered</span>
        </div>
```

This replaces the existing lines 33-35.

- [ ] **Step 2: Update stats grid to 5 columns in popup CSS**

In `popup/popup.css`, change the `.stats-card` grid-template-columns (line 124):

```css
.stats-card {
  display: grid;
  grid-template-columns: repeat(5, 1fr);
  gap: 1px;
  background: var(--border);
  border: 1px solid var(--border);
  margin-bottom: 14px;
}
```

And add the surrendered stat color:

```css
.stat-value-surrendered {
  color: var(--danger);
}
```

- [ ] **Step 3: Add `loadRemovalStats` function and wire it up in popup.js**

At the top of `popup/popup.js`, after the existing element references (around line 14), add:

```javascript
const surrenderedEl = document.getElementById('surrendered');
```

Then, before the event listeners section (before line 383), add:

```javascript
async function loadRemovalStats() {
  const log = await chrome.runtime.sendMessage({ type: 'GET_REMOVAL_LOG' });
  surrenderedEl.textContent = (log && log.length) || 0;
}
```

And at the bottom of the file (line 421), add `loadRemovalStats()` to the init calls:

```javascript
loadStats();
loadBlockedSites();
loadRemovalStats();
```

- [ ] **Step 4: Verify the stat shows in the popup**

Run: Open the extension popup.
Expected: A fifth stat "Surrendered" appears in the stats grid with a red value. After removing a site through the gauntlet, the count increments.

- [ ] **Step 5: Commit**

```bash
git add popup/popup.html popup/popup.css popup/popup.js
git commit -m "feat: show sites surrendered count in popup stats"
```

---

### Task 4: Report Page — Coward Log Section

**Files:**
- Modify: `report/report.html:70-71` (add section before closing shame tab div)
- Modify: `report/report.css` (append coward log styles)
- Modify: `report/report.js` (fetch and render removal log)

- [ ] **Step 1: Add Coward Log HTML section**

In `report/report.html`, before the closing `</div>` of `#report-shame` (line 71), add:

```html
      <div class="chart-section" id="coward-log-section">
        <h2>Coward Log <span class="chart-subtitle">// SURRENDERS</span></h2>
        <div class="coward-log-stat">
          <span class="coward-log-stat-label">Total Surrenders:</span>
          <span class="coward-log-stat-value" id="coward-total">0</span>
        </div>
        <div id="coward-log-list"></div>
        <div class="coward-log-empty" id="coward-log-empty" style="display: none;">
          No surrenders yet. Stay strong.
        </div>
      </div>
```

- [ ] **Step 2: Add Coward Log CSS styles**

Append to `report/report.css`:

```css
/* Coward Log */
.coward-log-stat {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 0;
  margin-bottom: 12px;
  border-bottom: 1px solid var(--border);
}

.coward-log-stat-label {
  font-size: 0.8rem;
  color: var(--text-muted);
}

.coward-log-stat-value {
  font-family: 'Bebas Neue', sans-serif;
  font-size: 1.4rem;
  color: var(--danger);
}

.coward-log-entry {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 0;
  border-bottom: 1px solid var(--border);
}

.coward-log-entry:last-child {
  border-bottom: none;
}

.coward-log-thumb {
  width: 48px;
  height: 48px;
  object-fit: cover;
  border: 1px solid var(--border);
  flex-shrink: 0;
}

.coward-log-thumb-placeholder {
  width: 48px;
  height: 48px;
  background: var(--bg);
  border: 1px dashed var(--border);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 0.5rem;
  color: var(--text-muted);
  flex-shrink: 0;
}

.coward-log-info {
  flex: 1;
  min-width: 0;
}

.coward-log-site {
  font-size: 0.8rem;
  color: var(--danger);
  font-weight: bold;
}

.coward-log-date {
  font-size: 0.65rem;
  color: var(--text-muted);
  margin-top: 2px;
}

.coward-log-badge {
  font-family: 'Bebas Neue', sans-serif;
  font-size: 0.7rem;
  color: var(--danger);
  letter-spacing: 0.1em;
  border: 1px solid var(--danger);
  padding: 2px 8px;
  flex-shrink: 0;
}

.coward-log-empty {
  font-size: 0.8rem;
  color: var(--text-muted);
  text-align: center;
  padding: 24px;
  border: 1px dashed var(--border);
}
```

- [ ] **Step 3: Add removal log rendering to report.js**

In `report/report.js`, inside the IIFE, after the `populate` function call block (after line 165), add:

```javascript
  // --- Coward Log ---

  function renderCowardLog(log, photos) {
    const listEl = document.getElementById('coward-log-list');
    const emptyEl = document.getElementById('coward-log-empty');
    const totalEl = document.getElementById('coward-total');

    totalEl.textContent = log.length;

    if (log.length === 0) {
      emptyEl.style.display = '';
      return;
    }
    emptyEl.style.display = 'none';

    const photoMap = {};
    for (const p of photos) {
      photoMap[p.id] = p.data;
    }

    const sorted = [...log].sort((a, b) => b.timestamp - a.timestamp);

    for (const entry of sorted) {
      const row = document.createElement('div');
      row.className = 'coward-log-entry';

      if (entry.photoId && photoMap[entry.photoId]) {
        const img = document.createElement('img');
        img.className = 'coward-log-thumb';
        img.src = photoMap[entry.photoId];
        img.alt = 'Shame selfie';
        row.appendChild(img);
      } else {
        const placeholder = document.createElement('div');
        placeholder.className = 'coward-log-thumb-placeholder';
        placeholder.textContent = 'N/A';
        row.appendChild(placeholder);
      }

      const info = document.createElement('div');
      info.className = 'coward-log-info';

      const site = document.createElement('div');
      site.className = 'coward-log-site';
      site.textContent = entry.siteLabel || entry.siteId;

      const date = document.createElement('div');
      date.className = 'coward-log-date';
      date.textContent = new Date(entry.timestamp).toLocaleString();

      info.appendChild(site);
      info.appendChild(date);
      row.appendChild(info);

      const badge = document.createElement('span');
      badge.className = 'coward-log-badge';
      badge.textContent = 'COWARD';
      row.appendChild(badge);

      listEl.appendChild(row);
    }
  }

  chrome.runtime.sendMessage({ type: 'GET_REMOVAL_LOG' }, (log) => {
    chrome.runtime.sendMessage({ type: 'GET_PHOTOS' }, (photos) => {
      renderCowardLog(log || [], photos || []);
    });
  });
```

- [ ] **Step 4: Verify the Coward Log renders on the report page**

Run: Open the report page (click "Shame Report" in popup). Scroll down past the weekly chart.
Expected: "Coward Log" section with "// SURRENDERS" subtitle. If no removals yet, shows dashed-border "No surrenders yet. Stay strong." message. After removing a site via gauntlet, the entry appears with timestamp, site name, and "COWARD" badge.

- [ ] **Step 5: Commit**

```bash
git add report/report.html report/report.css report/report.js
git commit -m "feat: add coward log section to shame report page"
```

---

### Task 5: Integration Test

**Files:**
- No new files — manual testing

- [ ] **Step 1: Full flow test**

1. Open extension popup
2. Verify "Surrendered: 0" stat shows in the stats grid
3. Click × on a blocked site (e.g. Twitter)
4. Verify Step 1/3 modal: "REMOVING TWITTER / X? COWARD."
5. Click Cancel — verify site is still blocked, modal closes
6. Click × again, click Continue through all 3 steps
7. Verify camera fires (or gracefully skips if denied)
8. Verify site is removed from the list
9. Verify "Surrendered: 1" stat updates
10. Open Shame Report — verify Coward Log section shows the removal entry
11. Repeat removal for another site, verify count increments to 2

- [ ] **Step 2: Edge case — camera denied**

1. Deny camera permission in Chrome settings
2. Remove a site through the gauntlet
3. Verify removal still completes, logged with `photoId: null`
4. Coward Log shows placeholder instead of thumbnail

- [ ] **Step 3: Final commit with any fixes**

```bash
git add -A
git commit -m "feat: complete unblock punishment system with gauntlet, stats, and coward log"
```
