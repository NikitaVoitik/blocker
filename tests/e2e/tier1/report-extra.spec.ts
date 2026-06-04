import { test, expect, type Page } from '../fixtures/extension';
import { setStorage } from '../helpers/storage';

function todayKey(): string {
  const d = new Date();
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}

async function seedPhoto(page: Page): Promise<number> {
  return page.evaluate(
    () =>
      new Promise<number>((resolve, reject) => {
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
          const r = tx.objectStore('photos').add({ data: 'data:image/png;base64,AAAA', timestamp: Date.now() });
          r.onsuccess = () => resolve(r.result as number);
          r.onerror = () => reject(r.error);
        };
        req.onerror = () => reject(req.error);
      }),
  );
}

test.describe('Tier 1: report.js extra branches', () => {
  const reportUrl = (id: string, qs = '') => `chrome-extension://${id}/report/report.html${qs}`;

  test('tab buttons switch between shame and tracking views', async ({ context, extensionId }) => {
    const page = await context.newPage();
    await page.goto(reportUrl(extensionId));

    await page.locator('.report-tab-btn[data-tab="tracking"]').click();
    await expect(page.locator('#report-tracking')).toBeVisible();
    await page.locator('.report-tab-btn[data-tab="shame"]').click();
    await expect(page.locator('#report-shame')).toBeVisible();
    await page.close();
  });

  test('coward log renders a photo thumbnail when the photoId matches', async ({ context, extensionId }) => {
    const seed = await context.newPage();
    await seed.goto(reportUrl(extensionId)); // extension origin for IndexedDB + storage
    const photoId = await seedPhoto(seed);
    await setStorage(seed, {
      removalLog: [{ siteId: 'twitter', siteLabel: 'Twitter / X', timestamp: Date.now(), photoId }],
    });

    const page = await context.newPage();
    await page.goto(reportUrl(extensionId));
    await expect(page.locator('.coward-log-entry .coward-log-thumb')).toBeVisible();
    await page.close();
    await seed.close();
  });

  test('tracking period switcher renders week and month breakdowns', async ({ context, extensionId }) => {
    const seed = await context.newPage();
    await seed.goto(reportUrl(extensionId));
    await setStorage(seed, {
      trackingData: { visits: { ['reddit:' + todayKey()]: 5 }, time: { ['reddit:' + todayKey()]: 240 } },
    });

    const page = await context.newPage();
    await page.goto(reportUrl(extensionId, '?tab=tracking'));
    await page.locator('.period-btn[data-period="week"]').click();
    await page.locator('.period-btn[data-period="month"]').click();
    await page.locator('.period-btn[data-period="today"]').click();
    await expect(page.locator('#site-time-breakdown')).toBeVisible();
    await page.close();
    await seed.close();
  });

  test('tracking report shows the empty site-breakdown state with no activity', async ({ context, extensionId }) => {
    const page = await context.newPage();
    await page.goto(reportUrl(extensionId, '?tab=tracking'));
    await expect(page.locator('#site-breakdown-empty')).toBeVisible();
    await page.close();
  });
});
