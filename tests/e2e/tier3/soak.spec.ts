import { test, expect, webURL } from '../fixtures/extension';
import { getTrackingDataForToday } from '../helpers/messaging';

const DURATION = Number(process.env.TEST_SOAK_MS || 30_000);
const VISIT = Number(process.env.TEST_VISIT_MS || 2000);
const IDLE = Number(process.env.TEST_IDLE_MS || 2000);
test('tracking stays accurate across repeated active and idle sessions', async ({ context, extensionPage }) => {
  test.setTimeout(DURATION + 60_000);
  const page = await context.newPage();
  const start = Date.now();
  let expectedTime = 0;
  let visits = 0;
  while (Date.now() - start < DURATION) {
    await page.bringToFront();
    await page.goto(webURL('http://www.reddit.com/'));
    visits++;
    const from = Date.now();
    await page.waitForTimeout(VISIT);
    await extensionPage.bringToFront();
    expectedTime += (Date.now() - from) / 1000;
    const beforeIdle = (await getTrackingDataForToday(extensionPage)).reddit.time;
    expect(beforeIdle).toBeGreaterThanOrEqual(expectedTime * 0.9);
    expect(beforeIdle).toBeLessThanOrEqual(expectedTime * 1.1 + visits * 0.2);
    await extensionPage.waitForTimeout(IDLE);
    const afterIdle = await getTrackingDataForToday(extensionPage);
    expect(afterIdle.reddit.time - beforeIdle).toBeLessThan(0.1);
    expect(afterIdle.reddit.visits).toBe(visits);
  }
  expect(visits).toBeGreaterThan(1);
});
