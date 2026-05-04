import { test, expect } from '../fixtures/extension';
import { setStorage } from '../helpers/storage';

test.describe('Tier 2: Report Page', () => {
  test('report page loads and shows shame stats', async ({ context, extensionId, extensionPage }) => {
    const today = new Date();
    const todayKey = today.getFullYear() + '-' + String(today.getMonth() + 1).padStart(2, '0') + '-' + String(today.getDate()).padStart(2, '0');
    await setStorage(extensionPage, {
      attemptCount: 15,
      todayDate: today.toDateString(),
      todayCount: 4,
      dailyCounts: { [todayKey]: 4 },
      installDate: todayKey,
    });

    const page = await context.newPage();
    await page.goto(`chrome-extension://${extensionId}/report/report.html`);
    await page.waitForTimeout(2000);

    await expect(page.locator('#today-count')).toHaveText('4');
    await expect(page.locator('#all-time-count')).toHaveText('15');
    await page.close();
  });

  test('report page tracking tab loads via URL param', async ({ context, extensionId, extensionPage }) => {
    const today = new Date();
    const todayKey = today.getFullYear() + '-' + String(today.getMonth() + 1).padStart(2, '0') + '-' + String(today.getDate()).padStart(2, '0');
    await setStorage(extensionPage, {
      trackingData: {
        visits: { [`reddit:${todayKey}`]: 7 },
        time: { [`reddit:${todayKey}`]: 1200 },
      }
    });

    const page = await context.newPage();
    await page.goto(`chrome-extension://${extensionId}/report/report.html?tab=tracking`);
    await page.waitForTimeout(2000);

    const trackingPanel = page.locator('#report-tracking');
    await expect(trackingPanel).toBeVisible();
    await expect(page.locator('#track-today-visits')).toHaveText('7');
    await page.close();
  });

  test('daily chart renders 30 bars', async ({ context, extensionId }) => {
    const page = await context.newPage();
    await page.goto(`chrome-extension://${extensionId}/report/report.html`);
    await page.waitForTimeout(2000);

    const bars = page.locator('#daily-chart .bar');
    await expect(bars).toHaveCount(30);
    await page.close();
  });
});
