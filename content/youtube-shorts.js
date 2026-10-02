// Toggle CSS for existing and dynamically inserted Shorts elements.

function applyShortsSetting(sites) {
  const enabled = sites === undefined || sites.some(site => site.id === 'youtube-shorts');
  document.documentElement.classList.toggle('punishment-hide-shorts', enabled);
}
function initializeShorts() {
  chrome.storage.local.get('blockedSites').then(result => applyShortsSetting(result.blockedSites));
}
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && changes.blockedSites) applyShortsSetting(changes.blockedSites.newValue);
});
if (document.documentElement) initializeShorts();
else document.addEventListener('DOMContentLoaded', initializeShorts, { once: true });
