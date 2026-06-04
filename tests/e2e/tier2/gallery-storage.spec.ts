import { expect, type Page, test } from '../fixtures/extension';
import { sendMessage } from '../helpers/messaging';

// 1x1 transparent PNG data URL — small but representative of the data: URL format
const TINY_PNG_DATA_URL =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkAAIAAAoAAv/lxKUAAAAASUVORK5CYII=';

async function seedPhotos(
  page: Page,
  count: number,
  dataUrl: string = TINY_PNG_DATA_URL,
): Promise<void> {
  await page.evaluate(
    async ({ n, data }) => {
      await new Promise<void>((resolve, reject) => {
        const req = indexedDB.open('SelfieShameDB', 1);
        req.onupgradeneeded = () => {
          const database = req.result;
          if (!database.objectStoreNames.contains('photos')) {
            const store = database.createObjectStore('photos', {
              keyPath: 'id',
              autoIncrement: true,
            });
            store.createIndex('timestamp', 'timestamp', { unique: false });
          }
        };
        req.onsuccess = () => {
          const db = req.result;
          const tx = db.transaction(['photos'], 'readwrite');
          const store = tx.objectStore('photos');
          const base = Date.now();
          for (let i = 0; i < n; i++) {
            store.add({ data, timestamp: base - (n - i) * 1000 });
          }
          tx.oncomplete = () => resolve();
          tx.onerror = () => reject(tx.error);
        };
        req.onerror = () => reject(req.error);
      });
    },
    { n: count, data: dataUrl },
  );
}

async function getPhotoCount(page: Page): Promise<number> {
  return page.evaluate(async () => {
    return new Promise<number>((resolve) => {
      const req = indexedDB.open('SelfieShameDB', 1);
      req.onsuccess = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains('photos')) {
          resolve(0);
          return;
        }
        const tx = db.transaction(['photos'], 'readonly');
        const store = tx.objectStore('photos');
        const countReq = store.count();
        countReq.onsuccess = () => resolve(countReq.result);
        countReq.onerror = () => resolve(0);
      };
      req.onerror = () => resolve(0);
    });
  });
}

test.describe('Tier 2: Gallery Storage', () => {
  // The default `extensionPage` fixture lands on blocked.html which auto-triggers
  // a webcam capture; we re-navigate to the gallery-only URL (which skips capture)
  // and then drain any racing capture write before each test.
  test.beforeEach(async ({ extensionPage, extensionId }) => {
    await extensionPage.goto(`chrome-extension://${extensionId}/blocked/blocked.html?gallery=true`);
    await extensionPage.evaluate(() => chrome.storage.local.remove('photoLimit'));
    // Poll until any in-flight auto-capture has landed AND the store is empty,
    // observed twice in a row. CLEAR_PHOTOS goes through the SW (which holds the
    // canonical DB handle) so it can't race with the SW's own writes.
    await expect
      .poll(
        async () => {
          await sendMessage(extensionPage, { type: 'CLEAR_PHOTOS' });
          await extensionPage.waitForTimeout(250);
          const first = await getPhotoCount(extensionPage);
          await extensionPage.waitForTimeout(250);
          const second = await getPhotoCount(extensionPage);
          return first === 0 && second === 0;
        },
        { timeout: 10_000, intervals: [200, 400, 800] },
      )
      .toBe(true);
  });

  test('GET_PHOTO_STORAGE_INFO returns defaults when empty', async ({ extensionPage }) => {
    const info = await sendMessage(extensionPage, { type: 'GET_PHOTO_STORAGE_INFO' });
    expect(info).toBeTruthy();
    expect(info.count).toBe(0);
    expect(info.bytes).toBe(0);
    expect(info.limit).toBe(50);
    expect(info.minLimit).toBe(5);
    expect(info.maxLimit).toBe(500);
  });

  test('GET_PHOTO_STORAGE_INFO reports seeded photos with non-zero bytes', async ({
    extensionPage,
  }) => {
    await seedPhotos(extensionPage, 3);
    const info = await sendMessage(extensionPage, { type: 'GET_PHOTO_STORAGE_INFO' });
    expect(info.count).toBe(3);
    expect(info.bytes).toBeGreaterThan(0);
  });

  test('SET_PHOTO_LIMIT updates the limit and persists it', async ({ extensionPage }) => {
    const res = await sendMessage(extensionPage, { type: 'SET_PHOTO_LIMIT', limit: 25 });
    expect(res.success).toBe(true);
    expect(res.limit).toBe(25);

    const stored = await extensionPage.evaluate(() => chrome.storage.local.get('photoLimit'));
    expect(stored.photoLimit).toBe(25);

    const info = await sendMessage(extensionPage, { type: 'GET_PHOTO_STORAGE_INFO' });
    expect(info.limit).toBe(25);
  });

  test('SET_PHOTO_LIMIT rejects values below the minimum', async ({ extensionPage }) => {
    const res = await sendMessage(extensionPage, { type: 'SET_PHOTO_LIMIT', limit: 2 });
    expect(res.success).toBe(false);
    const info = await sendMessage(extensionPage, { type: 'GET_PHOTO_STORAGE_INFO' });
    expect(info.limit).toBe(50);
  });

  test('SET_PHOTO_LIMIT rejects values above the maximum', async ({ extensionPage }) => {
    const res = await sendMessage(extensionPage, { type: 'SET_PHOTO_LIMIT', limit: 5000 });
    expect(res.success).toBe(false);
    const info = await sendMessage(extensionPage, { type: 'GET_PHOTO_STORAGE_INFO' });
    expect(info.limit).toBe(50);
  });

  test('SET_PHOTO_LIMIT prunes excess photos when decreased', async ({ extensionPage }) => {
    await seedPhotos(extensionPage, 10);
    expect(await getPhotoCount(extensionPage)).toBe(10);

    const res = await sendMessage(extensionPage, { type: 'SET_PHOTO_LIMIT', limit: 5 });
    expect(res.success).toBe(true);

    await expect.poll(() => getPhotoCount(extensionPage), { timeout: 4000 }).toBe(5);
  });

  test('CLEAR_PHOTOS empties the gallery', async ({ extensionPage }) => {
    await seedPhotos(extensionPage, 4);
    expect(await getPhotoCount(extensionPage)).toBe(4);

    const res = await sendMessage(extensionPage, { type: 'CLEAR_PHOTOS' });
    expect(res.success).toBe(true);

    await expect.poll(() => getPhotoCount(extensionPage), { timeout: 4000 }).toBe(0);

    const info = await sendMessage(extensionPage, { type: 'GET_PHOTO_STORAGE_INFO' });
    expect(info.count).toBe(0);
    expect(info.bytes).toBe(0);
  });

  test('gallery page renders storage panel with seeded data', async ({
    context,
    extensionId,
    extensionPage,
  }) => {
    await seedPhotos(extensionPage, 6);

    const page = await context.newPage();
    await page.goto(`chrome-extension://${extensionId}/blocked/blocked.html?gallery=true`);

    await expect(page.locator('#gallery-storage')).toBeVisible();
    await expect(page.locator('#storage-count')).toHaveText('6 / 50');
    await expect(page.locator('#storage-bytes')).not.toHaveText('0 KB');
    await expect(page.locator('#limit-input')).toHaveValue('50');
    await expect(page.locator('#gallery-grid .gallery-item')).toHaveCount(6);

    await page.close();
  });

  test('minus button decreases the limit input by 5 and clamps to min', async ({
    context,
    extensionId,
  }) => {
    const page = await context.newPage();
    await page.goto(`chrome-extension://${extensionId}/blocked/blocked.html?gallery=true`);

    await expect(page.locator('#limit-input')).toHaveValue('50');

    await page.locator('#limit-decrease').click();
    await expect(page.locator('#limit-input')).toHaveValue('45');

    // Click many times to clamp at minimum (5)
    for (let i = 0; i < 20; i++) {
      await page.locator('#limit-decrease').click();
    }
    await expect(page.locator('#limit-input')).toHaveValue('5');

    await page.close();
  });

  test('plus button increases the limit input by 5 and clamps to max', async ({
    context,
    extensionId,
  }) => {
    const page = await context.newPage();
    await page.goto(`chrome-extension://${extensionId}/blocked/blocked.html?gallery=true`);

    await page.locator('#limit-input').fill('495');
    await page.locator('#limit-increase').click();
    await expect(page.locator('#limit-input')).toHaveValue('500');

    await page.locator('#limit-increase').click();
    await expect(page.locator('#limit-input')).toHaveValue('500');

    await page.close();
  });

  test('Apply Capacity persists the new limit and prunes the gallery', async ({
    context,
    extensionId,
    extensionPage,
  }) => {
    await seedPhotos(extensionPage, 12);

    const page = await context.newPage();
    await page.goto(`chrome-extension://${extensionId}/blocked/blocked.html?gallery=true`);

    await expect(page.locator('#gallery-grid .gallery-item')).toHaveCount(12);

    await page.locator('#limit-input').fill('7');
    await page.locator('#apply-limit').click();

    await expect(page.locator('#storage-count')).toHaveText('7 / 7');
    await expect(page.locator('#gallery-grid .gallery-item')).toHaveCount(7);
    await expect(page.locator('#storage-status')).toContainText('Capacity set to 7');

    const stored = await extensionPage.evaluate(() => chrome.storage.local.get('photoLimit'));
    expect(stored.photoLimit).toBe(7);

    await page.close();
  });

  test('Purge Gallery requires confirmation click and then wipes photos', async ({
    context,
    extensionId,
    extensionPage,
  }) => {
    await seedPhotos(extensionPage, 4);

    const page = await context.newPage();
    await page.goto(`chrome-extension://${extensionId}/blocked/blocked.html?gallery=true`);

    await expect(page.locator('#gallery-grid .gallery-item')).toHaveCount(4);

    // First click arms the button — verify state via fast attribute reads so we
    // don't burn the arming window on Playwright's auto-retrying matchers.
    await page.locator('#clear-gallery').click();
    expect(await page.locator('#clear-gallery').textContent()).toBe('Confirm Purge');
    expect(await page.locator('#clear-gallery').getAttribute('class')).toMatch(/is-armed/);
    expect(await page.locator('#gallery-grid .gallery-item').count()).toBe(4);

    // Second click executes the purge
    await page.locator('#clear-gallery').click();

    await expect(page.locator('#storage-count')).toHaveText('0 / 50');
    await expect(page.locator('#gallery-empty')).toBeVisible();
    await expect(page.locator('#storage-status')).toContainText('purged');

    expect(await getPhotoCount(extensionPage)).toBe(0);

    await page.close();
  });

  test('Purge Gallery on empty store reports already empty', async ({ context, extensionId }) => {
    const page = await context.newPage();
    await page.goto(`chrome-extension://${extensionId}/blocked/blocked.html?gallery=true`);

    await page.locator('#clear-gallery').click();
    await expect(page.locator('#storage-status')).toContainText('already empty');
    await expect(page.locator('#clear-gallery')).toHaveText('Purge Gallery');

    await page.close();
  });
});
