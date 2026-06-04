// Remove YouTube Shorts elements that load dynamically (YouTube is an SPA)

const SHORTS_SELECTORS = [
  'ytd-rich-shelf-renderer[is-shorts]',
  'ytd-reel-shelf-renderer',
  'ytd-rich-section-renderer:has(ytd-rich-shelf-renderer[is-shorts])',
  'ytd-video-renderer:has(ytd-thumbnail-overlay-time-status-renderer[overlay-style="SHORTS"])',
  'ytd-guide-entry-renderer:has(a[href="/shorts"])',
  'ytd-mini-guide-entry-renderer:has(a[href="/shorts"])',
  'ytd-rich-item-renderer:has(ytd-thumbnail-overlay-time-status-renderer[overlay-style="SHORTS"])',
  'ytd-compact-video-renderer:has(ytd-thumbnail-overlay-time-status-renderer[overlay-style="SHORTS"])',
  'ytd-grid-video-renderer:has(ytd-thumbnail-overlay-time-status-renderer[overlay-style="SHORTS"])',
];

const COMBINED_SELECTOR = SHORTS_SELECTORS.join(', ');

function removeShorts() {
  const elements = document.querySelectorAll(COMBINED_SELECTOR);
  for (const el of elements) {
    el.style.display = 'none';
  }
}

// Run on initial load
removeShorts();

// Observe DOM changes for dynamically loaded content
const observer = new MutationObserver(removeShorts);
observer.observe(document.documentElement, {
  childList: true,
  subtree: true,
});
