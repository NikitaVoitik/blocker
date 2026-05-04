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

  test('attempt stats reflect storage values', async ({ extensionPage }) => {
    await extensionPage.evaluate(async () => {
      const today = new Date().toDateString();
      const todayKey = new Date().getFullYear() + '-' + String(new Date().getMonth() + 1).padStart(2, '0') + '-' + String(new Date().getDate()).padStart(2, '0');
      await chrome.storage.local.set({
        attemptCount: 25,
        todayDate: today,
        todayCount: 7,
        dailyCounts: { [todayKey]: 7 }
      });
    });

    const stats = await getStats(extensionPage);
    expect(stats.allTimeCount).toBe(25);
    expect(stats.todayCount).toBe(7);
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
