import { test, expect } from '../fixtures/extension';
import { setStorage, getStorage, clearStorage } from '../helpers/storage';
import { getTrackingDataForToday, getTrackingReportData, getStats } from '../helpers/messaging';

test.describe('Tier 2: Data Integrity', () => {
  test('tracking data persists across page reloads', async ({ context, extensionId, extensionPage }) => {
    const today = new Date();
    const todayKey = today.getFullYear() + '-' + String(today.getMonth() + 1).padStart(2, '0') + '-' + String(today.getDate()).padStart(2, '0');

    await setStorage(extensionPage, {
      trackingData: {
        visits: { [`reddit:${todayKey}`]: 10 },
        time: { [`reddit:${todayKey}`]: 300 },
      }
    });

    await extensionPage.close();
    const newPage = await context.newPage();
    await newPage.goto(`chrome-extension://${extensionId}/blocked/blocked.html`);
    await newPage.waitForTimeout(1000);

    const data = await getTrackingDataForToday(newPage);
    expect(data.reddit?.visits).toBe(10);
    expect(data.reddit?.time).toBe(300);
    await newPage.close();
  });

  test('attempt stats increment correctly', async ({ extensionPage }) => {
    await clearStorage(extensionPage);
    await extensionPage.waitForTimeout(500);

    const stats1 = await getStats(extensionPage);
    expect(stats1.allTimeCount).toBe(0);
    expect(stats1.todayCount).toBe(0);

    await extensionPage.evaluate(async () => {
      const today = new Date().toDateString();
      const todayKey = new Date().getFullYear() + '-' + String(new Date().getMonth() + 1).padStart(2, '0') + '-' + String(new Date().getDate()).padStart(2, '0');
      await chrome.storage.local.set({
        attemptCount: 5,
        todayDate: today,
        todayCount: 3,
        dailyCounts: { [todayKey]: 3 }
      });
    });

    const stats2 = await getStats(extensionPage);
    expect(stats2.allTimeCount).toBe(5);
    expect(stats2.todayCount).toBe(3);
  });

  test('report data includes 30-day breakdown', async ({ extensionPage }) => {
    const today = new Date();
    const todayKey = today.getFullYear() + '-' + String(today.getMonth() + 1).padStart(2, '0') + '-' + String(today.getDate()).padStart(2, '0');

    await setStorage(extensionPage, {
      trackingData: {
        visits: { [`reddit:${todayKey}`]: 5, [`instagram:${todayKey}`]: 3 },
        time: { [`reddit:${todayKey}`]: 600, [`instagram:${todayKey}`]: 300 },
      }
    });
    await extensionPage.waitForTimeout(500);

    const report = await getTrackingReportData(extensionPage);
    expect(report.dailyBreakdown).toHaveLength(30);
    expect(report.todayTime).toBe(900);
    expect(report.todayVisits).toBe(8);
    expect(report.weeklySummaries).toHaveLength(4);
  });

  test('old data beyond 30 days gets pruned on write', async ({ extensionPage }) => {
    const today = new Date();
    const todayKey = today.getFullYear() + '-' + String(today.getMonth() + 1).padStart(2, '0') + '-' + String(today.getDate()).padStart(2, '0');

    const oldDate = new Date(today);
    oldDate.setDate(oldDate.getDate() - 40);
    const oldKey = oldDate.getFullYear() + '-' + String(oldDate.getMonth() + 1).padStart(2, '0') + '-' + String(oldDate.getDate()).padStart(2, '0');

    await setStorage(extensionPage, {
      trackingData: {
        visits: { [`reddit:${todayKey}`]: 1, [`reddit:${oldKey}`]: 99 },
        time: { [`reddit:${todayKey}`]: 100, [`reddit:${oldKey}`]: 9999 },
      }
    });

    const page = await extensionPage.context().newPage();
    await page.goto('https://www.reddit.com', { waitUntil: 'load', timeout: 30_000 });
    await page.waitForTimeout(2000);
    await page.close();

    await extensionPage.waitForTimeout(1000);
    const result = await getStorage(extensionPage, 'trackingData');
    const data = result.trackingData;

    expect(data.visits[`reddit:${oldKey}`]).toBeUndefined();
    expect(data.time[`reddit:${oldKey}`]).toBeUndefined();
    expect(data.visits[`reddit:${todayKey}`]).toBeGreaterThanOrEqual(1);
  });
});
