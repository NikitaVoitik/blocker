// Toggle CSS for existing and dynamically inserted Shorts elements.

// Elements that can only be identified by their label text (e.g. "Shorts" filter chips).
const SHORTS_LABEL_SELECTORS = 'yt-chip-cloud-chip-renderer, chip-shape, ytm-chip-cloud-chip-renderer';
let shortsObserver = null;

function tagShortsLabels(root) {
  root.querySelectorAll(SHORTS_LABEL_SELECTORS).forEach(el => {
    if (el.textContent.trim().toLowerCase() === 'shorts') el.setAttribute('data-punishment-shorts', '');
  });
}

function applyShortsSetting(sites) {
  const enabled = sites === undefined || sites.some(site => site.id === 'youtube-shorts');
  document.documentElement.classList.toggle('punishment-hide-shorts', enabled);

  if (enabled && !shortsObserver) {
    tagShortsLabels(document);
    let scheduled = false;
    shortsObserver = new MutationObserver(() => {
      if (scheduled) return;
      scheduled = true;
      requestAnimationFrame(() => { scheduled = false; tagShortsLabels(document); });
    });
    shortsObserver.observe(document.documentElement, { childList: true, subtree: true });
  } else if (!enabled && shortsObserver) {
    shortsObserver.disconnect();
    shortsObserver = null;
  }
}
function initializeShorts() {
  chrome.storage.local.get('blockedSites').then(result => applyShortsSetting(result.blockedSites));
}
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && changes.blockedSites) applyShortsSetting(changes.blockedSites.newValue);
});
if (document.documentElement) initializeShorts();
else document.addEventListener('DOMContentLoaded', initializeShorts, { once: true });
