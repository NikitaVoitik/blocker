import { test, expect, webURL } from '../fixtures/extension';
import { getTrackingDataForToday } from '../helpers/messaging';
import { setStorage } from '../helpers/storage';

test.describe('Tier 2: Time Tracking Accuracy', () => {
  test('time only accrues while tab is focused', async ({ context, extensionPage }) => {
    await setStorage(extensionPage, { trackingData: { visits: {}, time: {} } });
    await extensionPage.waitForTimeout(500);

    const page = await context.newPage();
    await page.goto(webURL('https://www.reddit.com'), { waitUntil: 'domcontentloaded', timeout: 30_000 });

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
    await page.goto(webURL('https://www.instagram.com'), { waitUntil: 'domcontentloaded', timeout: 30_000 });

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
    await redditPage.goto(webURL('https://www.reddit.com'), { waitUntil: 'domcontentloaded', timeout: 30_000 });
    await redditPage.waitForTimeout(3000);

    const instaPage = await context.newPage();
    await instaPage.goto(webURL('https://www.instagram.com'), { waitUntil: 'domcontentloaded', timeout: 30_000 });
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

    await page.goto(webURL('https://www.reddit.com'), { waitUntil: 'load', timeout: 30_000 });
    await page.waitForTimeout(1500);
    await page.goto(webURL('https://www.google.com'), { waitUntil: 'load', timeout: 15_000 });
    await page.waitForTimeout(500);
    await page.goto(webURL('https://www.reddit.com'), { waitUntil: 'load', timeout: 30_000 });
    await page.waitForTimeout(1500);
    await page.goto(webURL('https://www.google.com'), { waitUntil: 'load', timeout: 15_000 });
    await page.waitForTimeout(500);
    await page.goto(webURL('https://www.reddit.com'), { waitUntil: 'load', timeout: 30_000 });
    await page.waitForTimeout(1500);

    await extensionPage.bringToFront();
    await extensionPage.waitForTimeout(1500);

    const data = await getTrackingDataForToday(extensionPage);
    expect(data.reddit?.visits).toBeGreaterThanOrEqual(3);
    await page.close();
  });

  test('30-minute cap limits an actual stale active session', async ({ context, extensionPage }) => {
    const noon = new Date(); noon.setHours(12, 0, 0, 0);
    const timestamp = noon.getTime();
    const worker = context.serviceWorkers()[0];
    await worker.evaluate(value => {
      const NativeDate = Date;
      globalThis.Date = class extends NativeDate {
        constructor(input?: string | number) { super(input === undefined ? value : input); }
        static now() { return value; }
      } as DateConstructor;
    }, timestamp);
    const page = await context.newPage();
    await page.goto(webURL('http://www.reddit.com/'));
    await page.bringToFront();
    await expect.poll(async () => (await getTrackingDataForToday(extensionPage)).reddit.visits).toBe(1);
    await setStorage(extensionPage, { trackingData: { visits: {}, time: {} } });
    await worker.evaluate(value => { Date.now = () => value; }, timestamp + 31 * 60_000);
    const data = await getTrackingDataForToday(extensionPage);
    expect(data.reddit.time).toBe(1800);
  });
});

// Changing the browser worker's clock exercises the real event and storage owners.
test('an active session crossing midnight is split between its calendar days', async ({ context, extensionPage }) => {
  const day = new Date(); day.setHours(23, 59, 58, 0);
  const timestamp = day.getTime();
  const worker = context.serviceWorkers()[0];
  async function setTime(value: number) {
    await worker.evaluate(value => {
      const NativeDate = Date;
      globalThis.Date = class extends NativeDate {
        constructor(input?: string | number) { super(input === undefined ? value : input); }
        static now() { return value; }
      } as DateConstructor;
    }, value);
  }
  await setTime(timestamp);
  const page = await context.newPage();
  await page.goto(webURL('http://www.reddit.com/'));
  await page.bringToFront();
  await expect.poll(async () => (await getTrackingDataForToday(extensionPage)).reddit.visits).toBe(1);
  await setTime(timestamp + 4000);
  const today = await getTrackingDataForToday(extensionPage);
  expect(today.reddit.time).toBe(2);
  const report = await extensionPage.evaluate(() => chrome.runtime.sendMessage({ type: 'GET_TRACKING_REPORT_DATA' }));
  expect(report.dailyBreakdown.at(-2).time).toBe(2);
  expect(report.dailyBreakdown.at(-1).time).toBe(2);
});
