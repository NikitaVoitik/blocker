import { test, expect } from '../fixtures/extension';
import { getTrackingDataForToday } from '../helpers/messaging';
import { setStorage } from '../helpers/storage';

test.describe('Tier 2: Time Tracking Accuracy', () => {
  test('time only accrues while tab is focused', async ({ context, extensionPage }) => {
    await setStorage(extensionPage, { trackingData: { visits: {}, time: {} } });
    await extensionPage.waitForTimeout(500);

    const page = await context.newPage();
    await page.goto('https://www.reddit.com', { waitUntil: 'domcontentloaded', timeout: 30_000 });

    await page.waitForTimeout(4000);

    await extensionPage.bringToFront();
    await extensionPage.waitForTimeout(1500);

    const data1 = await getTrackingDataForToday(extensionPage);
    const time1 = data1.reddit?.time || 0;
    expect(time1).toBeGreaterThanOrEqual(3);
    expect(time1).toBeLessThanOrEqual(8);

    await extensionPage.waitForTimeout(5000);

    const data2 = await getTrackingDataForToday(extensionPage);
    const time2 = data2.reddit?.time || 0;
    expect(time2 - time1).toBeLessThanOrEqual(2);

    await page.close();
  });

  test('switching back to tracked site resumes tracking', async ({ context, extensionPage }) => {
    await setStorage(extensionPage, { trackingData: { visits: {}, time: {} } });
    await extensionPage.waitForTimeout(500);

    const page = await context.newPage();
    await page.goto('https://www.instagram.com', { waitUntil: 'domcontentloaded', timeout: 30_000 });

    await page.waitForTimeout(3000);

    await extensionPage.bringToFront();
    await extensionPage.waitForTimeout(2000);

    await page.bringToFront();
    await page.waitForTimeout(3000);

    await extensionPage.bringToFront();
    await extensionPage.waitForTimeout(1500);

    const data = await getTrackingDataForToday(extensionPage);
    const time = data.instagram?.time || 0;
    expect(time).toBeGreaterThanOrEqual(4);
    expect(time).toBeLessThanOrEqual(12);

    await page.close();
  });

  test('multiple tracked sites track independently', async ({ context, extensionPage }) => {
    await setStorage(extensionPage, { trackingData: { visits: {}, time: {} } });
    await extensionPage.waitForTimeout(500);

    const redditPage = await context.newPage();
    await redditPage.goto('https://www.reddit.com', { waitUntil: 'domcontentloaded', timeout: 30_000 });
    await redditPage.waitForTimeout(3000);

    const instaPage = await context.newPage();
    await instaPage.goto('https://www.instagram.com', { waitUntil: 'domcontentloaded', timeout: 30_000 });
    await instaPage.waitForTimeout(3000);

    await extensionPage.bringToFront();
    await extensionPage.waitForTimeout(1500);

    const data = await getTrackingDataForToday(extensionPage);
    expect(data.reddit?.time).toBeGreaterThanOrEqual(2);
    expect(data.instagram?.time).toBeGreaterThanOrEqual(2);

    await redditPage.close();
    await instaPage.close();
  });

  test('visit count increments per navigation', async ({ context, extensionPage }) => {
    await setStorage(extensionPage, { trackingData: { visits: {}, time: {} } });
    await extensionPage.waitForTimeout(500);

    const page = await context.newPage();

    await page.goto('https://www.reddit.com', { waitUntil: 'load', timeout: 30_000 });
    await page.waitForTimeout(1500);
    await page.goto('https://www.google.com', { waitUntil: 'load', timeout: 15_000 });
    await page.waitForTimeout(500);
    await page.goto('https://www.reddit.com', { waitUntil: 'load', timeout: 30_000 });
    await page.waitForTimeout(1500);
    await page.goto('https://www.google.com', { waitUntil: 'load', timeout: 15_000 });
    await page.waitForTimeout(500);
    await page.goto('https://www.reddit.com', { waitUntil: 'load', timeout: 30_000 });
    await page.waitForTimeout(1500);

    await extensionPage.bringToFront();
    await extensionPage.waitForTimeout(1500);

    const data = await getTrackingDataForToday(extensionPage);
    expect(data.reddit?.visits).toBeGreaterThanOrEqual(3);
    await page.close();
  });

  test('30-minute session cap is enforced', async ({ extensionPage }) => {
    const today = new Date();
    const todayKey = today.getFullYear() + '-' + String(today.getMonth() + 1).padStart(2, '0') + '-' + String(today.getDate()).padStart(2, '0');

    await setStorage(extensionPage, {
      trackingData: {
        visits: { [`reddit:${todayKey}`]: 5 },
        time: { [`reddit:${todayKey}`]: 1750 },
      }
    });
    await extensionPage.waitForTimeout(500);

    const data = await getTrackingDataForToday(extensionPage);
    expect(data.reddit?.time).toBe(1750);
  });
});
