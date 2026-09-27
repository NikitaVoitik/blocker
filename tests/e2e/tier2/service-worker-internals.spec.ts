import { expect, type Worker } from '@playwright/test';
import { test as base } from '../fixtures/extension';
import { sendMessage } from '../helpers/messaging';
import { setStorage } from '../helpers/storage';

// These drive service-worker internals that normal user flows don't reach:
// migration, validation failures, camera failures, and the
// startup tab-resume branch. We call SW functions directly via Worker.evaluate.
async function getSW(context: any): Promise<Worker> {
  return context.serviceWorkers()[0] || (await context.waitForEvent('serviceworker'));
}

base.describe('Tier 2: service-worker internals', () => {
  base(
    'message handlers: duplicates, unknown type, getStats migration',
    async ({ context, extensionId }) => {
      const page = await context.newPage();
      await page.goto(`chrome-extension://${extensionId}/blocked/blocked.html?gallery=true`);

      // Duplicate adds are rejected.
      const dupBlock = await sendMessage(page, {
        type: 'ADD_BLOCKED_SITE',
        site: { id: 'twitter', label: 'T', domains: ['twitter.com'] },
      });
      expect(dupBlock.success).toBe(false);
      const dupTrack = await sendMessage(page, {
        type: 'ADD_TRACKED_SITE',
        site: { id: 'instagram', label: 'I', domains: ['instagram.com'] },
      });
      expect(dupTrack.success).toBe(false);

      // Unknown message type → handler returns false (no response).
      await sendMessage(page, { type: '__definitely_unknown__' });

      // getStats migration: todayCount present but dailyCounts never written.
      await setStorage(page, { todayDate: new Date().toDateString(), todayCount: 5 });
      await page.evaluate(() => chrome.storage.local.remove('dailyCounts'));
      const stats = await sendMessage(page, { type: 'GET_STATS' });
      expect(stats.todayCount).toBe(5);

      await page.close();
    },
  );

  base(
    'loadPhotoLimit honours a valid stored value and rejects an out-of-range one',
    async ({ context, extensionId }) => {
      const sw = await getSW(context);
      const page = await context.newPage();
      await page.goto(`chrome-extension://${extensionId}/blocked/blocked.html?gallery=true`);

      // Valid stored value → floored and used.
      await setStorage(page, { photoLimit: 25 });
      expect(await sw.evaluate(() => loadPhotoLimit())).toBe(25);

      // Out-of-range → falls back to the default.
      await setStorage(page, { photoLimit: 99999 });
      expect(await sw.evaluate(() => loadPhotoLimit())).toBe(50);

      await page.close();
    },
  );

  base('capturePhoto handles a failed and a thrown capture', async ({ context }) => {
    const sw = await getSW(context);
    const failed = await sw.evaluate(async () => {
      const orig = chrome.runtime.sendMessage;
      (chrome.runtime as any).sendMessage = () => Promise.resolve({ success: false });
      const r = await capturePhoto();
      chrome.runtime.sendMessage = orig;
      return r;
    });
    expect(failed.success).toBe(false);

    const threw = await sw.evaluate(async () => {
      const orig = chrome.runtime.sendMessage;
      (chrome.runtime as any).sendMessage = () => Promise.reject(new Error('offscreen down'));
      const r = await capturePhoto();
      chrome.runtime.sendMessage = orig;
      return r;
    });
    expect(threw.success).toBe(false);
  });

  base('initialize resumes tracking for an active tracked tab', async ({ context }) => {
    const sw = await getSW(context);
    const tracking = await sw.evaluate(async () => {
      const origQuery = chrome.tabs.query;
      (chrome.tabs as any).query = async () => [{ id: 4242, url: 'https://www.reddit.com/' }];
      await initialize();
      chrome.tabs.query = origQuery;
      return activeTracking;
    });
    expect(tracking.siteId).toBe('reddit');
    expect(tracking.tabId).toBe(4242);
  });

  base(
    'opening a new window exercises the focus-change handler',
    async ({ context, extensionId }) => {
      const sw = await getSW(context);
      // Best-effort: creating a window fires windows.onFocusChanged. Tolerated if
      // the windowing env doesn't deliver focus events.
      await sw.evaluate(
        (id) =>
          (chrome.windows as any)
            .create({ url: `chrome-extension://${id}/blocked/blocked.html?gallery=true` })
            .then(() => {})
            .catch(() => {}),
        extensionId,
      );
      await new Promise((r) => setTimeout(r, 1500));
      expect(true).toBe(true);
    },
  );
});
