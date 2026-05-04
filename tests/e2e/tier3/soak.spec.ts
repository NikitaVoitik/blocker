import { test, expect } from '../fixtures/extension';
import { getTrackingDataForToday } from '../helpers/messaging';
import { clearStorage } from '../helpers/storage';

const SOAK_DURATION_MS = 4 * 60 * 60 * 1000; // 4 hours
const VISIT_INTERVAL_MS = 3 * 60 * 1000; // Every 3 minutes
const VISIT_DURATION_MS = 30 * 1000; // 30 sec on each site

test.describe('Tier 3: Soak Test', () => {
  test('time tracking accumulates correctly over hours', async ({ context, extensionPage }) => {
    test.setTimeout(SOAK_DURATION_MS + 60_000);

    await clearStorage(extensionPage);
    await extensionPage.waitForTimeout(500);

    const startTime = Date.now();
    let expectedRedditTime = 0;
    let expectedRedditVisits = 0;
    let iteration = 0;

    const page = await context.newPage();

    while (Date.now() - startTime < SOAK_DURATION_MS) {
      iteration++;

      await page.goto('https://www.reddit.com', { waitUntil: 'domcontentloaded', timeout: 30_000 });
      expectedRedditVisits++;
      const visitStart = Date.now();

      await page.waitForTimeout(VISIT_DURATION_MS);
      expectedRedditTime += Math.round((Date.now() - visitStart) / 1000);

      await extensionPage.bringToFront();
      await extensionPage.waitForTimeout(2000);

      await page.bringToFront();
      await page.goto('https://www.google.com', { waitUntil: 'domcontentloaded', timeout: 15_000 });

      const elapsed = Date.now() - startTime;
      const nextVisitAt = iteration * VISIT_INTERVAL_MS;
      const waitTime = Math.max(0, nextVisitAt - elapsed);
      if (waitTime > 0) {
        await page.waitForTimeout(waitTime);
      }

      if (iteration % 10 === 0) {
        await extensionPage.bringToFront();
        await extensionPage.waitForTimeout(1000);
        const data = await getTrackingDataForToday(extensionPage);
        const actualTime = data.reddit?.time || 0;
        const tolerance = expectedRedditTime * 0.15;
        expect(actualTime).toBeGreaterThanOrEqual(expectedRedditTime - tolerance);
        expect(actualTime).toBeLessThanOrEqual(expectedRedditTime + tolerance);
      }
    }

    await extensionPage.bringToFront();
    await extensionPage.waitForTimeout(2000);
    const finalData = await getTrackingDataForToday(extensionPage);
    const finalTime = finalData.reddit?.time || 0;
    const finalVisits = finalData.reddit?.visits || 0;

    const timeTolerance = expectedRedditTime * 0.15;
    expect(finalTime).toBeGreaterThanOrEqual(expectedRedditTime - timeTolerance);
    expect(finalTime).toBeLessThanOrEqual(expectedRedditTime + timeTolerance);
    expect(finalVisits).toBeGreaterThanOrEqual(expectedRedditVisits - 2);

    await page.close();
  });
});
