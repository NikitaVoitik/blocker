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
const commitmentDialog = document.getElementById('commitment-overlay');
const commitmentTitle = document.getElementById('commitment-title');
const commitmentConfirm = document.getElementById('commitment-confirm');
const commitmentCancel = document.getElementById('commitment-cancel');
const commitmentCustom = document.getElementById('commitment-custom');
const commitmentAmount = document.getElementById('commitment-custom-amount');
const commitmentUnit = document.getElementById('commitment-custom-unit');
const LOCK_DURATIONS = { 1: '1 hour', 24: '24 hours', 168: '7 days' };
const MAX_COMMITMENT_HOURS = 365 * 24;
let blockedSites = [];
let commitmentState = null;
let lockRefreshTimer = null;

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
  try {
    const raw = input.trim();
    const url = new URL(/^https?:\/\//i.test(raw) ? raw : 'https://' + raw);
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) return null;
    return url.hostname.toLowerCase().replace(/\.$/, '').replace(/^www\./, '');
  } catch { return null; }
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
  btn.addEventListener('click', () => {
    tabBtns.forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    const tab = btn.dataset.tab;
    tabBlocker.style.display = tab === 'blocker' ? '' : 'none';
    tabTracker.style.display = tab === 'tracker' ? '' : 'none';
    if (tab === 'tracker') {
      loadTrackingData();
      loadTrackedSites();
    }
  });
});

// --- Blocker tab ---

async function loadBlockedSites() {
  const sites = await chrome.runtime.sendMessage({ type: 'GET_BLOCKED_SITES' });
  if (!Array.isArray(sites)) throw new Error(sites?.error || 'Could not load blocked sites. Reopen the popup.');
  blockedSites = sites;
  renderBlockedSites(blockedSites);
  // A commitment made in another popup invalidates an open removal gauntlet.
  if (gauntletState) {
    const site = blockedSites.find(entry => entry.id === gauntletState.siteId);
    if (site && isCommitted(site)) {
      closeGauntlet();
      openCommitment(site, 'details');
    } else if (!site) closeGauntlet();
  }
  if (commitmentState) {
    const site = blockedSites.find(entry => entry.id === commitmentState.site.id);
    if (!site) commitmentDialog.close();
    else {
      commitmentState.site = site;
      if (isCommitted(site)) commitmentState.mode = 'details';
      updateCommitmentDialog();
    }
  }
  await loadAvailablePresets();
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
      const result = await chrome.runtime.sendMessage({ type: 'ADD_BLOCKED_SITE', site: preset });
      if (result && result.success) await loadBlockedSites();
    });

    item.appendChild(label);
    item.appendChild(addBtn);
    container.appendChild(item);
  }

  blockedListEl.parentElement.insertBefore(container, blockedListEl.nextSibling);
}

function renderBlockedSites(sites) {
  const focused = document.activeElement;
  const focusedId = focused?.closest('#blocked-list .site-item')?.dataset.siteId;
  const focusedAction = focused?.classList.contains('site-remove') ? '.site-remove' : '.site-lock';
  blockedListEl.innerHTML = '';
  for (const site of sites) {
    const item = document.createElement('div');
    item.className = 'site-item';
    item.dataset.siteId = site.id;

    const label = document.createElement('span');
    label.className = 'site-label';
    label.textContent = site.label || site.id;

    item.appendChild(label);
    const active = isCommitted(site);
    const lockBtn = document.createElement('button');
    lockBtn.type = 'button';
    lockBtn.className = 'site-lock' + (active ? ' is-locked' : '');
    lockBtn.textContent = active ? 'Locked · ' + lockRemaining(site.lockUntil) : 'Lock';
    lockBtn.setAttribute('aria-label', (active ? 'Locked ' : 'Lock ') + (site.label || site.id));
    lockBtn.addEventListener('click', () => openCommitment(site, isCommitted(site) ? 'details' : 'confirm'));
    item.appendChild(lockBtn);
    if (!active) {
      const removeBtn = document.createElement('button');
      removeBtn.className = 'site-remove';
      removeBtn.textContent = '×';
      removeBtn.title = 'Remove';
      removeBtn.setAttribute('aria-label', 'Remove ' + (site.label || site.id));
      removeBtn.addEventListener('click', () => startRemovalGauntlet(site.id, site.label || site.id));
      item.appendChild(removeBtn);
    }
    if (site.lockUntil) {
      const status = document.createElement('span');
      status.className = 'site-commitment';
      status.textContent = active ? 'Removal available ' + commitmentDate(site.lockUntil) : 'Commitment served · still blocked';
      item.appendChild(status);
    }
    blockedListEl.appendChild(item);
    if (focusedId === site.id && !commitmentDialog.open) {
      (item.querySelector(focusedAction) || lockBtn).focus();
    }
  }
  scheduleLockRefresh();
}

function isCommitted(site) { return Number.isFinite(site.lockUntil) && site.lockUntil > Date.now(); }
function commitmentDate(timestamp) {
  return new Date(timestamp).toLocaleString([], { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit', timeZoneName: 'short' });
}
function lockRemaining(deadline) {
  const minutes = Math.ceil((deadline - Date.now()) / 60_000);
  if (deadline - Date.now() < 60_000) return '<1m';
  if (minutes < 60) return minutes + 'm';
  const hours = Math.floor(minutes / 60);
  if (hours >= 24) return Math.floor(hours / 24) + 'd ' + hours % 24 + 'h';
  return hours + 'h ' + minutes % 60 + 'm';
}
function scheduleLockRefresh() {
  clearTimeout(lockRefreshTimer);
  const deadlines = blockedSites.filter(isCommitted).map(site => site.lockUntil);
  if (!deadlines.length) return;
  const delay = Math.min(30_000, Math.max(1, Math.min(...deadlines) - Date.now()));
  lockRefreshTimer = setTimeout(() => {
    renderBlockedSites(blockedSites);
    if (commitmentState) updateCommitmentDialog();
  }, delay);
}
function showBlockerError(message) {
  const error = document.getElementById('blocker-error');
  error.textContent = message;
  error.hidden = !message;
}
function openCommitment(site, mode) {
  commitmentState = { site, mode, hours: 24, custom: false, saving: false };
  commitmentAmount.value = '24';
  commitmentUnit.value = 'hours';
  document.getElementById('commitment-error').hidden = true;
  updateCommitmentDialog();
  if (!commitmentDialog.open) commitmentDialog.showModal();
  commitmentTitle.focus();
}
function selectedLockDuration() {
  if (!commitmentState.custom) {
    return { hours: commitmentState.hours, label: LOCK_DURATIONS[commitmentState.hours], valid: true };
  }
  const amount = commitmentAmount.valueAsNumber;
  const days = commitmentUnit.value === 'days';
  const hours = amount * (days ? 24 : 1);
  const valid = Number.isSafeInteger(amount) && amount >= 1 && hours <= MAX_COMMITMENT_HOURS;
  const unit = days ? (amount === 1 ? 'day' : 'days') : (amount === 1 ? 'hour' : 'hours');
  return { hours, label: amount + ' ' + unit, valid };
}
function updateCommitmentDialog() {
  if (!commitmentState) return;
  const { site, mode, custom, saving } = commitmentState;
  const duration = selectedLockDuration();
  const confirm = mode === 'confirm';
  const active = isCommitted(site);
  document.getElementById('commitment-kicker').textContent = confirm ? 'OPTIONAL COMMITMENT' : active ? 'COMMITMENT ACTIVE' : 'COMMITMENT SERVED';
  commitmentTitle.textContent = confirm ? 'NO EARLY REMOVAL.' : active ? 'YOU MADE A DEAL.' : 'COMMITMENT SERVED.';
  document.getElementById('commitment-site').textContent = site.label || site.id;
  document.getElementById('commitment-choices').hidden = !confirm;
  document.getElementById('commitment-custom-fields').hidden = !confirm || !custom;
  document.getElementById('commitment-duration-error').hidden = !confirm || !custom || duration.valid;
  commitmentAmount.max = commitmentUnit.value === 'days' ? '365' : String(MAX_COMMITMENT_HOURS);
  commitmentAmount.setAttribute('aria-invalid', String(custom && !duration.valid));
  commitmentAmount.disabled = saving;
  commitmentUnit.disabled = saving;
  const deadline = confirm ? Date.now() + duration.hours * 3600_000 : site.lockUntil;
  const time = document.getElementById('commitment-deadline');
  if (!confirm || duration.valid) {
    time.textContent = commitmentDate(deadline);
    time.dateTime = new Date(deadline).toISOString();
  } else {
    time.textContent = 'Enter a valid duration';
    time.removeAttribute('datetime');
  }
  document.getElementById('commitment-explanation').textContent = confirm
    ? 'You cannot shorten this lock here. Chrome still lets you disable or uninstall the extension.'
    : active ? 'No early removal through this popup. Chrome still lets you disable or uninstall the extension.'
      : 'Your commitment ended. The site is still blocked. Close this panel to start removal.';
  commitmentConfirm.hidden = !confirm;
  commitmentConfirm.disabled = saving || !duration.valid;
  commitmentConfirm.textContent = saving ? 'Locking…' : duration.valid ? 'Lock removal for ' + duration.label : 'Enter a valid duration';
  commitmentCancel.textContent = confirm ? 'Cancel' : 'Back to blocker';
  commitmentCancel.disabled = saving;
  document.querySelectorAll('[data-lock-hours]').forEach(button => {
    button.setAttribute('aria-pressed', String(!custom && Number(button.dataset.lockHours) === commitmentState.hours));
    button.disabled = saving;
  });
  commitmentCustom.setAttribute('aria-pressed', String(custom));
  commitmentCustom.disabled = saving;
}
document.querySelectorAll('[data-lock-hours]').forEach(button => button.addEventListener('click', () => {
  if (!commitmentState || commitmentState.saving) return;
  commitmentState.custom = false;
  commitmentState.hours = Number(button.dataset.lockHours);
  updateCommitmentDialog();
}));
commitmentCustom.addEventListener('click', () => {
  if (!commitmentState || commitmentState.saving) return;
  commitmentState.custom = true;
  updateCommitmentDialog();
  commitmentAmount.focus();
  commitmentAmount.select();
});
commitmentAmount.addEventListener('input', updateCommitmentDialog);
commitmentUnit.addEventListener('change', updateCommitmentDialog);
commitmentDialog.addEventListener('cancel', event => {
  if (commitmentState?.saving) event.preventDefault();
});
commitmentDialog.addEventListener('keydown', event => {
  if (event.key !== 'Tab') return;
  const buttons = [...commitmentDialog.querySelectorAll('button, input, select')].filter(button => !button.disabled && button.getClientRects().length);
  const first = buttons[0];
  const last = buttons[buttons.length - 1];
  if (!first) return;
  if (event.shiftKey && (document.activeElement === first || document.activeElement === commitmentTitle)) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
});
commitmentDialog.addEventListener('close', () => { commitmentState = null; });
commitmentCancel.addEventListener('click', () => commitmentDialog.close());
commitmentConfirm.addEventListener('click', async () => {
  if (!commitmentState || commitmentState.saving || commitmentState.mode !== 'confirm') return;
  const duration = selectedLockDuration();
  if (!duration.valid) return;
  const state = commitmentState;
  state.saving = true;
  updateCommitmentDialog();
  try {
    const result = await chrome.runtime.sendMessage({ type: 'LOCK_BLOCKED_SITE', siteId: state.site.id, durationHours: duration.hours });
    if (!result?.success) {
      if (result?.code === 'COMMITMENT_ACTIVE') {
        state.site.lockUntil = result.lockUntil;
        state.mode = 'details';
      } else throw new Error(result?.error || 'Could not start the lock. Try again.');
    } else commitmentDialog.close();
    await loadBlockedSites();
  } catch (error) {
    const message = document.getElementById('commitment-error');
    message.textContent = error.message;
    message.hidden = false;
  } finally {
    state.saving = false;
    updateCommitmentDialog();
  }
});

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

  const site = {
    id,
    label: id,
    domains,
    builtin: false
  };

  const result = await chrome.runtime.sendMessage({ type: 'ADD_BLOCKED_SITE', site });
  if (result && result.success) {
    siteInput.value = '';
    await loadBlockedSites();
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
  const site = blockedSites.find(entry => entry.id === siteId);
  if (site && isCommitted(site)) return openCommitment(site, 'details');
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

  const { siteId } = gauntletState;
  closeGauntlet();

  showBlockerError('');
  const result = await chrome.runtime.sendMessage({ type: 'REMOVE_BLOCKED_SITE', siteId, capturePhoto: true });
  if (result?.success) {
    await loadBlockedSites();
    await loadRemovalStats();
  } else if (result?.code === 'COMMITMENT_ACTIVE') {
    await loadBlockedSites();
    const site = blockedSites.find(entry => entry.id === siteId);
    if (site) openCommitment(site, 'details');
  } else {
    showBlockerError(result?.error || 'Could not remove the site. Try again.');
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

// --- Tracker tab ---

async function loadTrackedSites() {
  const sites = await chrome.runtime.sendMessage({ type: 'GET_TRACKED_SITES' });
  renderTrackedSites(sites || []);
  await loadAvailableTrackingPresets();
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
      if (result && result.success) {
        await loadTrackedSites();
        await loadTrackingData();
      }
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
loadBlockedSites().catch(error => showBlockerError(error.message));
loadRemovalStats();

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && changes.blockedSites) {
    loadBlockedSites().catch(error => showBlockerError(error.message));
  }
});

chrome.extension.isAllowedIncognitoAccess().then(allowed => {
  document.getElementById('incognito-warning').hidden = allowed;
}).catch(console.error);
document.getElementById('incognito-settings').addEventListener('click', () => {
  chrome.tabs.create({ url: 'chrome://extensions/?id=' + chrome.runtime.id });
});
