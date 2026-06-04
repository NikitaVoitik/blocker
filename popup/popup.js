// Popup script

const allTimeEl = document.getElementById('all-time');
const threeDayEl = document.getElementById('three-day');
const todayEl = document.getElementById('today');
const photosEl = document.getElementById('photos');
const shameLevelEl = document.getElementById('shame-level');
const shameLevelContainer = document.querySelector('.shame-level');
const viewGalleryBtn = document.getElementById('view-gallery');
const viewReportBtn = document.getElementById('view-report');
const testBlockBtn = document.getElementById('test-block');
const blockedListEl = document.getElementById('blocked-list');
const siteInput = document.getElementById('site-input');
const addSiteBtn = document.getElementById('add-site-btn');
const surrenderedEl = document.getElementById('surrendered');

const trackTotalVisitsEl = document.getElementById('track-total-visits');
const trackTotalTimeEl = document.getElementById('track-total-time');
const trackedBreakdownEl = document.getElementById('tracked-breakdown');
const trackedListEl = document.getElementById('tracked-list');
const trackSiteInput = document.getElementById('track-site-input');
const addTrackBtn = document.getElementById('add-track-btn');
const viewTrackingReportBtn = document.getElementById('view-tracking-report');

const shameLevels = [
  { min: 0, name: 'Clean', class: 'level-1' },
  { min: 1, name: 'Rookie', class: 'level-1' },
  { min: 3, name: 'Repeat Offender', class: 'level-2' },
  { min: 6, name: 'Addict', class: 'level-3' },
  { min: 10, name: 'Terminal Brain Rot', class: 'level-4' },
  { min: 20, name: 'Beyond Saving', class: 'level-5' }
];

function getShameLevel(count) {
  let level = shameLevels[0];
  for (const l of shameLevels) {
    if (count >= l.min) level = l;
  }
  return level;
}

function extractHostname(input) {
  let cleaned = input.trim().toLowerCase();
  cleaned = cleaned.replace(/^https?:\/\//, '');
  cleaned = cleaned.replace(/\/.*$/, '');
  return cleaned;
}

function formatTime(seconds) {
  if (seconds < 60) return '<1m';
  const hours = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  if (hours > 0) return hours + 'h ' + mins + 'm';
  return mins + 'm';
}

// --- Tab switching ---

const tabBtns = document.querySelectorAll('.tab-btn');
const tabBlocker = document.getElementById('tab-blocker');
const tabTracker = document.getElementById('tab-tracker');

tabBtns.forEach(btn => {
  btn.addEventListener('click', async () => {
    tabBtns.forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    const tab = btn.dataset.tab;
    tabBlocker.style.display = tab === 'blocker' ? '' : 'none';
    tabTracker.style.display = tab === 'tracker' ? '' : 'none';
    if (tab === 'tracker') {
      // Refresh enforcement so over-limit sites are blocked and the UI is current
      await chrome.runtime.sendMessage({ type: 'CHECK_LIMITS' });
      loadTrackingData();
      loadTrackedSites();
    }
  });
});

// --- Blocker tab (restrictions: Always block / Limit N min/day) ---

// Mode selected in the add-site row.
let addMode = 'always';

async function loadRestrictions() {
  const sites = await chrome.runtime.sendMessage({ type: 'GET_RESTRICTION_SITES' });
  renderRestrictions(sites || []);
  await loadAvailablePresets();
}

async function setRestriction(siteId, mode, minutes) {
  const msg = { type: 'SET_SITE_RESTRICTION', siteId, mode };
  if (mode === 'limit') {
    const m = Math.max(1, Math.min(1440, Number(minutes) || 60));
    msg.dailyLimitSeconds = m * 60;
  }
  const result = await chrome.runtime.sendMessage(msg);
  if (result && result.success) await loadRestrictions();
  return result;
}

async function loadAvailablePresets() {
  const presets = await chrome.runtime.sendMessage({ type: 'GET_AVAILABLE_PRESETS' });
  renderPresetSuggestions(presets || []);
}

function renderPresetSuggestions(presets) {
  let container = document.getElementById('preset-suggestions');
  if (container) container.remove();

  if (presets.length === 0) return;

  container = document.createElement('div');
  container.id = 'preset-suggestions';
  container.className = 'preset-suggestions';

  const heading = document.createElement('h3');
  heading.textContent = 'Available presets';
  container.appendChild(heading);

  for (const preset of presets) {
    const item = document.createElement('div');
    item.className = 'preset-item';

    const label = document.createElement('span');
    label.className = 'preset-label';
    label.textContent = preset.label || preset.id;

    const addBtn = document.createElement('button');
    addBtn.className = 'preset-add';
    addBtn.textContent = '+';
    addBtn.title = 'Add';
    addBtn.addEventListener('click', async () => {
      const result = await chrome.runtime.sendMessage({ type: 'ADD_BLOCKED_SITE', site: { ...preset, mode: 'always' } });
      if (result && result.success) await loadRestrictions();
    });

    item.appendChild(label);
    item.appendChild(addBtn);
    container.appendChild(item);
  }

  blockedListEl.parentElement.insertBefore(container, blockedListEl.nextSibling);
}

function renderRestrictions(sites) {
  blockedListEl.innerHTML = '';
  for (const site of sites) {
    const isLimit = site.mode === 'limit';
    const cap = Number(site.dailyLimitSeconds) || 0;
    const used = Number(site.usageTodaySeconds) || 0;
    const over = !!site.overLimit;

    const item = document.createElement('div');
    item.className = 'site-item restriction-item';

    // Main row: label + mode toggle + remove
    const main = document.createElement('div');
    main.className = 'restriction-main';

    const label = document.createElement('span');
    label.className = 'site-label';
    label.textContent = site.label || site.id;

    const controls = document.createElement('div');
    controls.className = 'restriction-controls';

    const seg = document.createElement('div');
    seg.className = 'mode-seg';
    const alwaysBtn = document.createElement('button');
    alwaysBtn.className = 'mode-opt' + (!isLimit ? ' active' : '');
    alwaysBtn.textContent = 'Always';
    const limitBtn = document.createElement('button');
    limitBtn.className = 'mode-opt' + (isLimit ? ' active' : '');
    limitBtn.textContent = 'Limit';
    seg.appendChild(alwaysBtn);
    seg.appendChild(limitBtn);

    const removeBtn = document.createElement('button');
    removeBtn.className = 'site-remove';
    removeBtn.textContent = '×';
    removeBtn.title = 'Remove';
    removeBtn.addEventListener('click', () => startRemovalGauntlet(site.id, site.label || site.id));

    controls.appendChild(seg);
    controls.appendChild(removeBtn);
    main.appendChild(label);
    main.appendChild(controls);
    item.appendChild(main);

    // Usage bar (limit mode only)
    if (isLimit && cap > 0) {
      const usage = document.createElement('div');
      usage.className = 'limit-usage' + (over ? ' is-over' : '');
      const barTrack = document.createElement('div');
      barTrack.className = 'limit-usage-track';
      const fill = document.createElement('div');
      fill.className = 'limit-usage-fill';
      fill.style.width = Math.min(100, (used / cap) * 100) + '%';
      barTrack.appendChild(fill);
      const text = document.createElement('span');
      text.className = 'limit-usage-text';
      text.textContent = formatTime(used) + ' / ' + formatLimitShort(cap) + (over ? ' · OVER' : '');
      usage.appendChild(barTrack);
      usage.appendChild(text);
      item.appendChild(usage);
    }

    // Minutes editor (revealed by the Limit button)
    const editor = document.createElement('div');
    editor.className = 'limit-editor';
    editor.style.display = 'none';
    const inputRow = document.createElement('div');
    inputRow.className = 'limit-input-row';
    const input = document.createElement('input');
    input.type = 'number';
    input.className = 'limit-minutes';
    input.min = '1';
    input.max = '1440';
    input.step = '1';
    input.value = String(isLimit && cap > 0 ? Math.max(1, Math.round(cap / 60)) : 60);
    const unit = document.createElement('span');
    unit.className = 'limit-unit';
    unit.textContent = 'min / day';
    inputRow.appendChild(input);
    inputRow.appendChild(unit);
    const editorActions = document.createElement('div');
    editorActions.className = 'limit-editor-actions';
    const setBtn = document.createElement('button');
    setBtn.className = 'limit-set';
    setBtn.textContent = isLimit ? 'Update' : 'Set';
    const apply = () => {
      let m = parseInt(input.value, 10);
      if (!Number.isFinite(m)) m = 60;
      setRestriction(site.id, 'limit', m);
    };
    setBtn.addEventListener('click', apply);
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') apply(); });
    editorActions.appendChild(setBtn);
    editor.appendChild(inputRow);
    editor.appendChild(editorActions);
    item.appendChild(editor);

    alwaysBtn.addEventListener('click', () => {
      if (isLimit) setRestriction(site.id, 'always');
      else editor.style.display = 'none';
    });
    limitBtn.addEventListener('click', () => {
      const open = editor.style.display !== 'none';
      editor.style.display = open ? 'none' : 'flex';
      if (!open) input.focus();
    });

    blockedListEl.appendChild(item);
  }
}

async function addSite() {
  const raw = siteInput.value;
  if (!raw.trim()) return;

  const hostname = extractHostname(raw);
  if (!hostname || !hostname.includes('.')) return;

  const id = hostname.replace(/^www\./, '');
  const domains = [hostname];
  if (!hostname.startsWith('www.')) {
    domains.push('www.' + hostname);
  }

  const site = { id, label: id, domains, builtin: false, mode: addMode };
  if (addMode === 'limit') {
    const minsEl = document.getElementById('add-limit-input');
    let m = parseInt(minsEl && minsEl.value, 10);
    if (!Number.isFinite(m)) m = 60;
    site.dailyLimitSeconds = Math.max(1, Math.min(1440, m)) * 60;
  }

  const result = await chrome.runtime.sendMessage({ type: 'ADD_BLOCKED_SITE', site });
  if (result && result.success) {
    siteInput.value = '';
    await loadRestrictions();
  }
}

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
    await loadRestrictions();
    await loadRemovalStats();
  }
}

document.getElementById('gauntlet-continue').addEventListener('click', advanceGauntlet);
document.getElementById('gauntlet-cancel').addEventListener('click', closeGauntlet);

async function loadStats() {
  try {
    const stats = await chrome.runtime.sendMessage({ type: 'GET_STATS' });
    const photos = await chrome.runtime.sendMessage({ type: 'GET_PHOTOS' });

    const allTime = stats?.allTimeCount || 0;
    const threeDayCount = stats?.threeDayCount || 0;
    const today = stats?.todayCount || 0;
    const photoCount = photos?.length || 0;

    allTimeEl.textContent = allTime;
    threeDayEl.textContent = threeDayCount;
    todayEl.textContent = today;
    photosEl.textContent = photoCount;

    const level = getShameLevel(threeDayCount);
    shameLevelEl.textContent = level.name;
    shameLevelContainer.className = 'shame-level ' + level.class;
  } catch (error) {
    console.error('Failed to load stats:', error);
  }
}

// --- Tracker tab (analytics only) ---

async function loadTrackedSites() {
  const sites = await chrome.runtime.sendMessage({ type: 'GET_TRACKED_SITES' });
  renderTrackedSites(sites || []);
  await loadAvailableTrackingPresets();
}

// Compact daily-limit label: 3600 -> "1h", 1800 -> "30m", 5400 -> "1h 30m"
function formatLimitShort(seconds) {
  const m = Math.round(seconds / 60);
  if (m >= 60 && m % 60 === 0) return (m / 60) + 'h';
  if (m < 60) return Math.max(1, m) + 'm';
  return Math.floor(m / 60) + 'h ' + (m % 60) + 'm';
}

async function loadAvailableTrackingPresets() {
  const presets = await chrome.runtime.sendMessage({ type: 'GET_AVAILABLE_TRACKING_PRESETS' });
  renderTrackingPresetSuggestions(presets || []);
}

function renderTrackingPresetSuggestions(presets) {
  let container = document.getElementById('tracking-preset-suggestions');
  if (container) container.remove();

  if (presets.length === 0) return;

  container = document.createElement('div');
  container.id = 'tracking-preset-suggestions';
  container.className = 'preset-suggestions';

  const heading = document.createElement('h3');
  heading.textContent = 'Available presets';
  container.appendChild(heading);

  for (const preset of presets) {
    const item = document.createElement('div');
    item.className = 'preset-item preset-item-track';

    const label = document.createElement('span');
    label.className = 'preset-label';
    label.textContent = preset.label || preset.id;

    const addBtn = document.createElement('button');
    addBtn.className = 'preset-add preset-add-track';
    addBtn.textContent = '+';
    addBtn.title = 'Add';
    addBtn.addEventListener('click', async () => {
      const result = await chrome.runtime.sendMessage({ type: 'ADD_TRACKED_SITE', site: preset });
      if (result && result.success) {
        await loadTrackedSites();
        await loadTrackingData();
      }
    });

    item.appendChild(label);
    item.appendChild(addBtn);
    container.appendChild(item);
  }

  trackedListEl.parentElement.insertBefore(container, trackedListEl.nextSibling);
}

async function reloadTracker() {
  await loadTrackedSites();
  await loadTrackingData();
}

// Tracker tab is analytics-only: simple add/remove rows. Limits are managed in the Blocker tab.
function renderTrackedSites(sites) {
  trackedListEl.innerHTML = '';
  for (const site of sites) {
    const item = document.createElement('div');
    item.className = 'site-item site-item-track';

    const label = document.createElement('span');
    label.className = 'site-label site-label-track';
    label.textContent = site.label || site.id;

    const removeBtn = document.createElement('button');
    removeBtn.className = 'site-remove';
    removeBtn.textContent = '×';
    removeBtn.title = 'Remove';
    removeBtn.addEventListener('click', async () => {
      const result = await chrome.runtime.sendMessage({ type: 'REMOVE_TRACKED_SITE', siteId: site.id });
      if (result && result.success) await reloadTracker();
    });

    item.appendChild(label);
    item.appendChild(removeBtn);
    trackedListEl.appendChild(item);
  }
}

async function loadTrackingData() {
  try {
    const data = await chrome.runtime.sendMessage({ type: 'GET_TRACKING_DATA' });
    if (!data) return;

    let totalVisits = 0;
    let totalTime = 0;
    const entries = [];

    for (const [siteId, stats] of Object.entries(data)) {
      totalVisits += stats.visits;
      totalTime += stats.time;
      entries.push({ siteId, ...stats });
    }

    trackTotalVisitsEl.textContent = totalVisits;
    trackTotalTimeEl.textContent = formatTime(totalTime);

    entries.sort((a, b) => b.time - a.time);
    renderTrackedBreakdown(entries);
  } catch (error) {
    console.error('Failed to load tracking data:', error);
  }
}

function renderTrackedBreakdown(entries) {
  trackedBreakdownEl.innerHTML = '';

  const active = entries.filter(e => e.visits > 0 || e.time > 0);
  if (active.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'breakdown-empty';
    empty.textContent = 'No activity yet today';
    trackedBreakdownEl.appendChild(empty);
    return;
  }

  const maxTime = Math.max(1, ...active.map(e => e.time));

  for (const entry of active) {
    const row = document.createElement('div');
    row.className = 'breakdown-item';

    const label = document.createElement('span');
    label.className = 'breakdown-label';
    label.textContent = entry.siteId;

    const stats = document.createElement('span');
    stats.className = 'breakdown-stats';
    stats.textContent = entry.visits + ' · ' + formatTime(entry.time);

    const barTrack = document.createElement('div');
    barTrack.className = 'breakdown-bar-track';
    const bar = document.createElement('div');
    bar.className = 'breakdown-bar';
    bar.style.width = (entry.time / maxTime) * 100 + '%';
    barTrack.appendChild(bar);

    row.appendChild(label);
    row.appendChild(stats);
    row.appendChild(barTrack);
    trackedBreakdownEl.appendChild(row);
  }
}

async function addTrackedSite() {
  const raw = trackSiteInput.value;
  if (!raw.trim()) return;

  const hostname = extractHostname(raw);
  if (!hostname || !hostname.includes('.')) return;

  const id = hostname.replace(/^www\./, '');
  const domains = [hostname];
  if (!hostname.startsWith('www.')) {
    domains.push('www.' + hostname);
  }

  const site = {
    id,
    label: id,
    domains,
    builtin: false
  };

  const result = await chrome.runtime.sendMessage({ type: 'ADD_TRACKED_SITE', site });
  if (result && result.success) {
    trackSiteInput.value = '';
    await loadTrackedSites();
    await loadTrackingData();
  }
}

async function loadRemovalStats() {
  const log = await chrome.runtime.sendMessage({ type: 'GET_REMOVAL_LOG' });
  surrenderedEl.textContent = (log && log.length) || 0;
}

// --- Event listeners ---

addSiteBtn.addEventListener('click', addSite);
siteInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') addSite();
});

// Add-row mode toggle (Always / Limit)
const addModeBtns = document.querySelectorAll('[data-addmode]');
const addLimitWrap = document.getElementById('add-limit-wrap');
addModeBtns.forEach((btn) => {
  btn.addEventListener('click', () => {
    addMode = btn.dataset.addmode;
    addModeBtns.forEach((b) => b.classList.toggle('active', b === btn));
    if (addLimitWrap) addLimitWrap.style.display = addMode === 'limit' ? 'flex' : 'none';
  });
});

addTrackBtn.addEventListener('click', addTrackedSite);
trackSiteInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') addTrackedSite();
});

viewGalleryBtn.addEventListener('click', () => {
  chrome.tabs.create({
    url: chrome.runtime.getURL('blocked/blocked.html?gallery=true')
  });
});

viewReportBtn.addEventListener('click', () => {
  chrome.tabs.create({
    url: chrome.runtime.getURL('report/report.html')
  });
});

testBlockBtn.addEventListener('click', () => {
  chrome.tabs.create({
    url: chrome.runtime.getURL('blocked/blocked.html')
  });
});

viewTrackingReportBtn.addEventListener('click', () => {
  chrome.tabs.create({
    url: chrome.runtime.getURL('report/report.html?tab=tracking')
  });
});

// Load on popup open
loadStats();
loadRestrictions();
loadRemovalStats();
