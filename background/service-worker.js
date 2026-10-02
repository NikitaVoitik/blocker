// Service Worker - Coordinates capture, storage, and messaging

const OFFSCREEN_DOCUMENT_PATH = 'offscreen/offscreen.html';
const RULE_CHECK_ALARM = 'verify-block-rules';
const TRACKING_FLUSH_ALARM = 'flush-tracking-time';

const DEFAULT_SITES = [
  {
    id: 'twitter',
    label: 'Twitter / X',
    domains: ['twitter.com', 'x.com', 'www.twitter.com', 'www.x.com', 'mobile.twitter.com', 'mobile.x.com'],
    builtin: true
  },
  {
    id: 'youtube-shorts',
    label: 'YouTube Shorts',
    domains: ['youtube.com/shorts', 'www.youtube.com/shorts', 'm.youtube.com/shorts'],
    pathOnly: true,
    builtin: true
  }
];

const DEFAULT_TRACKED_SITES = [
  {
    id: 'instagram',
    label: 'Instagram',
    domains: ['instagram.com', 'www.instagram.com'],
    builtin: true
  },
  {
    id: 'facebook',
    label: 'Facebook',
    domains: ['facebook.com', 'www.facebook.com', 'web.facebook.com', 'm.facebook.com'],
    builtin: true
  },
  {
    id: 'tiktok',
    label: 'TikTok',
    domains: ['tiktok.com', 'www.tiktok.com'],
    builtin: true
  },
  {
    id: 'reddit',
    label: 'Reddit',
    domains: ['reddit.com', 'www.reddit.com', 'old.reddit.com'],
    builtin: true
  },
  {
    id: 'twitter',
    label: 'Twitter / X',
    domains: ['twitter.com', 'x.com', 'www.twitter.com', 'www.x.com', 'mobile.twitter.com', 'mobile.x.com'],
    builtin: true
  },
  {
    id: 'youtube',
    label: 'YouTube',
    domains: ['youtube.com', 'www.youtube.com', 'm.youtube.com'],
    builtin: true
  },
  {
    id: 'snapchat',
    label: 'Snapchat',
    domains: ['snapchat.com', 'www.snapchat.com', 'web.snapchat.com'],
    builtin: true
  },
  {
    id: 'linkedin',
    label: 'LinkedIn',
    domains: ['linkedin.com', 'www.linkedin.com'],
    builtin: true
  },
  {
    id: 'pinterest',
    label: 'Pinterest',
    domains: ['pinterest.com', 'www.pinterest.com'],
    builtin: true
  },
  {
    id: 'tumblr',
    label: 'Tumblr',
    domains: ['tumblr.com', 'www.tumblr.com'],
    builtin: true
  }
];

// Runtime cache of blocked sites
let currentBlockedSites = DEFAULT_SITES;

// Runtime cache of tracked sites
let currentTrackedSites = DEFAULT_TRACKED_SITES;

// Active time tracking state
let activeTracking = { tabId: null, siteId: null, startTime: null };

// Serialize operations that read and then replace shared state.
function createQueue() {
  let pending = Promise.resolve();
  return operation => {
    const result = pending.then(operation);
    pending = result.catch(() => {});
    return result;
  };
}
// Split Incognito workers cannot open the normal profile's extension pages.
// Give each worker its own writable counters; readers combine both local partitions.
const privateContext = chrome.extension.inIncognitoContext;
const localKey = key => privateContext ? 'incognito:' + key : key;
const sessionKey = localKey('activeTracking');
async function getOwnData(keys) {
  keys = Array.isArray(keys) ? keys : [keys];
  const values = await chrome.storage.local.get(keys.map(localKey));
  return Object.fromEntries(keys.map(key => [key, values[localKey(key)]]));
}
async function setOwnData(data) {
  await chrome.storage.local.set(Object.fromEntries(Object.entries(data).map(([key, value]) => [localKey(key), value])));
}
async function combinedTrackingData() {
  const values = await chrome.storage.local.get(['trackingData', 'incognito:trackingData']);
  const combined = { visits: {}, time: {} };
  for (const data of [values.trackingData, values['incognito:trackingData']]) {
    if (!data) continue;
    for (const type of ['visits', 'time']) {
      for (const [key, value] of Object.entries(data[type] || {})) combined[type][key] = (combined[type][key] || 0) + value;
    }
  }
  return combined;
}
async function combinedAttempts() {
  const keys = ['attemptCount', 'todayDate', 'todayCount', 'dailyCounts', 'attemptLog', 'installDate'];
  const values = await chrome.storage.local.get([...keys, ...keys.map(key => 'incognito:' + key)]);
  const today = new Date().toDateString();
  const result = { attemptCount: 0, todayCount: 0, dailyCounts: {}, attemptLog: [], installDate: values.installDate };
  for (const prefix of ['', 'incognito:']) {
    result.attemptCount += values[prefix + 'attemptCount'] || 0;
    if (values[prefix + 'todayDate'] === today) result.todayCount += values[prefix + 'todayCount'] || 0;
    for (const [day, count] of Object.entries(values[prefix + 'dailyCounts'] || {})) result.dailyCounts[day] = (result.dailyCounts[day] || 0) + count;
    result.attemptLog.push(...(values[prefix + 'attemptLog'] || []));
  }
  return result;
}

const mutateStorage = createQueue();
const mutateSites = createQueue();
const updateRules = createQueue();
const updateTracking = createQueue();
const captureQueue = createQueue();

function normalizeHost(host) {
  return host.toLowerCase().replace(/\.$/, '').replace(/^www\./, '');
}
function hostMatches(host, domain) {
  host = normalizeHost(host);
  domain = normalizeHost(domain);
  return host === domain || host.endsWith('.' + domain);
}
function normalizeSite(site) {
  if (!site || typeof site.id !== 'string' || !Array.isArray(site.domains) || !site.domains.length) {
    throw new Error('Enter a valid site');
  }
  const domains = [...new Set(site.domains.map(domain => {
    const url = new URL('https://' + domain);
    if (!url.hostname.includes('.') || url.username || url.password || url.search || url.hash) {
      throw new Error('Enter a valid domain');
    }
    const host = normalizeHost(url.hostname);
    return host + (site.pathOnly ? url.pathname.replace(/\/$/, '') : '');
  }))];
  return { ...site, domains };
}

// Load blocked sites from storage
async function loadBlockedSites() {
  const result = await chrome.storage.local.get('blockedSites');
  currentBlockedSites = (result.blockedSites || DEFAULT_SITES).map(normalizeSite);
  return currentBlockedSites;
}

// Save blocked sites to storage and sync rules
async function saveBlockedSites(sites) {
  currentBlockedSites = sites;
  await chrome.storage.local.set({ blockedSites: sites });
  await syncBlockRules();
}

// Load tracked sites from storage
async function loadTrackedSites() {
  const result = await chrome.storage.local.get('trackedSites');
  currentTrackedSites = (result.trackedSites || DEFAULT_TRACKED_SITES).map(normalizeSite);
  return currentTrackedSites;
}

// Save tracked sites to storage
async function saveTrackedSites(sites) {
  currentTrackedSites = sites;
  await chrome.storage.local.set({ trackedSites: sites });
}

// Check if a URL matches any tracked site
function getMatchingTrackedSite(url) {
  try {
    const parsed = new URL(url);
    for (const site of currentTrackedSites) {
      if (site.domains.some(domain => hostMatches(parsed.hostname, domain))) {
        return site;
      }
    }
  } catch (e) {
    // Invalid URL
  }
  return null;
}

// Chrome's requestDomains matches complete hosts and their subdomains.
function buildBlockRules() {
  let id = 1000;
  const rules = [];
  for (const site of currentBlockedSites) {
    for (const domain of site.domains) {
      const [host, ...parts] = domain.split('/');
      const condition = { requestDomains: [host], resourceTypes: ['main_frame'] };
      if (site.pathOnly) {
        const path = '/' + parts.join('/');
        const escaped = path.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        condition.isUrlFilterCaseSensitive = true;
        condition.regexFilter = '^https?://[^/]+' + escaped + '([/?#]|$)';
      }
      rules.push({ id: id++, priority: site.pathOnly ? 2 : 1,
        action: { type: 'redirect', redirect: { extensionPath: '/blocked/blocked.html?site=' + encodeURIComponent(site.id) } },
        condition });
      rules.push({ id: id++, priority: site.pathOnly ? 2 : 1, action: { type: 'block' },
        condition: { ...condition, resourceTypes: ['sub_frame'] } });
    }
  }
  return rules;
}

function syncBlockRules() {
  return updateRules(async () => {
    const rules = buildBlockRules();
    const existing = await chrome.declarativeNetRequest.getDynamicRules();
    await chrome.declarativeNetRequest.updateDynamicRules({ removeRuleIds: existing.map(r => r.id), addRules: rules });
  });
}

// Compare the actual contract, not just the number of installed rules.
async function verifyBlockRules() {
  const signature = rule => JSON.stringify([rule.id, rule.priority, rule.action.type, rule.action.redirect?.extensionPath || '',
    rule.condition.requestDomains, rule.condition.regexFilter || '', rule.condition.isUrlFilterCaseSensitive || false, rule.condition.resourceTypes]);
  const expected = buildBlockRules().map(signature).sort();
  const actual = (await chrome.declarativeNetRequest.getDynamicRules()).map(signature).sort();
  if (JSON.stringify(actual) !== JSON.stringify(expected)) await syncBlockRules();
}

// Check if a URL matches any blocked site
function getMatchingSite(url) {
  try {
    const parsed = new URL(url);
    for (const site of currentBlockedSites) {
      if (site.pathOnly) {
        for (const domain of site.domains) {
          const [host, ...pathParts] = domain.split('/');
          const path = '/' + pathParts.join('/');
          if (hostMatches(parsed.hostname, host) && (parsed.pathname === path || parsed.pathname.startsWith(path + '/'))) {
            return site;
          }
        }
      } else {
        if (site.domains.some(domain => hostMatches(parsed.hostname, domain))) {
          return site;
        }
      }
    }
  } catch (e) {
    // Invalid URL
  }
  return null;
}

async function enforceNavigation(details) {
  if (details.frameId !== 0) return;
  await initReady;
  const site = getMatchingSite(details.url);
  if (!site) return;
  try {
    const tab = await chrome.tabs.get(details.tabId);
    if (tab.pendingUrl && !getMatchingSite(tab.pendingUrl)) return;
    const destination = chrome.runtime.getURL('blocked/blocked.html?site=' + encodeURIComponent(site.id));
    // DNR may already have redirected this tab. Do not navigate twice.
    if (tab.url !== destination && tab.pendingUrl !== destination) {
      await chrome.tabs.update(details.tabId, { url: destination });
    }
  } catch (error) {
    // The user may close the tab while the navigation is being blocked.
    console.debug('Block navigation ended:', error.message);
  }
}
const enforce = details => { enforceNavigation(details).catch(console.error); };
// DNR owns network navigation. Running an async backup before commit can race
// its redirect and produce a second block page (and a false attempt).
chrome.webNavigation.onHistoryStateUpdated.addListener(enforce);
chrome.webNavigation.onCommitted.addListener(details => {
  if (details.frameId !== 0) return;
  const url = new URL(details.url);
  if (url.origin === new URL(chrome.runtime.getURL('/')).origin && url.pathname === '/blocked/blocked.html') {
    const siteId = url.searchParams.get('site');
    if (siteId && !['reload', 'auto_toplevel'].includes(details.transitionType) && !details.transitionQualifiers.includes('forward_back')) {
      initReady.then(() => incrementAttempt(siteId)).catch(console.error);
    }
  } else {
    enforce(details); // Covers redirects, restored pages and cached navigations.
  }
});

chrome.webNavigation.onCompleted.addListener(details => {
  if (details.frameId === 0) {
    initReady.then(() => {
      const site = getMatchingTrackedSite(details.url);
      if (site) return incrementVisit(site.id);
    }).catch(console.error);
  }
});

async function setActiveTracking(tab) {
  await flushTrackingTime();
  const site = tab && tab.url ? getMatchingTrackedSite(tab.url) : null;
  activeTracking = { tabId: tab ? tab.id : null, siteId: site ? site.id : null, startTime: site ? Date.now() : null };
  await chrome.storage.session.set({ [sessionKey]: activeTracking });
}
function changeTracking(operation) {
  initReady.then(() => updateTracking(operation)).catch(console.error);
}
chrome.tabs.onActivated.addListener(info => changeTracking(async () => {
  const tab = await chrome.tabs.get(info.tabId).catch(() => null);
  await setActiveTracking(tab);
}));
chrome.windows.onFocusChanged.addListener(windowId => changeTracking(async () => {
  const [tab] = windowId === chrome.windows.WINDOW_ID_NONE ? [] : await chrome.tabs.query({ active: true, windowId });
  await setActiveTracking(tab || null);
}));
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.url) changeTracking(async () => {
    if (tabId === activeTracking.tabId) await setActiveTracking({ ...tab, url: changeInfo.url });
  });
});
chrome.tabs.onRemoved.addListener(tabId => changeTracking(async () => {
  if (tabId === activeTracking.tabId) await setActiveTracking(null);
}));

const DB_NAME = 'SelfieShameDB';
const DB_VERSION = 1;
const PHOTOS_STORE = 'photos';
const DEFAULT_PHOTO_LIMIT = 50;
const MIN_PHOTO_LIMIT = 5;
const MAX_PHOTO_LIMIT = 500;

// Runtime cache of the user-configured photo limit
let currentPhotoLimit = DEFAULT_PHOTO_LIMIT;

// IndexedDB instance
let db = null;

async function loadPhotoLimit() {
  const result = await chrome.storage.local.get('photoLimit');
  const stored = Number(result.photoLimit);
  if (Number.isFinite(stored) && stored >= MIN_PHOTO_LIMIT && stored <= MAX_PHOTO_LIMIT) {
    currentPhotoLimit = Math.floor(stored);
  } else {
    currentPhotoLimit = DEFAULT_PHOTO_LIMIT;
  }
  return currentPhotoLimit;
}

function setPhotoLimit(value) { return captureQueue(() => applyPhotoLimit(value)); }
async function applyPhotoLimit(value) {
  const n = Math.floor(Number(value));
  if (!Number.isFinite(n) || n < MIN_PHOTO_LIMIT || n > MAX_PHOTO_LIMIT) {
    return { success: false, error: 'Invalid photo limit', limit: currentPhotoLimit };
  }
  currentPhotoLimit = n;
  await chrome.storage.local.set({ photoLimit: n });
  await cleanupOldPhotos();
  return { success: true, limit: n };
}

// Open IndexedDB
async function openDatabase() {
  if (db) return db;

  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      db = request.result;
      resolve(db);
    };

    request.onupgradeneeded = (event) => {
      const database = event.target.result;
      if (!database.objectStoreNames.contains(PHOTOS_STORE)) {
        const store = database.createObjectStore(PHOTOS_STORE, {
          keyPath: 'id',
          autoIncrement: true
        });
        store.createIndex('timestamp', 'timestamp', { unique: false });
      }
    };
  });
}

// Save photo to IndexedDB
async function savePhoto(dataUrl) {
  const database = await openDatabase();

  return new Promise((resolve, reject) => {
    const transaction = database.transaction([PHOTOS_STORE], 'readwrite');
    const store = transaction.objectStore(PHOTOS_STORE);

    const photo = {
      data: dataUrl,
      timestamp: Date.now()
    };

    const request = store.add(photo);
    request.onerror = () => reject(request.error);
    transaction.onabort = () => reject(transaction.error || new Error('Photo save aborted'));
    transaction.oncomplete = () => { cleanupOldPhotos().catch(console.error); resolve(request.result); };
  });
}

// Get all photos
async function getPhotos() {
  const database = await openDatabase();

  return new Promise((resolve, reject) => {
    const transaction = database.transaction([PHOTOS_STORE], 'readonly');
    const store = transaction.objectStore(PHOTOS_STORE);
    const request = store.getAll();

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

// Cleanup old photos (keep only the most recent currentPhotoLimit)
async function cleanupOldPhotos() {
  const database = await openDatabase();
  const limit = currentPhotoLimit;

  return new Promise((resolve, reject) => {
    const transaction = database.transaction([PHOTOS_STORE], 'readwrite');
    const store = transaction.objectStore(PHOTOS_STORE);
    const index = store.index('timestamp');

    const request = index.openCursor(null, 'prev');
    const toDelete = [];
    let count = 0;

    request.onsuccess = (event) => {
      const cursor = event.target.result;
      if (cursor) {
        count++;
        if (count > limit) {
          toDelete.push(cursor.primaryKey);
        }
        cursor.continue();
      } else {
        toDelete.forEach(key => store.delete(key));
      }
    };

    request.onerror = () => reject(request.error);
    transaction.oncomplete = () => resolve();
    transaction.onabort = () => reject(transaction.error || new Error('Photo cleanup aborted'));
  });
}

// Clear every photo from storage
function clearAllPhotos() { return captureQueue(purgePhotos); }
async function purgePhotos() {
  const database = await openDatabase();

  return new Promise((resolve, reject) => {
    const transaction = database.transaction([PHOTOS_STORE], 'readwrite');
    const store = transaction.objectStore(PHOTOS_STORE);
    const request = store.clear();
    request.onerror = () => reject(request.error);
    transaction.oncomplete = () => resolve({ success: true });
    transaction.onabort = () => reject(transaction.error || new Error('Photo purge aborted'));
  });
}

// Compute storage info for the photo gallery (count + approximate bytes)
async function getPhotoStorageInfo() {
  const photos = await getPhotos();
  let bytes = 0;
  for (const photo of photos) {
    if (photo && typeof photo.data === 'string') {
      // data URL: "data:image/...;base64,<payload>". Decoded size ≈ payload.length * 3 / 4.
      const commaIdx = photo.data.indexOf(',');
      const payloadLen = commaIdx >= 0 ? photo.data.length - commaIdx - 1 : photo.data.length;
      bytes += Math.floor(payloadLen * 3 / 4);
    }
  }
  return {
    count: photos.length,
    bytes,
    limit: currentPhotoLimit,
    minLimit: MIN_PHOTO_LIMIT,
    maxLimit: MAX_PHOTO_LIMIT
  };
}

// Get today's date key in YYYY-MM-DD format
function getTodayKey() {
  const d = new Date();
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}

// Sum dailyCounts for the last n calendar days
function sumLastNDays(dailyCounts, n) {
  const today = new Date();
  let total = 0;
  for (let i = 0; i < n; i++) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const key = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
    total += dailyCounts[key] || 0;
  }
  return total;
}

function sumLastThreeDays(dailyCounts) {
  return sumLastNDays(dailyCounts, 3);
}

// Prune dailyCounts entries older than 30 days
function pruneDailyCounts(dailyCounts) {
  const today = new Date();
  const validKeys = new Set();
  for (let i = 0; i < 30; i++) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    validKeys.add(d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'));
  }
  const pruned = {};
  for (const key of Object.keys(dailyCounts)) {
    if (validKeys.has(key)) pruned[key] = dailyCounts[key];
  }
  return pruned;
}

// Increment visit count for a tracked site
function incrementVisit(siteId) {
  return mutateStorage(async () => {
    const result = await getOwnData('trackingData');
    const data = result.trackingData || { visits: {}, time: {} };
    const key = siteId + ':' + getTodayKey();
    data.visits[key] = (data.visits[key] || 0) + 1;
    pruneTrackingData(data);
    await setOwnData({ trackingData: data });
  });
}

// Keep fractional seconds across rapid switches, cap stale sessions, and split midnight.
async function flushTrackingTime() {
  if (!activeTracking.siteId || activeTracking.startTime === null) return;
  const end = Date.now();
  const start = activeTracking.startTime;
  if (end <= start) return;
  const siteId = activeTracking.siteId;
  await mutateStorage(async () => {
    const result = await getOwnData('trackingData');
    const data = result.trackingData || { visits: {}, time: {} };
    let cursor = start;
    const cappedEnd = Math.min(end, start + 1800_000);
    while (cursor < cappedEnd) {
      const day = new Date(cursor);
      const key = siteId + ':' + day.getFullYear() + '-' + String(day.getMonth() + 1).padStart(2, '0') + '-' + String(day.getDate()).padStart(2, '0');
      const midnight = new Date(day); midnight.setHours(24, 0, 0, 0);
      const next = Math.min(cappedEnd, midnight.getTime());
      data.time[key] = (data.time[key] || 0) + (next - cursor) / 1000;
      cursor = next;
    }
    pruneTrackingData(data);
    await setOwnData({ trackingData: data });
  });
  activeTracking.startTime = end;
  await chrome.storage.session.set({ [sessionKey]: activeTracking });
}
function flushActiveTime() { return updateTracking(flushTrackingTime); }

// Prune tracking data entries older than 30 days
function pruneTrackingData(data) {
  const today = new Date();
  const validKeys = new Set();
  for (let i = 0; i < 30; i++) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    validKeys.add(d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'));
  }
  for (const key of Object.keys(data.visits)) {
    const datepart = key.split(':')[1];
    if (!validKeys.has(datepart)) delete data.visits[key];
  }
  for (const key of Object.keys(data.time)) {
    const datepart = key.split(':')[1];
    if (!validKeys.has(datepart)) delete data.time[key];
  }
}

// Get today's tracking data for all tracked sites
async function getTrackingDataForToday() {
  await flushActiveTime();
  const data = await combinedTrackingData();
  const todayKey = getTodayKey();
  const sites = {};
  for (const site of currentTrackedSites) {
    const vKey = site.id + ':' + todayKey;
    const tKey = site.id + ':' + todayKey;
    sites[site.id] = {
      visits: data.visits[vKey] || 0,
      time: data.time[tKey] || 0
    };
  }
  return sites;
}

// Get full tracking report data (30-day breakdown)
async function getTrackingReportData() {
  await flushActiveTime();
  const data = await combinedTrackingData();
  const today = new Date();
  const todayKey = getTodayKey();

  // Daily totals (all sites combined)
  const dailyBreakdown = [];
  for (let i = 29; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const dateKey = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
    let dayTime = 0;
    let dayVisits = 0;
    for (const site of currentTrackedSites) {
      dayTime += data.time[site.id + ':' + dateKey] || 0;
      dayVisits += data.visits[site.id + ':' + dateKey] || 0;
    }
    dailyBreakdown.push({ date: dateKey, time: dayTime, visits: dayVisits });
  }

  // Per-site totals for today, this week, and this month
  const siteBreakdownToday = [];
  const siteBreakdownWeek = [];
  const siteBreakdownMonth = [];
  for (const site of currentTrackedSites) {
    let todaySiteTime = 0, todaySiteVisits = 0;
    let weekSiteTime = 0, weekSiteVisits = 0;
    let monthSiteTime = 0, monthSiteVisits = 0;
    for (let i = 0; i < 30; i++) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      const dateKey = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
      const t = data.time[site.id + ':' + dateKey] || 0;
      const v = data.visits[site.id + ':' + dateKey] || 0;
      if (i === 0) { todaySiteTime = t; todaySiteVisits = v; }
      if (i < 7) { weekSiteTime += t; weekSiteVisits += v; }
      monthSiteTime += t; monthSiteVisits += v;
    }
    siteBreakdownToday.push({ id: site.id, label: site.label, visits: todaySiteVisits, time: todaySiteTime });
    siteBreakdownWeek.push({ id: site.id, label: site.label, visits: weekSiteVisits, time: weekSiteTime });
    siteBreakdownMonth.push({ id: site.id, label: site.label, visits: monthSiteVisits, time: monthSiteTime });
  }
  siteBreakdownToday.sort((a, b) => b.time - a.time);
  siteBreakdownWeek.sort((a, b) => b.time - a.time);
  siteBreakdownMonth.sort((a, b) => b.time - a.time);

  // Weekly summaries
  const weeklySummaries = [];
  for (let w = 0; w < 4; w++) {
    let weekTime = 0;
    let weekVisits = 0;
    for (let i = 0; i < 7; i++) {
      const d = new Date(today);
      d.setDate(d.getDate() - (w * 7 + i));
      const dateKey = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
      for (const site of currentTrackedSites) {
        weekTime += data.time[site.id + ':' + dateKey] || 0;
        weekVisits += data.visits[site.id + ':' + dateKey] || 0;
      }
    }
    weeklySummaries.push({ weekNumber: w + 1, time: weekTime, visits: weekVisits });
  }

  // Summary totals
  const todayIdx = dailyBreakdown.length - 1;
  const todayTime = dailyBreakdown[todayIdx].time;
  const todayVisits = dailyBreakdown[todayIdx].visits;
  const weekTime = weeklySummaries[0].time;
  const monthTime = dailyBreakdown.reduce((sum, d) => sum + d.time, 0);
  const monthVisits = dailyBreakdown.reduce((sum, d) => sum + d.visits, 0);

  // Insights
  const daysWithActivity = dailyBreakdown.filter(d => d.time > 0).length;
  const avgDailyTime = daysWithActivity > 0 ? Math.round(monthTime / daysWithActivity) : 0;
  const mostTimeSite = siteBreakdownMonth[0] && siteBreakdownMonth[0].time > 0 ? siteBreakdownMonth[0] : null;
  const mostVisitedSite = [...siteBreakdownMonth].sort((a, b) => b.visits - a.visits)[0];
  const mostVisited = mostVisitedSite && mostVisitedSite.visits > 0 ? mostVisitedSite : null;

  // Worst day (most screen time)
  let worstDay = { date: 'N/A', time: 0 };
  for (const entry of dailyBreakdown) {
    if (entry.time > worstDay.time) worstDay = entry;
  }

  return {
    todayTime,
    todayVisits,
    weekTime,
    monthTime,
    monthVisits,
    dailyBreakdown,
    siteBreakdownToday,
    siteBreakdownWeek,
    siteBreakdownMonth,
    weeklySummaries,
    avgDailyTime,
    mostTimeSite,
    mostVisited,
    worstDay
  };
}

// Add a tracked site
function addTrackedSite(siteEntry) {
  return mutateSites(async () => {
    siteEntry = normalizeSite(siteEntry);
    const sites = [...currentTrackedSites];
    if (sites.some(s => s.id === siteEntry.id)) {
      return { success: false, error: 'Site already tracked' };
    }
    sites.push(siteEntry);
    await saveTrackedSites(sites);
    return { success: true, sites };
  });
}

// Remove a tracked site
function removeTrackedSite(siteId) {
  return mutateSites(async () => {
    await flushActiveTime();
    const sites = currentTrackedSites.filter(s => s.id !== siteId);
    await saveTrackedSites(sites);
    if (activeTracking.siteId === siteId) await updateTracking(() => setActiveTracking(null));
    return { success: true, sites };
  });
}

// Get/update attempt stats
function getStats() { return mutateStorage(readStats); }
async function readStats() {
  const result = await getOwnData(['attemptCount', 'todayDate', 'todayCount', 'dailyCounts']);

  const today = new Date().toDateString();
  let todayCount = result.todayCount || 0;

  // Reset today count if it's a new day
  if (result.todayDate !== today) {
    todayCount = 0;
    await setOwnData({ todayDate: today, todayCount: 0 });
  }

  let dailyCounts = result.dailyCounts || {};

  // Migrate: if dailyCounts was never written, seed today's entry from todayCount
  const todayKey = getTodayKey();
  if (Object.keys(dailyCounts).length === 0 && todayCount > 0) {
    dailyCounts[todayKey] = todayCount;
    await setOwnData({ dailyCounts });
  }

  const combined = await combinedAttempts();
  return { allTimeCount: combined.attemptCount, todayCount: combined.todayCount, threeDayCount: sumLastThreeDays(combined.dailyCounts) };
}

function incrementAttempt(siteId) { return mutateStorage(() => recordAttempt(siteId)); }
async function recordAttempt(siteId) {
  const result = await getOwnData(['attemptCount', 'todayDate', 'todayCount', 'dailyCounts', 'attemptLog']);

  const today = new Date().toDateString();
  let todayCount = result.todayCount || 0;

  // Reset today count if it's a new day
  if (result.todayDate !== today) {
    todayCount = 0;
  }

  const newAllTime = (result.attemptCount || 0) + 1;
  const newToday = todayCount + 1;

  // Update dailyCounts
  const todayKey = getTodayKey();
  let dailyCounts = result.dailyCounts || {};
  dailyCounts[todayKey] = (dailyCounts[todayKey] || 0) + 1;
  dailyCounts = pruneDailyCounts(dailyCounts);

  await setOwnData({
    attemptCount: newAllTime,
    todayDate: today,
    todayCount: newToday,
    dailyCounts,
    attemptLog: [...(result.attemptLog || []), { siteId, timestamp: Date.now() }].slice(-1000)
  });

  return { allTimeCount: newAllTime, todayCount: newToday, threeDayCount: sumLastThreeDays(dailyCounts) };
}

// Check if offscreen document exists
async function hasOffscreenDocument() {
  const contexts = await chrome.runtime.getContexts({
    contextTypes: ['OFFSCREEN_DOCUMENT'],
    documentUrls: [chrome.runtime.getURL(OFFSCREEN_DOCUMENT_PATH)]
  });
  return contexts.length > 0;
}

// Create offscreen document
async function createOffscreenDocument() {
  if (await hasOffscreenDocument()) {
    return;
  }

  await chrome.offscreen.createDocument({
    url: OFFSCREEN_DOCUMENT_PATH,
    reasons: ['USER_MEDIA'],
    justification: 'Capture webcam photo for shame display'
  });
}

// Close offscreen document
async function closeOffscreenDocument() {
  if (await hasOffscreenDocument()) {
    try {
      await chrome.runtime.sendMessage({ type: 'CLEANUP' });
    } catch (e) {
      // Document may already be unresponsive
    }
    await chrome.offscreen.closeDocument();
  }
}

// Capture photo via offscreen document
function capturePhoto() { return captureQueue(captureAndSavePhoto); }
async function captureAndSavePhoto() {
  try {
    await createOffscreenDocument();

    // Small delay to ensure document is ready
    await new Promise(resolve => setTimeout(resolve, 200));

    const response = await chrome.runtime.sendMessage({ type: 'CAPTURE_PHOTO' });

    if (response && response.success) {
      // Captures are evidence; navigation records attempts independently.
      const photoId = await savePhoto(response.data);
      await closeOffscreenDocument();

      return { ...response, photoId };
    }

    await closeOffscreenDocument();
    return { success: false, error: 'Capture failed' };
  } catch (error) {
    console.error('Capture error:', error);
    await closeOffscreenDocument();
    return { success: false, error: error.message };
  }
}

// Add a blocked site
function addBlockedSite(siteEntry) {
  return mutateSites(async () => {
    siteEntry = normalizeSite(siteEntry);
    const sites = [...currentBlockedSites];

    // Check for duplicate
    if (sites.some(s => s.id === siteEntry.id)) {
      return { success: false, error: 'Site already blocked' };
    }

    sites.push(siteEntry);
    await saveBlockedSites(sites);
    const tabs = await chrome.tabs.query({});
    await Promise.all(tabs.filter(tab => tab.url && getMatchingSite(tab.url)).map(tab => enforceNavigation({ tabId: tab.id, frameId: 0, url: tab.url })));
    return { success: true, sites };
  });
}

// Remove a blocked site
function removeBlockedSite(siteId, photoId) {
  return mutateSites(async () => {
    const removed = currentBlockedSites.find(site => site.id === siteId);
    if (!removed) return { success: false, error: 'Site is not blocked' };
    const sites = currentBlockedSites.filter(s => s.id !== siteId);
    await saveBlockedSites(sites);
    await logRemoval(siteId, removed.label || siteId, photoId);
    return { success: true, sites };
  });
}

function logRemoval(siteId, siteLabel, photoId) {
  return mutateStorage(async () => {
    const result = await getOwnData('removalLog');
    const log = result.removalLog || [];
    log.push({
      siteId,
      siteLabel,
      timestamp: Date.now(),
      photoId: photoId || null,
      photoContext: privateContext ? 'incognito' : 'regular'
    });
    await setOwnData({ removalLog: log });
  });
}

async function getRemovalLog() {
  const result = await chrome.storage.local.get(['removalLog', 'incognito:removalLog']);
  return [...(result.removalLog || []), ...(result['incognito:removalLog'] || [])].sort((a, b) => a.timestamp - b.timestamp);
}

// Handle messages from content scripts and popup
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  // Ignore messages from offscreen document (it handles CAPTURE_PHOTO internally)
  if (sender.url && sender.url.includes('offscreen/offscreen.html')) {
    return false;
  }

  if (message.type === 'CAPTURE_PHOTO') {
    initReady.then(() => capturePhoto()).then(sendResponse).catch(error => sendResponse({ success: false, error: error.message }));
    return true; // Async response
  }

  if (message.type === 'GET_STATS') {
    initReady.then(() => getStats()).then(sendResponse).catch(error => sendResponse({ success: false, error: error.message }));
    return true;
  }

  if (message.type === 'GET_PHOTOS') {
    initReady.then(() => getPhotos()).then(sendResponse).catch(error => sendResponse({ success: false, error: error.message }));
    return true;
  }

  if (message.type === 'GET_PHOTO_STORAGE_INFO') {
    initReady.then(() => getPhotoStorageInfo()).then(sendResponse);
    return true;
  }

  if (message.type === 'SET_PHOTO_LIMIT') {
    initReady.then(() => setPhotoLimit(message.limit)).then(sendResponse);
    return true;
  }

  if (message.type === 'CLEAR_PHOTOS') {
    initReady.then(clearAllPhotos).then(sendResponse).catch(err => sendResponse({ success: false, error: String(err) }));
    return true;
  }

  if (message.type === 'GET_REPORT_DATA') {
    (async () => {
      await initReady;
      const result = await mutateStorage(async () => {
        await readStats();
        return combinedAttempts();
      });
      const dailyCounts = result.dailyCounts || {};
      const photos = await getPhotos();

      const today = new Date();
      const dailyBreakdown = [];
      for (let i = 29; i >= 0; i--) {
        const d = new Date(today);
        d.setDate(d.getDate() - i);
        const key = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
        dailyBreakdown.push({ date: key, count: dailyCounts[key] || 0 });
      }

      const weeklySummaries = [];
      for (let w = 0; w < 4; w++) {
        let weekTotal = 0;
        for (let i = 0; i < 7; i++) {
          const d = new Date(today);
          d.setDate(d.getDate() - (w * 7 + i));
          const key = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
          weekTotal += dailyCounts[key] || 0;
        }
        weeklySummaries.push({ weekNumber: w + 1, total: weekTotal });
      }

      let worstDay = { date: 'N/A', count: 0 };
      for (const entry of dailyBreakdown) {
        if (entry.count > worstDay.count) worstDay = entry;
      }

      // Only count streaks from install date onward
      const installDate = result.installDate || dailyBreakdown[dailyBreakdown.length - 1].date;
      const activeDays = dailyBreakdown.filter(d => d.date >= installDate);

      let currentStreak = 0;
      for (let i = activeDays.length - 1; i >= 0; i--) {
        if (activeDays[i].count === 0) currentStreak++;
        else break;
      }

      let longestStreak = 0, tempStreak = 0;
      for (const entry of activeDays) {
        if (entry.count === 0) { tempStreak++; longestStreak = Math.max(longestStreak, tempStreak); }
        else tempStreak = 0;
      }

      sendResponse({
        allTimeCount: result.attemptCount || 0,
        todayCount: result.todayCount || 0,
        threeDayCount: sumLastNDays(dailyCounts, 3),
        sevenDayCount: sumLastNDays(dailyCounts, 7),
        thirtyDayCount: sumLastNDays(dailyCounts, 30),
        dailyBreakdown,
        weeklySummaries,
        worstDay,
        currentCleanStreak: currentStreak,
        longestCleanStreak: longestStreak,
        photoCount: photos.length
      });
    })().catch(error => sendResponse({ success: false, error: error.message }));
    return true;
  }

  if (message.type === 'GET_BLOCKED_SITES') {
    initReady.then(() => sendResponse(currentBlockedSites));
    return true;
  }

  if (message.type === 'ADD_BLOCKED_SITE') {
    initReady.then(() => addBlockedSite(message.site)).then(sendResponse).catch(error => sendResponse({ success: false, error: error.message }));
    return true;
  }

  if (message.type === 'REMOVE_BLOCKED_SITE') {
    initReady.then(() => removeBlockedSite(message.siteId, message.photoId)).then(sendResponse).catch(error => sendResponse({ success: false, error: error.message }));
    return true;
  }

  if (message.type === 'GET_AVAILABLE_PRESETS') {
    initReady.then(() => {
      const blockedIds = new Set(currentBlockedSites.map(s => s.id));
      sendResponse(DEFAULT_SITES.filter(s => !blockedIds.has(s.id)));
    });
    return true;
  }

  if (message.type === 'GET_TRACKED_SITES') {
    initReady.then(() => sendResponse(currentTrackedSites));
    return true;
  }

  if (message.type === 'ADD_TRACKED_SITE') {
    initReady.then(() => addTrackedSite(message.site)).then(sendResponse).catch(error => sendResponse({ success: false, error: error.message }));
    return true;
  }

  if (message.type === 'REMOVE_TRACKED_SITE') {
    initReady.then(() => removeTrackedSite(message.siteId)).then(sendResponse).catch(error => sendResponse({ success: false, error: error.message }));
    return true;
  }

  if (message.type === 'GET_TRACKING_DATA') {
    initReady.then(() => getTrackingDataForToday()).then(sendResponse).catch(error => sendResponse({ success: false, error: error.message }));
    return true;
  }

  if (message.type === 'GET_TRACKING_REPORT_DATA') {
    initReady.then(() => getTrackingReportData()).then(sendResponse).catch(error => sendResponse({ success: false, error: error.message }));
    return true;
  }

  if (message.type === 'GET_AVAILABLE_TRACKING_PRESETS') {
    initReady.then(() => {
      const trackedIds = new Set(currentTrackedSites.map(s => s.id));
      sendResponse(DEFAULT_TRACKED_SITES.filter(s => !trackedIds.has(s.id)));
    });
    return true;
  }

  if (message.type === 'GET_REMOVAL_LOG') {
    initReady.then(() => getRemovalLog()).then(sendResponse).catch(error => sendResponse({ success: false, error: error.message }));
    return true;
  }

  return false;
});

// Refresh cache when storage changes
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local') {
    if (changes.blockedSites) {
      // newValue is undefined when storage.local.clear() runs; fall back to defaults
      // so the in-memory cache stays usable. An explicit empty array means the user
      // removed all entries and is preserved as-is.
      currentBlockedSites = changes.blockedSites.newValue === undefined
        ? DEFAULT_SITES
        : changes.blockedSites.newValue.map(normalizeSite);
      initReady.then(syncBlockRules).catch(console.error);
    }
    if (changes.trackedSites) {
      currentTrackedSites = changes.trackedSites.newValue === undefined
        ? DEFAULT_TRACKED_SITES
        : changes.trackedSites.newValue.map(normalizeSite);
    }
    if (changes.photoLimit) {
      const n = Number(changes.photoLimit.newValue);
      if (Number.isFinite(n) && n >= MIN_PHOTO_LIMIT && n <= MAX_PHOTO_LIMIT) {
        currentPhotoLimit = Math.floor(n);
      } else { currentPhotoLimit = DEFAULT_PHOTO_LIMIT; }
      captureQueue(cleanupOldPhotos).catch(console.error);
    }
  }
});

// On install, seed default sites and open setup page
chrome.runtime.onInstalled.addListener(async (details) => {
  await initReady;
  if (details.reason === 'install') {
    await chrome.storage.local.set({ installDate: getTodayKey() });
    await chrome.tabs.create({
      url: chrome.runtime.getURL('setup/setup.html')
    });
  } else {
    // On update, load existing sites and sync rules
    await loadBlockedSites();
    await loadTrackedSites();
    await syncBlockRules();
  }
});

// Re-initialize on browser startup
chrome.runtime.onStartup.addListener(async () => {
  await initReady;
});

// Periodically verify block rules and flush tracking time
chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === RULE_CHECK_ALARM) {
    await initReady;
    await verifyBlockRules();
  }
  if (alarm.name === TRACKING_FLUSH_ALARM) {
    await initReady;
    await flushActiveTime();
  }
});

// Initialize on startup
async function initialize() {
  await loadBlockedSites();
  await loadTrackedSites();
  await loadPhotoLimit();
  const saved = await chrome.storage.local.get(['blockedSites', 'trackedSites']);
  if (saved.blockedSites === undefined) await chrome.storage.local.set({ blockedSites: currentBlockedSites });
  if (saved.trackedSites === undefined) await chrome.storage.local.set({ trackedSites: currentTrackedSites });
  await syncBlockRules();
  await openDatabase();

  const existing = await chrome.alarms.get(RULE_CHECK_ALARM);
  if (!existing) {
    chrome.alarms.create(RULE_CHECK_ALARM, { periodInMinutes: 3 });
  }

  const flushAlarm = await chrome.alarms.get(TRACKING_FLUSH_ALARM);
  if (!flushAlarm) {
    chrome.alarms.create(TRACKING_FLUSH_ALARM, { periodInMinutes: 1 });
  }

  // Session storage survives worker suspension, but clears on browser shutdown.
  const session = await chrome.storage.session.get(sessionKey);
  if (session[sessionKey]) activeTracking = session[sessionKey];
  const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  const window = tab ? await chrome.windows.get(tab.windowId).catch(() => null) : null;
  const site = tab && window && window.focused ? getMatchingTrackedSite(tab.url || '') : null;
  if (!site || activeTracking.tabId !== tab.id || activeTracking.siteId !== site.id) {
    await setActiveTracking(site ? tab : null);
  }

}

const initReady = initialize();
