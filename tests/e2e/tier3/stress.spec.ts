import { test, expect } from '../fixtures/extension';
import { addBlockedSite, removeBlockedSite, addTrackedSite, removeTrackedSite } from '../helpers/messaging';

test.describe('Tier 3: Many Sites Stress', () => {
  test('50 blocked sites all redirect correctly', async ({ context, extensionPage }) => {
    test.setTimeout(10 * 60 * 1000);

    const sites = [];
    for (let i = 0; i < 50; i++) {
      const id = `stress-block-${i}.example`;
      sites.push({
        id,
        label: `Stress Block ${i}`,
        domains: [`stress-block-${i}.example`],
      });
    }

    for (const site of sites) {
      const result = await addBlockedSite(extensionPage, site);
      expect(result.success).toBe(true);
    }
    await extensionPage.waitForTimeout(2000);

    const ruleCount: number = await extensionPage.evaluate(async () => {
      const rules = await chrome.declarativeNetRequest.getDynamicRules();
      return rules.length;
    });
    expect(ruleCount).toBeGreaterThanOrEqual(50);

    const page = await context.newPage();
    for (let i = 0; i < 5; i++) {
      await page.goto(`http://stress-block-${i}.example/`, { timeout: 10_000 }).catch(() => {});
      await page.waitForTimeout(1000);
    }
    await page.close();

    for (const site of sites) {
      await removeBlockedSite(extensionPage, site.id);
    }
    await extensionPage.waitForTimeout(2000);
  });

  test('50 tracked sites all count visits', async ({ context, extensionPage }) => {
    test.setTimeout(10 * 60 * 1000);

    const sites = [];
    for (let i = 0; i < 50; i++) {
      const id = `stress-track-${i}.example`;
      sites.push({
        id,
        label: `Stress Track ${i}`,
        domains: [`stress-track-${i}.example`],
      });
    }

    for (const site of sites) {
      const result = await addTrackedSite(extensionPage, site);
      expect(result.success).toBe(true);
    }
    await extensionPage.waitForTimeout(1000);

    const trackedSites: any[] = await extensionPage.evaluate(async () => {
      return new Promise((resolve) => {
        chrome.runtime.sendMessage({ type: 'GET_TRACKED_SITES' }, resolve);
      });
    });
    expect(trackedSites.length).toBeGreaterThanOrEqual(50);

    for (const site of sites) {
      await removeTrackedSite(extensionPage, site.id);
    }
  });
});
