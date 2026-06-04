import { expect, test } from '../fixtures/extension';
import { addTrackedSite, getTrackingDataForToday, removeTrackedSite } from '../helpers/messaging';

test.describe('Tier 1: Time Tracking', () => {
  test('default tracked sites are loaded', async ({ extensionPage }) => {
    const sites = await extensionPage.evaluate(async () => {
      return new Promise((resolve) => {
        chrome.runtime.sendMessage({ type: 'GET_TRACKED_SITES' }, resolve);
      });
    });
    expect(Array.isArray(sites)).toBe(true);
    const ids = sites.map((s: any) => s.id);
    expect(ids).toContain('instagram');
    expect(ids).toContain('reddit');
    expect(ids).toContain('youtube');
  });

  test('visiting a tracked site increments visit count', async ({ context, extensionPage }) => {
    const page = await context.newPage();
    await page.goto('https://www.instagram.com', { waitUntil: 'load', timeout: 30_000 });
    await page.waitForTimeout(2000);

    const data = await getTrackingDataForToday(extensionPage);
    expect(data.instagram.visits).toBeGreaterThanOrEqual(1);
    await page.close();
  });

  test('time accrues while tab is focused on tracked site', async ({ context, extensionPage }) => {
    const page = await context.newPage();
    await page.goto('https://www.reddit.com', { waitUntil: 'domcontentloaded', timeout: 30_000 });

    await page.waitForTimeout(5000);

    await extensionPage.bringToFront();
    await extensionPage.waitForTimeout(1000);

    const data = await getTrackingDataForToday(extensionPage);
    expect(data.reddit.time).toBeGreaterThanOrEqual(3);
    await page.close();
  });

  test('adding a custom tracked site works', async ({ extensionPage }) => {
    const site = {
      id: 'news.ycombinator.com',
      label: 'Hacker News',
      domains: ['news.ycombinator.com'],
    };
    const result = await addTrackedSite(extensionPage, site);
    expect(result.success).toBe(true);

    const sites = await extensionPage.evaluate(async () => {
      return new Promise((resolve) => {
        chrome.runtime.sendMessage({ type: 'GET_TRACKED_SITES' }, resolve);
      });
    });
    const ids = sites.map((s: any) => s.id);
    expect(ids).toContain('news.ycombinator.com');

    await removeTrackedSite(extensionPage, 'news.ycombinator.com');
  });
});
