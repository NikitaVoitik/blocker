import { test, expect, webURL } from '../fixtures/extension';
import { getTrackingDataForToday } from '../helpers/messaging';
import { setStorage } from '../helpers/storage';

const SITES = ['reddit', 'instagram', 'facebook', 'linkedin', 'pinterest'];
test('rapid switching preserves fractional time without double counting', async ({ context, extensionPage }) => {
  const pages = [];
  for (const site of SITES) {
    const page = await context.newPage();
    await page.goto(webURL(`http://www.${site}.com/`));
    pages.push(page);
  }
  await extensionPage.bringToFront();
  await getTrackingDataForToday(extensionPage);
  await setStorage(extensionPage, { trackingData: { visits: {}, time: {} } });
  const expected = SITES.map(() => 0);
  const start = Date.now();
  for (let i = 0; i < 100; i++) {
    const idx = i % pages.length;
    await pages[idx].bringToFront();
    const from = Date.now();
    await pages[idx].waitForTimeout(60 + i % 5 * 10);
    expected[idx] += (Date.now() - from) / 1000;
  }
  await extensionPage.bringToFront();
  const elapsed = (Date.now() - start) / 1000;
  const data = await getTrackingDataForToday(extensionPage);
  for (let i = 0; i < SITES.length; i++) {
    expect(data[SITES[i]].time).toBeGreaterThanOrEqual(expected[i] * 0.85);
    expect(data[SITES[i]].time).toBeLessThanOrEqual(expected[i] * 1.15 + 0.4);
  }
  const total = Object.values(data).reduce((sum: number, site: any) => sum + site.time, 0);
  expect(total).toBeGreaterThanOrEqual(expected.reduce((a, b) => a + b, 0) * 0.9);
  expect(total).toBeLessThanOrEqual(elapsed + 0.5);
});
