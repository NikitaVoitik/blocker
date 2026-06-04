// Service Worker - Coordinates capture, storage, and messaging

const OFFSCREEN_DOCUMENT_PATH = 'offscreen/offscreen.html';
const RULE_CHECK_ALARM = 'verify-block-rules';
const TRACKING_FLUSH_ALARM = 'flush-tracking-time';

// Daily usage limits. Limit-block dynamic rules live in a dedicated ID range so
// they never collide with the block rules (which start at 1000).
const LIMIT_RULE_ID_BASE = 100000;
const MIN_SITE_LIMIT_SECONDS = 60; // 1 minute
const MAX_SITE_LIMIT_SECONDS = 86400; // 24 hours

const DEFAULT_SITES = [
  {
    id: 'twitter',
    label: 'Twitter / X',
    domains: [
      'twitter.com',
      'x.com',
      'www.twitter.com',
      'www.x.com',
      'mobile.twitter.com',
      'mobile.x.com',
    ],
    builtin: true,
  },
  {
    id: 'youtube-shorts',
    label: 'YouTube Shorts',
    domains: ['youtube.com/shorts', 'www.youtube.com/shorts', 'm.youtube.com/shorts'],
    pathOnly: true,
    builtin: true,
  },
];

const DEFAULT_TRACKED_SITES = [
  {
    id: 'instagram',
    label: 'Instagram',
    domains: ['instagram.com', 'www.instagram.com'],
    builtin: true,
  },
  {
    id: 'facebook',
    label: 'Facebook',
    domains: ['facebook.com', 'www.facebook.com', 'web.facebook.com', 'm.facebook.com'],
    builtin: true,
  },
  {
    id: 'tiktok',
    label: 'TikTok',
    domains: ['tiktok.com', 'www.tiktok.com'],
    builtin: true,
  },
  {
    id: 'reddit',
    label: 'Reddit',
    domains: ['reddit.com', 'www.reddit.com', 'old.reddit.com'],
    builtin: true,
  },
  {
    id: 'twitter',
    label: 'Twitter / X',
    domains: [
      'twitter.com',
      'x.com',
      'www.twitter.com',
      'www.x.com',
      'mobile.twitter.com',
      'mobile.x.com',
    ],
    builtin: true,
  },
  {
    id: 'youtube',
    label: 'YouTube',
    domains: ['youtube.com', 'www.youtube.com', 'm.youtube.com'],
    builtin: true,
  },
  {
    id: 'snapchat',
    label: 'Snapchat',
    domains: ['snapchat.com', 'www.snapchat.com', 'web.snapchat.com'],
    builtin: true,
  },
  {
    id: 'linkedin',
    label: 'LinkedIn',
    domains: ['linkedin.com', 'www.linkedin.com'],
    builtin: true,
  },
  {
    id: 'pinterest',
    label: 'Pinterest',
    domains: ['pinterest.com', 'www.pinterest.com'],
    builtin: true,
  },
  {
    id: 'tumblr',
    label: 'Tumblr',
    domains: ['tumblr.com', 'www.tumblr.com'],
    builtin: true,
  },
];

// Runtime cache of blocked sites
let currentBlockedSites = [];

// Runtime cache of tracked sites
let currentTrackedSites = [];

// Active time tracking state
let activeTracking = { tabId: null, siteId: null, startTime: null };

// Tracked-site IDs currently over their daily limit (rebuilt by syncLimitRules).
// Used as an in-memory backup check on navigation without a storage round-trip.
let overLimitSiteIds = new Set();

// Load blocked sites from storage
async function loadBlockedSites() {
  const result = await chrome.storage.local.get('blockedSites');
  currentBlockedSites = result.blockedSites || DEFAULT_SITES;
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
  currentTrackedSites = result.trackedSites || DEFAULT_TRACKED_SITES;
  return currentTrackedSites;
}

// Save tracked sites to storage
async function saveTrackedSites(sites) {
  currentTrackedSites = sites;
  await chrome.storage.local.set({ trackedSites: sites });
}

// Restrictions configured with a daily limit (mode:'limit' entries on the blocked list).
function getLimitSites() {
  return currentBlockedSites.filter((s) => s.mode === 'limit' && Number(s.dailyLimitSeconds) > 0);
}

// Effective set of time-tracked sites: analytics-only tracked sites PLUS limit-mode
// restrictions (which must be tracked to enforce their cap), de-duped by id.
function getEffectiveTrackedSites() {
  const byId = new Map();
  for (const s of currentTrackedSites) byId.set(s.id, s);
  for (const s of getLimitSites()) if (!byId.has(s.id)) byId.set(s.id, s);
  return [...byId.values()];
}

// True when a parsed URL matches a site entry (handles pathOnly entries like youtube-shorts).
function urlMatchesSite(parsed, site) {
  if (site.pathOnly) {
    for (const domain of site.domains) {
      const [host, ...pathParts] = domain.split('/');
      const path = `/${pathParts.join('/')}`;
      if (parsed.hostname === host && parsed.pathname.startsWith(path)) return true;
    }
    return false;
  }
  return site.domains.includes(parsed.hostname);
}

// Check if a URL matches any time-tracked site (analytics or limit-mode restriction).
// pathOnly entries (e.g. youtube.com/shorts) are more specific than a host-only entry for the
// same host (e.g. youtube.com), so they must win — otherwise a /shorts visit would accrue to
// the host-only site and a Shorts limit would never fill.
function getMatchingTrackedSite(url) {
  try {
    const parsed = new URL(url);
    const sites = getEffectiveTrackedSites();
    for (const site of sites) if (site.pathOnly && urlMatchesSite(parsed, site)) return site;
    for (const site of sites) if (!site.pathOnly && urlMatchesSite(parsed, site)) return site;
  } catch (_e) {
    // Invalid URL
  }
  return null;
}

// Serialize all dynamic-rule updates. syncBlockRules and syncLimitRules both call
// chrome.declarativeNetRequest.updateDynamicRules; running them concurrently can clobber
// each other (read-modify-write on a shared rule set), so funnel both through one chain.
let ruleUpdateChain = Promise.resolve();
function withRuleLock(task) {
  const run = ruleUpdateChain.then(task, task);
  ruleUpdateChain = run.then(
    () => {},
    () => {},
  );
  return run;
}

// Generate dynamic declarativeNetRequest rules from blocked sites
function syncBlockRules() {
  return withRuleLock(_syncBlockRules);
}

async function _syncBlockRules() {
  const sites = currentBlockedSites;
  const rules = [];
  let ruleId = 1000; // Start high to avoid conflicts with static rules

  for (const site of sites) {
    // Limit-mode restrictions are blocked only once over their cap (via limit rules), not always.
    if (site.mode === 'limit') continue;
    for (const domain of site.domains) {
      rules.push({
        id: ruleId++,
        priority: 1,
        action: {
          type: 'redirect',
          redirect: {
            extensionPath: `/blocked/blocked.html?site=${encodeURIComponent(site.id)}`,
          },
        },
        condition: {
          urlFilter: `||${domain}`,
          resourceTypes: ['main_frame'],
        },
      });
    }
  }

  // Remove only existing block-range rules; leave limit rules (>= LIMIT_RULE_ID_BASE) intact
  const existingRules = await chrome.declarativeNetRequest.getDynamicRules();
  const removeRuleIds = existingRules.filter((r) => r.id < LIMIT_RULE_ID_BASE).map((r) => r.id);

  try {
    await chrome.declarativeNetRequest.updateDynamicRules({
      removeRuleIds,
      addRules: rules,
    });
  } catch (err) {
    console.error('[SiteBlocker] Failed to update rules, retrying...', err);
    await new Promise((resolve) => setTimeout(resolve, 500));
    try {
      const retryExisting = await chrome.declarativeNetRequest.getDynamicRules();
      const retryRemoveIds = retryExisting
        .filter((r) => r.id < LIMIT_RULE_ID_BASE)
        .map((r) => r.id);
      await chrome.declarativeNetRequest.updateDynamicRules({
        removeRuleIds: retryRemoveIds,
        addRules: rules,
      });
    } catch (retryErr) {
      console.error('[SiteBlocker] Retry also failed:', retryErr);
    }
  }
}

// Verify that block-range dynamic rules match expected count; re-sync if mismatched
async function verifyBlockRules() {
  const expectedCount = currentBlockedSites
    .filter((s) => s.mode !== 'limit')
    .reduce((sum, site) => sum + site.domains.length, 0);
  const existingRules = await chrome.declarativeNetRequest.getDynamicRules();
  const blockRules = existingRules.filter((r) => r.id < LIMIT_RULE_ID_BASE);
  if (blockRules.length !== expectedCount) {
    console.warn(
      `[SiteBlocker] Rule mismatch: expected ${expectedCount}, found ${blockRules.length}. Re-syncing...`,
    );
    await syncBlockRules();
  }
}

// --- Daily usage limits ---

// Full URL of the limit-block page for a site (used for active-tab redirects).
function limitBlockUrl(siteId) {
  return chrome.runtime.getURL(
    `blocked/blocked.html?site=${encodeURIComponent(siteId)}&reason=limit`,
  );
}

// Today's tracked seconds for a site, read from a trackingData object.
function getSiteTimeToday(data, siteId) {
  return data.time?.[`${siteId}:${getTodayKey()}`] || 0;
}

// Limit-mode restrictions that have reached their daily cap today.
async function getOverLimitSites() {
  const result = await chrome.storage.local.get('trackingData');
  const data = result.trackingData || { visits: {}, time: {} };
  return getLimitSites().filter(
    (site) => getSiteTimeToday(data, site.id) >= Number(site.dailyLimitSeconds),
  );
}

// Generate dynamic rules that redirect over-limit tracked sites to the limit block page.
// Only touches the limit ID range so block rules are untouched.
function syncLimitRules() {
  return withRuleLock(_syncLimitRules);
}

async function _syncLimitRules() {
  const overSites = await getOverLimitSites();
  overLimitSiteIds = new Set(overSites.map((s) => s.id));

  const rules = [];
  let ruleId = LIMIT_RULE_ID_BASE;
  for (const site of overSites) {
    for (const domain of site.domains) {
      rules.push({
        id: ruleId++,
        priority: 1,
        action: {
          type: 'redirect',
          redirect: {
            extensionPath: `/blocked/blocked.html?site=${encodeURIComponent(site.id)}&reason=limit`,
          },
        },
        condition: {
          urlFilter: `||${domain}`,
          resourceTypes: ['main_frame'],
        },
      });
    }
  }

  const existingRules = await chrome.declarativeNetRequest.getDynamicRules();
  const removeRuleIds = existingRules.filter((r) => r.id >= LIMIT_RULE_ID_BASE).map((r) => r.id);

  try {
    await chrome.declarativeNetRequest.updateDynamicRules({ removeRuleIds, addRules: rules });
  } catch (err) {
    console.error('[SiteBlocker] Failed to update limit rules, retrying...', err);
    await new Promise((resolve) => setTimeout(resolve, 500));
    try {
      const retryExisting = await chrome.declarativeNetRequest.getDynamicRules();
      const retryRemoveIds = retryExisting
        .filter((r) => r.id >= LIMIT_RULE_ID_BASE)
        .map((r) => r.id);
      await chrome.declarativeNetRequest.updateDynamicRules({
        removeRuleIds: retryRemoveIds,
        addRules: rules,
      });
    } catch (retryErr) {
      console.error('[SiteBlocker] Limit rule retry also failed:', retryErr);
    }
  }
}

// In-memory check: return the over-limit restriction matching a URL, if any.
function getMatchingOverLimitSite(url) {
  try {
    const parsed = new URL(url);
    for (const site of getLimitSites()) {
      if (overLimitSiteIds.has(site.id) && urlMatchesSite(parsed, site)) {
        return site;
      }
    }
  } catch (_e) {
    // Invalid URL
  }
  return null;
}

// If a tracked site is already known to be over its limit, redirect its tab immediately.
// Cheap in-memory check (no storage/rule work) for the focus/navigation handlers, so a
// stale over-limit tab gets booted the instant it regains focus instead of on the next alarm.
async function bootIfOverLimit(tabId, site) {
  if (site && overLimitSiteIds.has(site.id)) {
    try {
      await chrome.tabs.update(tabId, { url: limitBlockUrl(site.id) });
    } catch (_e) {
      // tab may have closed
    }
    return true;
  }
  return false;
}

// Flush time, re-sync limit rules, and boot any open tabs now over their limit.
async function enforceLimits() {
  await flushActiveTime();
  await syncLimitRules();

  if (overLimitSiteIds.size > 0) {
    try {
      const tabs = await chrome.tabs.query({});
      for (const tab of tabs) {
        if (!tab.id || !tab.url) continue;
        const site = getMatchingOverLimitSite(tab.url);
        if (site) {
          await chrome.tabs.update(tab.id, { url: limitBlockUrl(site.id) });
          if (activeTracking.tabId === tab.id) {
            activeTracking = { tabId: tab.id, siteId: null, startTime: null };
          }
        }
      }
    } catch (_e) {
      // tab query/update can fail transiently (e.g. tab closed mid-iteration)
    }
  }

  return [...overLimitSiteIds];
}

// Replace an entry with the same id, or append it.
function upsertById(list, entry) {
  const out = list.filter((s) => s.id !== entry.id);
  out.push(entry);
  return out;
}

// Snapshot of every restriction (blocked-list entry) with its mode + live usage, for the popup.
async function getRestrictionSites() {
  const result = await chrome.storage.local.get('trackingData');
  const data = result.trackingData || { visits: {}, time: {} };
  return currentBlockedSites.map((s) => {
    const mode = s.mode === 'limit' ? 'limit' : 'always';
    const cap = mode === 'limit' ? Number(s.dailyLimitSeconds) || 0 : 0;
    const usage = mode === 'limit' ? getSiteTimeToday(data, s.id) : 0;
    return {
      id: s.id,
      label: s.label,
      domains: s.domains,
      builtin: !!s.builtin,
      pathOnly: !!s.pathOnly,
      mode,
      dailyLimitSeconds: cap,
      usageTodaySeconds: usage,
      overLimit: cap > 0 && usage >= cap,
    };
  });
}

// Set a site's restriction mode atomically. mode: 'off' (remove) | 'always' | 'limit'.
// A restricted site is owned by the blocked list; it's dropped from the analytics list to
// avoid a split source (limit-mode usage still surfaces via getEffectiveTrackedSites()).
async function setSiteRestriction(siteId, mode, dailyLimitSeconds) {
  const base =
    currentBlockedSites.find((s) => s.id === siteId) ||
    currentTrackedSites.find((s) => s.id === siteId);
  if (!base && mode !== 'off') {
    return { success: false, error: 'Unknown site' };
  }

  let blocked = [...currentBlockedSites];
  let tracked = [...currentTrackedSites];

  if (mode === 'off') {
    blocked = blocked.filter((s) => s.id !== siteId);
  } else if (mode === 'always') {
    blocked = upsertById(blocked, {
      id: base.id,
      label: base.label,
      domains: base.domains,
      builtin: !!base.builtin,
      pathOnly: !!base.pathOnly,
      mode: 'always',
    });
    tracked = tracked.filter((s) => s.id !== siteId);
  } else if (mode === 'limit') {
    const n = Math.floor(Number(dailyLimitSeconds));
    if (!Number.isFinite(n) || n < MIN_SITE_LIMIT_SECONDS || n > MAX_SITE_LIMIT_SECONDS) {
      return { success: false, error: 'Limit must be between 1 minute and 24 hours' };
    }
    blocked = upsertById(blocked, {
      id: base.id,
      label: base.label,
      domains: base.domains,
      builtin: !!base.builtin,
      pathOnly: !!base.pathOnly,
      mode: 'limit',
      dailyLimitSeconds: n,
    });
    tracked = tracked.filter((s) => s.id !== siteId);
  } else {
    return { success: false, error: 'Invalid mode' };
  }

  currentTrackedSites = tracked;
  await chrome.storage.local.set({ trackedSites: tracked });
  await saveBlockedSites(blocked); // updates cache + storage + syncBlockRules
  await enforceLimits();
  return { success: true, sites: blocked };
}

// One-time migration: older builds stored daily limits on trackedSites entries. Move them onto
// the blocked list as mode:'limit' restrictions. If the same id is already always-blocked, the
// always-block wins and the limit is discarded.
async function migrateTrackedLimits() {
  const withLimit = currentTrackedSites.filter((s) => Number(s.dailyLimitSeconds) > 0);
  if (withLimit.length === 0) return;

  const blocked = [...currentBlockedSites];
  const blockedIds = new Set(blocked.map((s) => s.id));
  const promotedIds = new Set();
  for (const t of withLimit) {
    if (!blockedIds.has(t.id)) {
      blocked.push({
        id: t.id,
        label: t.label,
        domains: t.domains,
        builtin: !!t.builtin,
        pathOnly: !!t.pathOnly,
        mode: 'limit',
        dailyLimitSeconds: Math.floor(Number(t.dailyLimitSeconds)),
      });
      blockedIds.add(t.id);
      promotedIds.add(t.id);
    }
    // else: an always-block already owns this id → discard the limit but keep analytics history.
  }
  // Only drop entries that actually became restrictions; for the rest just strip the stale
  // dailyLimitSeconds so they stay in analytics (and migration is idempotent on the next run).
  const tracked = currentTrackedSites
    .filter((s) => !promotedIds.has(s.id))
    .map((s) => {
      if (Number(s.dailyLimitSeconds) > 0) {
        const copy = { ...s };
        delete copy.dailyLimitSeconds;
        return copy;
      }
      return s;
    });

  currentBlockedSites = blocked;
  currentTrackedSites = tracked;
  await chrome.storage.local.set({ blockedSites: blocked, trackedSites: tracked });
}

// Check if a URL matches an always-block site (limit-mode entries are not blocked here)
function getMatchingSite(url) {
  try {
    const parsed = new URL(url);
    for (const site of currentBlockedSites) {
      if (site.mode === 'limit') continue;
      if (urlMatchesSite(parsed, site)) return site;
    }
  } catch (_e) {
    // Invalid URL
  }
  return null;
}

// Block sites via webNavigation API (backup for declarativeNetRequest)
chrome.webNavigation.onBeforeNavigate.addListener(async (details) => {
  if (details.frameId !== 0) return;

  await initReady;

  const site = getMatchingSite(details.url);
  if (site) {
    await chrome.tabs.update(details.tabId, {
      url: chrome.runtime.getURL(`blocked/blocked.html?site=${encodeURIComponent(site.id)}`),
    });
    return;
  }

  // Backup for daily-limit blocks (primary path is the dynamic limit rules)
  const limited = getMatchingOverLimitSite(details.url);
  if (limited) {
    await chrome.tabs.update(details.tabId, { url: limitBlockUrl(limited.id) });
  }
});

// Track visits via webNavigation.onCompleted (only fires for pages that fully loaded)
chrome.webNavigation.onCompleted.addListener(async (details) => {
  if (details.frameId !== 0) return;
  await initReady;
  const site = getMatchingTrackedSite(details.url);
  if (site) {
    await incrementVisit(site.id);
  }
});

// Track time via tab focus changes
chrome.tabs.onActivated.addListener(async (activeInfo) => {
  await initReady;
  await flushActiveTime();

  try {
    const tab = await chrome.tabs.get(activeInfo.tabId);
    const site = tab.url ? getMatchingTrackedSite(tab.url) : null;
    if (site && (await bootIfOverLimit(activeInfo.tabId, site))) {
      activeTracking = { tabId: activeInfo.tabId, siteId: null, startTime: null };
    } else if (site) {
      activeTracking = { tabId: activeInfo.tabId, siteId: site.id, startTime: Date.now() };
    } else {
      activeTracking = { tabId: activeInfo.tabId, siteId: null, startTime: null };
    }
  } catch (_e) {
    activeTracking = { tabId: null, siteId: null, startTime: null };
  }
});

// Track time via window focus changes
chrome.windows.onFocusChanged.addListener(async (windowId) => {
  await initReady;
  if (windowId === chrome.windows.WINDOW_ID_NONE) {
    await flushActiveTime();
    activeTracking = { tabId: null, siteId: null, startTime: null };
  } else {
    try {
      const [tab] = await chrome.tabs.query({ active: true, windowId });
      await flushActiveTime();
      if (tab?.url) {
        const site = getMatchingTrackedSite(tab.url);
        if (site && (await bootIfOverLimit(tab.id, site))) {
          activeTracking = { tabId: tab.id, siteId: null, startTime: null };
        } else if (site) {
          activeTracking = { tabId: tab.id, siteId: site.id, startTime: Date.now() };
        } else {
          activeTracking = { tabId: tab.id, siteId: null, startTime: null };
        }
      } else {
        activeTracking = { tabId: null, siteId: null, startTime: null };
      }
    } catch (_e) {
      activeTracking = { tabId: null, siteId: null, startTime: null };
    }
  }
});

// Track URL changes within the active tab (SPA navigation)
chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, _tab) => {
  if (changeInfo.url && tabId === activeTracking.tabId) {
    await initReady;
    await flushActiveTime();
    const site = getMatchingTrackedSite(changeInfo.url);
    if (site && (await bootIfOverLimit(tabId, site))) {
      activeTracking = { tabId, siteId: null, startTime: null };
    } else if (site) {
      activeTracking = { tabId, siteId: site.id, startTime: Date.now() };
    } else {
      activeTracking = { tabId, siteId: null, startTime: null };
    }
  }
});

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

async function setPhotoLimit(value) {
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
          autoIncrement: true,
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
      timestamp: Date.now(),
    };

    const request = store.add(photo);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);

    // Cleanup old photos after adding
    transaction.oncomplete = () => cleanupOldPhotos();
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

  return new Promise((resolve) => {
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
        toDelete.forEach((key) => {
          store.delete(key);
        });
        resolve();
      }
    };

    request.onerror = () => resolve();
  });
}

// Clear every photo from storage
async function clearAllPhotos() {
  const database = await openDatabase();

  return new Promise((resolve, reject) => {
    const transaction = database.transaction([PHOTOS_STORE], 'readwrite');
    const store = transaction.objectStore(PHOTOS_STORE);
    const request = store.clear();
    request.onsuccess = () => resolve({ success: true });
    request.onerror = () => reject(request.error);
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
      bytes += Math.floor((payloadLen * 3) / 4);
    }
  }
  return {
    count: photos.length,
    bytes,
    limit: currentPhotoLimit,
    minLimit: MIN_PHOTO_LIMIT,
    maxLimit: MAX_PHOTO_LIMIT,
  };
}

// Get today's date key in YYYY-MM-DD format
function getTodayKey() {
  const d = new Date();
  return (
    d.getFullYear() +
    '-' +
    String(d.getMonth() + 1).padStart(2, '0') +
    '-' +
    String(d.getDate()).padStart(2, '0')
  );
}

// Sum dailyCounts for the last n calendar days
function sumLastNDays(dailyCounts, n) {
  const today = new Date();
  let total = 0;
  for (let i = 0; i < n; i++) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const key =
      d.getFullYear() +
      '-' +
      String(d.getMonth() + 1).padStart(2, '0') +
      '-' +
      String(d.getDate()).padStart(2, '0');
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
    validKeys.add(
      d.getFullYear() +
        '-' +
        String(d.getMonth() + 1).padStart(2, '0') +
        '-' +
        String(d.getDate()).padStart(2, '0'),
    );
  }
  const pruned = {};
  for (const key of Object.keys(dailyCounts)) {
    if (validKeys.has(key)) pruned[key] = dailyCounts[key];
  }
  return pruned;
}

// Increment visit count for a tracked site
async function incrementVisit(siteId) {
  const result = await chrome.storage.local.get('trackingData');
  const data = result.trackingData || { visits: {}, time: {} };
  const key = `${siteId}:${getTodayKey()}`;
  data.visits[key] = (data.visits[key] || 0) + 1;
  pruneTrackingData(data);
  await chrome.storage.local.set({ trackingData: data });
}

// Flush accumulated active time to storage
async function flushActiveTime() {
  if (!activeTracking.siteId || !activeTracking.startTime) return;

  const elapsed = Math.round((Date.now() - activeTracking.startTime) / 1000);
  if (elapsed < 1) return;

  const cappedElapsed = Math.min(elapsed, 1800);

  const result = await chrome.storage.local.get('trackingData');
  const data = result.trackingData || { visits: {}, time: {} };
  const key = `${activeTracking.siteId}:${getTodayKey()}`;
  data.time[key] = (data.time[key] || 0) + cappedElapsed;
  await chrome.storage.local.set({ trackingData: data });

  activeTracking.startTime = Date.now();
}

// Prune tracking data entries older than 30 days
function pruneTrackingData(data) {
  const today = new Date();
  const validKeys = new Set();
  for (let i = 0; i < 30; i++) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    validKeys.add(
      d.getFullYear() +
        '-' +
        String(d.getMonth() + 1).padStart(2, '0') +
        '-' +
        String(d.getDate()).padStart(2, '0'),
    );
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
  const result = await chrome.storage.local.get('trackingData');
  const data = result.trackingData || { visits: {}, time: {} };
  const todayKey = getTodayKey();
  const sites = {};
  for (const site of getEffectiveTrackedSites()) {
    const vKey = `${site.id}:${todayKey}`;
    const tKey = `${site.id}:${todayKey}`;
    sites[site.id] = {
      visits: data.visits[vKey] || 0,
      time: data.time[tKey] || 0,
    };
  }
  return sites;
}

// Get full tracking report data (30-day breakdown)
async function getTrackingReportData() {
  await flushActiveTime();
  const result = await chrome.storage.local.get('trackingData');
  const data = result.trackingData || { visits: {}, time: {} };
  const today = new Date();
  const _todayKey = getTodayKey();

  // Daily totals (all sites combined)
  const dailyBreakdown = [];
  for (let i = 29; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const dateKey =
      d.getFullYear() +
      '-' +
      String(d.getMonth() + 1).padStart(2, '0') +
      '-' +
      String(d.getDate()).padStart(2, '0');
    let dayTime = 0;
    let dayVisits = 0;
    for (const site of getEffectiveTrackedSites()) {
      dayTime += data.time[`${site.id}:${dateKey}`] || 0;
      dayVisits += data.visits[`${site.id}:${dateKey}`] || 0;
    }
    dailyBreakdown.push({ date: dateKey, time: dayTime, visits: dayVisits });
  }

  // Per-site totals for today, this week, and this month
  const siteBreakdownToday = [];
  const siteBreakdownWeek = [];
  const siteBreakdownMonth = [];
  for (const site of getEffectiveTrackedSites()) {
    let todaySiteTime = 0;
    let todaySiteVisits = 0;
    let weekSiteTime = 0;
    let weekSiteVisits = 0;
    let monthSiteTime = 0;
    let monthSiteVisits = 0;
    for (let i = 0; i < 30; i++) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      const dateKey =
        d.getFullYear() +
        '-' +
        String(d.getMonth() + 1).padStart(2, '0') +
        '-' +
        String(d.getDate()).padStart(2, '0');
      const t = data.time[`${site.id}:${dateKey}`] || 0;
      const v = data.visits[`${site.id}:${dateKey}`] || 0;
      if (i === 0) {
        todaySiteTime = t;
        todaySiteVisits = v;
      }
      if (i < 7) {
        weekSiteTime += t;
        weekSiteVisits += v;
      }
      monthSiteTime += t;
      monthSiteVisits += v;
    }
    siteBreakdownToday.push({
      id: site.id,
      label: site.label,
      visits: todaySiteVisits,
      time: todaySiteTime,
    });
    siteBreakdownWeek.push({
      id: site.id,
      label: site.label,
      visits: weekSiteVisits,
      time: weekSiteTime,
    });
    siteBreakdownMonth.push({
      id: site.id,
      label: site.label,
      visits: monthSiteVisits,
      time: monthSiteTime,
    });
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
      const dateKey =
        d.getFullYear() +
        '-' +
        String(d.getMonth() + 1).padStart(2, '0') +
        '-' +
        String(d.getDate()).padStart(2, '0');
      for (const site of getEffectiveTrackedSites()) {
        weekTime += data.time[`${site.id}:${dateKey}`] || 0;
        weekVisits += data.visits[`${site.id}:${dateKey}`] || 0;
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
  const daysWithActivity = dailyBreakdown.filter((d) => d.time > 0).length;
  const avgDailyTime = daysWithActivity > 0 ? Math.round(monthTime / daysWithActivity) : 0;
  const mostTimeSite =
    siteBreakdownMonth[0] && siteBreakdownMonth[0].time > 0 ? siteBreakdownMonth[0] : null;
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
    worstDay,
  };
}

// Add a tracked site
async function addTrackedSite(siteEntry) {
  const sites = [...currentTrackedSites];
  if (sites.some((s) => s.id === siteEntry.id)) {
    return { success: false, error: 'Site already tracked' };
  }
  sites.push(siteEntry);
  await saveTrackedSites(sites);
  return { success: true, sites };
}

// Remove a tracked site
async function removeTrackedSite(siteId) {
  const sites = currentTrackedSites.filter((s) => s.id !== siteId);
  await saveTrackedSites(sites);
  // Drop any limit rule the removed site may have had so it doesn't stay blocked.
  await syncLimitRules();
  return { success: true, sites };
}

// Get/update attempt stats
async function getStats() {
  const result = await chrome.storage.local.get([
    'attemptCount',
    'todayDate',
    'todayCount',
    'dailyCounts',
  ]);

  const today = new Date().toDateString();
  let todayCount = result.todayCount || 0;

  // Reset today count if it's a new day
  if (result.todayDate !== today) {
    todayCount = 0;
    await chrome.storage.local.set({ todayDate: today, todayCount: 0 });
  }

  const dailyCounts = result.dailyCounts || {};

  // Migrate: if dailyCounts was never written, seed today's entry from todayCount
  const todayKey = getTodayKey();
  if (Object.keys(dailyCounts).length === 0 && todayCount > 0) {
    dailyCounts[todayKey] = todayCount;
    await chrome.storage.local.set({ dailyCounts });
  }

  const threeDayCount = sumLastThreeDays(dailyCounts);

  return {
    allTimeCount: result.attemptCount || 0,
    todayCount: todayCount,
    threeDayCount: threeDayCount,
  };
}

async function incrementAttempt() {
  const result = await chrome.storage.local.get([
    'attemptCount',
    'todayDate',
    'todayCount',
    'dailyCounts',
  ]);

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

  await chrome.storage.local.set({
    attemptCount: newAllTime,
    todayDate: today,
    todayCount: newToday,
    dailyCounts: dailyCounts,
  });

  return {
    allTimeCount: newAllTime,
    todayCount: newToday,
    threeDayCount: sumLastThreeDays(dailyCounts),
  };
}

// Check if offscreen document exists
async function hasOffscreenDocument() {
  const contexts = await chrome.runtime.getContexts({
    contextTypes: ['OFFSCREEN_DOCUMENT'],
    documentUrls: [chrome.runtime.getURL(OFFSCREEN_DOCUMENT_PATH)],
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
    justification: 'Capture webcam photo for shame display',
  });
}

// Close offscreen document
async function closeOffscreenDocument() {
  if (await hasOffscreenDocument()) {
    try {
      await chrome.runtime.sendMessage({ type: 'CLEANUP' });
    } catch (_e) {
      // Document may already be unresponsive
    }
    await chrome.offscreen.closeDocument();
  }
}

// Capture photo via offscreen document
async function capturePhoto() {
  try {
    await createOffscreenDocument();

    // Small delay to ensure document is ready
    await new Promise((resolve) => setTimeout(resolve, 200));

    const response = await chrome.runtime.sendMessage({ type: 'CAPTURE_PHOTO' });

    if (response?.success) {
      // Save photo and increment attempt
      await savePhoto(response.data);
      await incrementAttempt();
      await closeOffscreenDocument();

      return response;
    }

    await closeOffscreenDocument();
    return { success: false, error: 'Capture failed' };
  } catch (error) {
    console.error('Capture error:', error);
    await closeOffscreenDocument();
    return { success: false, error: error.message };
  }
}

// Add a blocked/limited site. siteEntry may carry mode:'limit' + dailyLimitSeconds.
async function addBlockedSite(siteEntry) {
  const sites = [...currentBlockedSites];

  // Check for duplicate
  if (sites.some((s) => s.id === siteEntry.id)) {
    return { success: false, error: 'Site already blocked' };
  }

  sites.push(siteEntry);
  // A new restriction also shouldn't stay in the analytics list under the same id.
  const tracked = currentTrackedSites.filter((s) => s.id !== siteEntry.id);
  if (tracked.length !== currentTrackedSites.length) {
    currentTrackedSites = tracked;
    await chrome.storage.local.set({ trackedSites: tracked });
  }
  await saveBlockedSites(sites);
  await enforceLimits(); // evaluate immediately if it was added as a limit restriction
  return { success: true, sites };
}

// Remove a blocked/limited site (also drops any limit rule it had).
async function removeBlockedSite(siteId) {
  const sites = currentBlockedSites.filter((s) => s.id !== siteId);
  await saveBlockedSites(sites);
  await enforceLimits();
  return { success: true, sites };
}

async function logRemoval(siteId, siteLabel, photoId) {
  const result = await chrome.storage.local.get('removalLog');
  const log = result.removalLog || [];
  log.push({
    siteId,
    siteLabel,
    timestamp: Date.now(),
    photoId: photoId || null,
  });
  await chrome.storage.local.set({ removalLog: log });
}

async function getRemovalLog() {
  const result = await chrome.storage.local.get('removalLog');
  return result.removalLog || [];
}

// Handle messages from content scripts and popup
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  // Ignore messages from offscreen document (it handles CAPTURE_PHOTO internally)
  if (sender.url?.includes('offscreen/offscreen.html')) {
    return false;
  }

  if (message.type === 'CAPTURE_PHOTO') {
    capturePhoto().then(sendResponse);
    return true; // Async response
  }

  if (message.type === 'GET_STATS') {
    getStats().then(sendResponse);
    return true;
  }

  if (message.type === 'GET_PHOTOS') {
    getPhotos().then(sendResponse);
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
    clearAllPhotos()
      .then(sendResponse)
      .catch((err) => sendResponse({ success: false, error: String(err) }));
    return true;
  }

  if (message.type === 'GET_REPORT_DATA') {
    (async () => {
      const result = await chrome.storage.local.get([
        'attemptCount',
        'todayDate',
        'todayCount',
        'dailyCounts',
        'installDate',
      ]);
      const dailyCounts = result.dailyCounts || {};
      const photos = await getPhotos();

      const today = new Date();
      const dailyBreakdown = [];
      for (let i = 29; i >= 0; i--) {
        const d = new Date(today);
        d.setDate(d.getDate() - i);
        const key =
          d.getFullYear() +
          '-' +
          String(d.getMonth() + 1).padStart(2, '0') +
          '-' +
          String(d.getDate()).padStart(2, '0');
        dailyBreakdown.push({ date: key, count: dailyCounts[key] || 0 });
      }

      const weeklySummaries = [];
      for (let w = 0; w < 4; w++) {
        let weekTotal = 0;
        for (let i = 0; i < 7; i++) {
          const d = new Date(today);
          d.setDate(d.getDate() - (w * 7 + i));
          const key =
            d.getFullYear() +
            '-' +
            String(d.getMonth() + 1).padStart(2, '0') +
            '-' +
            String(d.getDate()).padStart(2, '0');
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
      const activeDays = dailyBreakdown.filter((d) => d.date >= installDate);

      let currentStreak = 0;
      for (let i = activeDays.length - 1; i >= 0; i--) {
        if (activeDays[i].count === 0) currentStreak++;
        else break;
      }

      let longestStreak = 0;
      let tempStreak = 0;
      for (const entry of activeDays) {
        if (entry.count === 0) {
          tempStreak++;
          longestStreak = Math.max(longestStreak, tempStreak);
        } else tempStreak = 0;
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
        photoCount: photos.length,
      });
    })();
    return true;
  }

  if (message.type === 'GET_BLOCKED_SITES') {
    initReady.then(() => sendResponse(currentBlockedSites));
    return true;
  }

  if (message.type === 'ADD_BLOCKED_SITE') {
    addBlockedSite(message.site).then(sendResponse);
    return true;
  }

  if (message.type === 'REMOVE_BLOCKED_SITE') {
    removeBlockedSite(message.siteId).then(sendResponse);
    return true;
  }

  if (message.type === 'GET_AVAILABLE_PRESETS') {
    initReady.then(() => {
      const blockedIds = new Set(currentBlockedSites.map((s) => s.id));
      sendResponse(DEFAULT_SITES.filter((s) => !blockedIds.has(s.id)));
    });
    return true;
  }

  if (message.type === 'GET_TRACKED_SITES') {
    initReady.then(() => sendResponse(currentTrackedSites));
    return true;
  }

  // Effective tracked set for analytics (tracked sites + limit-mode restrictions)
  if (message.type === 'GET_ANALYTICS_SITES') {
    initReady.then(() => sendResponse(getEffectiveTrackedSites()));
    return true;
  }

  // All restrictions (blocked list) with mode + live usage, for the Blocker tab
  if (message.type === 'GET_RESTRICTION_SITES') {
    initReady.then(() => getRestrictionSites()).then(sendResponse);
    return true;
  }

  if (message.type === 'ADD_TRACKED_SITE') {
    addTrackedSite(message.site).then(sendResponse);
    return true;
  }

  if (message.type === 'REMOVE_TRACKED_SITE') {
    removeTrackedSite(message.siteId).then(sendResponse);
    return true;
  }

  if (message.type === 'SET_SITE_RESTRICTION') {
    initReady
      .then(() => setSiteRestriction(message.siteId, message.mode, message.dailyLimitSeconds))
      .then(sendResponse);
    return true;
  }

  if (message.type === 'CHECK_LIMITS') {
    initReady.then(() => enforceLimits()).then((overLimit) => sendResponse({ overLimit }));
    return true;
  }

  if (message.type === 'GET_TRACKING_DATA') {
    getTrackingDataForToday().then(sendResponse);
    return true;
  }

  if (message.type === 'GET_TRACKING_REPORT_DATA') {
    getTrackingReportData().then(sendResponse);
    return true;
  }

  if (message.type === 'GET_AVAILABLE_TRACKING_PRESETS') {
    initReady.then(() => {
      const trackedIds = new Set(currentTrackedSites.map((s) => s.id));
      sendResponse(DEFAULT_TRACKED_SITES.filter((s) => !trackedIds.has(s.id)));
    });
    return true;
  }

  if (message.type === 'LOG_REMOVAL') {
    logRemoval(message.siteId, message.siteLabel, message.photoId).then(() =>
      sendResponse({ success: true }),
    );
    return true;
  }

  if (message.type === 'GET_REMOVAL_LOG') {
    getRemovalLog().then(sendResponse);
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
      currentBlockedSites =
        changes.blockedSites.newValue === undefined ? DEFAULT_SITES : changes.blockedSites.newValue;
      // The blocked list drives both always-block rules and (via mode:'limit') limit rules, so
      // re-sync both whenever it changes — covers external writes / imports. withRuleLock
      // serializes these with any in-flight syncs.
      syncBlockRules();
      syncLimitRules();
    }
    if (changes.trackedSites) {
      currentTrackedSites =
        changes.trackedSites.newValue === undefined
          ? DEFAULT_TRACKED_SITES
          : changes.trackedSites.newValue;
    }
    if (changes.photoLimit) {
      const n = Number(changes.photoLimit.newValue);
      if (Number.isFinite(n) && n >= MIN_PHOTO_LIMIT && n <= MAX_PHOTO_LIMIT) {
        currentPhotoLimit = Math.floor(n);
      }
    }
  }
});

// On install, seed default sites and open setup page
chrome.runtime.onInstalled.addListener(async (details) => {
  if (details.reason === 'install') {
    await chrome.storage.local.set({ installDate: getTodayKey() });
    await saveBlockedSites(DEFAULT_SITES);
    await saveTrackedSites(DEFAULT_TRACKED_SITES);
    await chrome.tabs.create({
      url: chrome.runtime.getURL('setup/setup.html'),
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
  await initialize();
});

// Periodically verify block rules and flush tracking time
chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === RULE_CHECK_ALARM) {
    await initReady;
    await verifyBlockRules();
  }
  if (alarm.name === TRACKING_FLUSH_ALARM) {
    await initReady;
    await enforceLimits();
  }
});

// Initialize on startup
async function initialize() {
  await openDatabase().catch(console.error);
  await loadBlockedSites();
  await loadTrackedSites();
  await loadPhotoLimit();
  await migrateTrackedLimits(); // move any legacy trackedSites limits onto the blocked list
  await syncBlockRules();
  await syncLimitRules();

  const existing = await chrome.alarms.get(RULE_CHECK_ALARM);
  if (!existing) {
    chrome.alarms.create(RULE_CHECK_ALARM, { periodInMinutes: 3 });
  }

  const flushAlarm = await chrome.alarms.get(TRACKING_FLUSH_ALARM);
  if (!flushAlarm) {
    chrome.alarms.create(TRACKING_FLUSH_ALARM, { periodInMinutes: 1 });
  }

  // Resume tracking for the currently active tab (handles service worker restarts)
  try {
    const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
    if (tab?.url) {
      const site = getMatchingTrackedSite(tab.url);
      if (site) {
        activeTracking = { tabId: tab.id, siteId: site.id, startTime: Date.now() };
      }
    }
  } catch (_e) {
    // Tab query can fail if no windows are focused
  }
}

const initReady = initialize();
