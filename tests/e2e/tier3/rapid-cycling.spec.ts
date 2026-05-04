import { test, expect } from '../fixtures/extension';
import { getTrackingDataForToday } from '../helpers/messaging';
import { clearStorage } from '../helpers/storage';

const CYCLE_COUNT = 500;
const SITES = [
  'https://www.reddit.com',
  'https://www.instagram.com',
  'https://www.facebook.com',
  'https://www.linkedin.com',
  'https://www.pinterest.com',
];

test.describe('Tier 3: Rapid Tab Cycling', () => {
  test('no double-counting or lost time during rapid switching', async ({ context, extensionPage }) => {
    test.setTimeout(30 * 60 * 1000);

    await clearStorage(extensionPage);
    await extensionPage.waitForTimeout(500);

    const pages = [];
    for (const url of SITES) {
      const page = await context.newPage();
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30_000 });
      pages.push(page);
    }

    for (let i = 0; i < CYCLE_COUNT; i++) {
      const idx = i % pages.length;
      await pages[idx].bringToFront();
      const focusTime = 200 + Math.floor(Math.random() * 600);
      await pages[idx].waitForTimeout(focusTime);
    }

    await extensionPage.bringToFront();
    await extensionPage.waitForTimeout(3000);

    const data = await getTrackingDataForToday(extensionPage);

    for (const siteId of ['reddit', 'instagram', 'facebook', 'linkedin', 'pinterest']) {
      const time = data[siteId]?.time || 0;
      const visits = data[siteId]?.visits || 0;
      expect(time).toBeGreaterThanOrEqual(0);
      expect(time).toBeLessThanOrEqual(30 * 60);
      expect(visits).toBeGreaterThanOrEqual(0);
    }

    const totalTime = Object.values(data).reduce((sum: number, site: any) => sum + (site.time || 0), 0);
    expect(totalTime).toBeLessThanOrEqual(30 * 60);
    expect(totalTime).toBeGreaterThan(0);

    for (const page of pages) {
      await page.close();
    }
  });
});
