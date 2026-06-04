import { expect, type Page, test } from '../fixtures/extension';
import { setStorage } from '../helpers/storage';

function todayKey(): string {
  const d = new Date();
  return (
    d.getFullYear() +
    '-' +
    String(d.getMonth() + 1).padStart(2, '0') +
    '-' +
    String(d.getDate()).padStart(2, '0')
  );
}

async function seedStats(page: Page, attempt: number, count: number): Promise<void> {
  await setStorage(page, {
    attemptCount: attempt,
    todayDate: new Date().toDateString(),
    todayCount: count,
    dailyCounts: { [todayKey()]: count },
  });
}

// 1x1 PNG so displayPhoto succeeds without a real capture.
const TINY_PNG =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkAAIAAAoAAv/lxKUAAAAASUVORK5CYII=';

// Stub CAPTURE_PHOTO so the page doesn't hit the SW (which would increment
// attemptCount and shift the seeded stats out from under our assertions).
async function stubCapture(page: Page): Promise<void> {
  await page.addInitScript((png) => {
    const orig = chrome.runtime.sendMessage.bind(chrome.runtime);
    (chrome.runtime as any).sendMessage = (msg: any, cb?: any) => {
      if (msg && msg.type === 'CAPTURE_PHOTO') {
        if (cb) cb({ success: true, data: png });
        return;
      }
      return (orig as any)(msg, cb);
    };
  }, TINY_PNG);
}

test.describe('Tier 1: blocked.js shame view', () => {
  const blockedUrl = (id: string, qs = '') => `chrome-extension://${id}/blocked/blocked.html${qs}`;

  test('high counts drive shame-level + milestone classes', async ({ context, extensionId }) => {
    const seed = await context.newPage();
    await seed.goto(blockedUrl(extensionId, '?gallery=true'));

    // Level 4 (>=10) and an all-time milestone (13).
    await seedStats(seed, 13, 12);
    const lvl4 = await context.newPage();
    await stubCapture(lvl4);
    await lvl4.goto(blockedUrl(extensionId, '?site=reddit'));
    const container4 = lvl4.locator('.shame-container');
    await expect(container4).toHaveClass(/shame-level-4/);
    await expect(container4).toHaveClass(/milestone-13/);
    await lvl4.close();

    // Level 3 (6–9), no milestone.
    await seedStats(seed, 7, 7);
    const lvl3 = await context.newPage();
    await stubCapture(lvl3);
    await lvl3.goto(blockedUrl(extensionId, '?site=tiktok'));
    await expect(lvl3.locator('.shame-container')).toHaveClass(/shame-level-3/);
    await lvl3.close();

    await seed.close();
  });

  test('capture returning failure renders the dark-mirror error state', async ({
    context,
    extensionId,
  }) => {
    const page = await context.newPage();
    await page.addInitScript(() => {
      const orig = chrome.runtime.sendMessage.bind(chrome.runtime);
      (chrome.runtime as any).sendMessage = (msg: any, cb?: any) => {
        if (msg && msg.type === 'CAPTURE_PHOTO') {
          if (cb) cb({ success: false });
          return;
        }
        return (orig as any)(msg, cb);
      };
    });
    await page.goto(blockedUrl(extensionId, '?site=twitter'));

    await expect(page.locator('#photo-frame.mirror-mode')).toBeVisible();
    await expect(page.locator('.mirror-text')).toHaveText('LOOK AT YOURSELF');
    await page.close();
  });

  test('capture throwing is caught and also shows the error state', async ({
    context,
    extensionId,
  }) => {
    const page = await context.newPage();
    await page.addInitScript(() => {
      const orig = chrome.runtime.sendMessage.bind(chrome.runtime);
      (chrome.runtime as any).sendMessage = (msg: any, cb?: any) => {
        if (msg && msg.type === 'CAPTURE_PHOTO') throw new Error('boom');
        return (orig as any)(msg, cb);
      };
    });
    await page.goto(blockedUrl(extensionId, '?site=instagram'));
    await expect(page.locator('#photo-frame.mirror-mode')).toBeVisible();
    await page.close();
  });

  test('gallery opens from the shame page and closes via button and backdrop', async ({
    context,
    extensionId,
  }) => {
    const page = await context.newPage();
    await page.goto(blockedUrl(extensionId, '?site=twitter'));

    await page.locator('#view-gallery').click();
    await expect(page.locator('#gallery-modal')).toBeVisible();

    await page.locator('#close-gallery').click();
    await expect(page.locator('#gallery-modal')).toBeHidden();

    // Re-open, then close by clicking the modal backdrop.
    await page.locator('#view-gallery').click();
    await expect(page.locator('#gallery-modal')).toBeVisible();
    await page.locator('#gallery-modal').click({ position: { x: 5, y: 5 } });
    await expect(page.locator('#gallery-modal')).toBeHidden();

    await page.close();
  });

  test('gallery-only mode closes the tab via button and backdrop', async ({
    context,
    extensionId,
  }) => {
    const page = await context.newPage();
    await page.addInitScript(() => {
      (window as any).__closeCount = 0;
      window.close = () => {
        (window as any).__closeCount++;
      };
    });
    await page.goto(blockedUrl(extensionId, '?gallery=true'));
    await expect(page.locator('#gallery-modal')).toBeVisible();

    await page.locator('#close-gallery').click();
    await page.locator('#gallery-modal').click({ position: { x: 5, y: 5 } });

    expect(await page.evaluate(() => (window as any).__closeCount)).toBeGreaterThanOrEqual(1);
    await page.close();
  });

  test('formatBytes MB branch + apply no-change and no-prune statuses', async ({
    context,
    extensionId,
  }) => {
    const seed = await context.newPage();
    await seed.goto(blockedUrl(extensionId, '?gallery=true'));
    // One large photo so storage size crosses 1 MB → formatBytes MB branch.
    await seed.evaluate(async () => {
      await new Promise<void>((resolve, reject) => {
        const req = indexedDB.open('SelfieShameDB', 1);
        req.onupgradeneeded = () => {
          const db = req.result;
          if (!db.objectStoreNames.contains('photos')) {
            const store = db.createObjectStore('photos', { keyPath: 'id', autoIncrement: true });
            store.createIndex('timestamp', 'timestamp', { unique: false });
          }
        };
        req.onsuccess = () => {
          const db = req.result;
          const tx = db.transaction(['photos'], 'readwrite');
          tx.objectStore('photos').add({
            data: `data:image/png;base64,${'A'.repeat(1_600_000)}`,
            timestamp: Date.now(),
          });
          tx.oncomplete = () => resolve();
          tx.onerror = () => reject(tx.error);
        };
        req.onerror = () => reject(req.error);
      });
    });

    const page = await context.newPage();
    await page.goto(blockedUrl(extensionId, '?gallery=true'));
    await expect(page.locator('#storage-bytes')).toContainText('MB');

    // target === current limit (50) and count <= target → "No change applied."
    await page.locator('#apply-limit').click();
    await expect(page.locator('#storage-status')).toContainText('No change applied');

    // Higher limit, nothing to prune → "Capacity set to 60."
    await page.locator('#limit-input').fill('60');
    await page.locator('#apply-limit').click();
    await expect(page.locator('#storage-status')).toContainText('Capacity set to 60');

    await page.close();
    await seed.close();
  });

  test('arming purge then leaving it cancels after the timeout', async ({
    context,
    extensionId,
  }) => {
    const seed = await context.newPage();
    await seed.goto(blockedUrl(extensionId, '?gallery=true'));
    await seed.evaluate(async () => {
      await new Promise<void>((resolve, reject) => {
        const req = indexedDB.open('SelfieShameDB', 1);
        req.onupgradeneeded = () => {
          const db = req.result;
          if (!db.objectStoreNames.contains('photos')) {
            const store = db.createObjectStore('photos', { keyPath: 'id', autoIncrement: true });
            store.createIndex('timestamp', 'timestamp', { unique: false });
          }
        };
        req.onsuccess = () => {
          const db = req.result;
          const tx = db.transaction(['photos'], 'readwrite');
          tx.objectStore('photos').add({
            data: 'data:image/png;base64,AAAA',
            timestamp: Date.now(),
          });
          tx.oncomplete = () => resolve();
          tx.onerror = () => reject(tx.error);
        };
        req.onerror = () => reject(req.error);
      });
    });

    const page = await context.newPage();
    await page.goto(blockedUrl(extensionId, '?gallery=true'));
    await page.locator('#clear-gallery').click(); // arms
    await expect(page.locator('#clear-gallery')).toHaveText('Confirm Purge');
    // The arm auto-cancels after 8s.
    await expect(page.locator('#storage-status')).toContainText('cancelled', { timeout: 12_000 });
    await expect(page.locator('#clear-gallery')).toHaveText('Purge Gallery');

    await page.close();
    await seed.close();
  });
});
