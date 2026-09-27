import { test, expect } from '../fixtures/extension';
import { addTrackedSite, getTrackedSites, setSiteLimit, getDynamicRules } from '../helpers/messaging';
import { setStorage } from '../helpers/storage';

const LIMIT_RULE_ID_BASE = 100000;

function todayKey(): string {
  const d = new Date();
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}

const EXAMPLE_SITE = { id: 'example.com', label: 'Example', domains: ['example.com', 'www.example.com'] };

async function hasExampleLimitRule(page: any): Promise<boolean> {
  const rules = await getDynamicRules(page);
  return rules.some((r: any) => r.id >= LIMIT_RULE_ID_BASE && r.condition.urlFilter.includes('example.com'));
}

async function gotoExpectBlock(page: any, url: string, timeout = 15_000) {
  try {
    await page.goto(url, { waitUntil: 'commit', timeout });
  } catch {
    // declarativeNetRequest redirect may cause ERR_ABORTED
  }
  await expect.poll(() => page.url(), { timeout }).toContain('blocked/blocked.html');
}

test.describe('Tier 1: Daily Limits', () => {
  test('setting a daily limit on a tracked site persists', async ({ extensionPage }) => {
    await addTrackedSite(extensionPage, EXAMPLE_SITE);
    const res = await setSiteLimit(extensionPage, 'example.com', 3600);
    expect(res.success).toBe(true);

    const sites = await getTrackedSites(extensionPage);
    const site = sites.find((s: any) => s.id === 'example.com');
    expect(site.dailyLimitSeconds).toBe(3600);
  });

  test('clearing a daily limit removes it', async ({ extensionPage }) => {
    await addTrackedSite(extensionPage, EXAMPLE_SITE);
    await setSiteLimit(extensionPage, 'example.com', 3600);

    const res = await setSiteLimit(extensionPage, 'example.com', 0);
    expect(res.success).toBe(true);

    const sites = await getTrackedSites(extensionPage);
    const site = sites.find((s: any) => s.id === 'example.com');
    expect(site.dailyLimitSeconds === undefined || site.dailyLimitSeconds === 0).toBe(true);
  });

  test('invalid limits are rejected', async ({ extensionPage }) => {
    await addTrackedSite(extensionPage, EXAMPLE_SITE);

    const tooSmall = await setSiteLimit(extensionPage, 'example.com', 30); // below 60s minimum
    expect(tooSmall.success).toBe(false);

    const tooBig = await setSiteLimit(extensionPage, 'example.com', 90000); // above 24h maximum
    expect(tooBig.success).toBe(false);

    const unknown = await setSiteLimit(extensionPage, 'not-tracked.example', 3600);
    expect(unknown.success).toBe(false);
  });

  test('a site under its limit is not blocked', async ({ context, extensionPage }) => {
    await addTrackedSite(extensionPage, EXAMPLE_SITE);
    await setStorage(extensionPage, { trackingData: { visits: {}, time: { [`example.com:${todayKey()}`]: 60 } } });
    await setSiteLimit(extensionPage, 'example.com', 3600); // 1m used of 60m → under

    expect(await hasExampleLimitRule(extensionPage)).toBe(false);

    const page = await context.newPage();
    await page.goto('https://example.com', { waitUntil: 'domcontentloaded', timeout: 15_000 }).catch(() => {});
    await page.waitForTimeout(1500);
    expect(page.url()).not.toContain('blocked/blocked.html');
    await page.close();
  });

  test('a site that has reached its limit is blocked with reason=limit', async ({ context, extensionPage }) => {
    await addTrackedSite(extensionPage, EXAMPLE_SITE);
    await setStorage(extensionPage, { trackingData: { visits: {}, time: { [`example.com:${todayKey()}`]: 3700 } } });

    const res = await setSiteLimit(extensionPage, 'example.com', 3600); // over the limit
    expect(res.success).toBe(true);

    await expect.poll(() => hasExampleLimitRule(extensionPage), { timeout: 5000 }).toBe(true);

    const page = await context.newPage();
    await gotoExpectBlock(page, 'https://example.com');
    expect(page.url()).toContain('site=example.com');
    expect(page.url()).toContain('reason=limit');
    await page.close();
  });

  test('the limit block page renders the DAILY LIMIT banner with site + usage', async ({ context, extensionPage, extensionId }) => {
    // reddit is a default tracked site (label "Reddit"); give it a limit and over-limit usage.
    await setSiteLimit(extensionPage, 'reddit', 3600);
    await setStorage(extensionPage, { trackingData: { visits: {}, time: { [`reddit:${todayKey()}`]: 4200 } } }); // 1h10m

    const page = await context.newPage();
    await page.goto(`chrome-extension://${extensionId}/blocked/blocked.html?site=reddit&reason=limit`, {
      waitUntil: 'domcontentloaded'
    });

    // The banner only appears in reason=limit mode, so its presence proves the limit branch ran.
    await expect(page.locator('#limit-banner')).toBeVisible();
    await expect(page.locator('.limit-headline')).toHaveText('DAILY LIMIT REACHED');
    await expect(page.locator('#limit-site')).toHaveText('Reddit');
    await expect(page.locator('#limit-cap')).toHaveText('1h');
    await expect(page.locator('#limit-spent')).toHaveText('1h 10m');

    // And a roast is shown (limitMessages set, since the banner confirms limit mode).
    await expect.poll(async () => ((await page.locator('#shame-text').textContent()) || '').trim().length)
      .toBeGreaterThan(0);
    await page.close();
  });

  test('clearing the limit unblocks a previously over-limit site', async ({ context, extensionPage }) => {
    await addTrackedSite(extensionPage, EXAMPLE_SITE);
    await setStorage(extensionPage, { trackingData: { visits: {}, time: { [`example.com:${todayKey()}`]: 3700 } } });
    await setSiteLimit(extensionPage, 'example.com', 3600);
    await expect.poll(() => hasExampleLimitRule(extensionPage), { timeout: 5000 }).toBe(true);

    await setSiteLimit(extensionPage, 'example.com', 0);
    await expect.poll(() => hasExampleLimitRule(extensionPage), { timeout: 5000 }).toBe(false);

    const page = await context.newPage();
    await page.goto('https://example.com', { waitUntil: 'domcontentloaded', timeout: 15_000 }).catch(() => {});
    await page.waitForTimeout(1500);
    expect(page.url()).not.toContain('blocked/blocked.html');
    await page.close();
  });
});
