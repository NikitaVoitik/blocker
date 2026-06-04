import { test, expect } from '../fixtures/extension';
import {
  addBlockedSite, removeBlockedSite, setSiteRestriction, getRestrictionSites,
  getDynamicRules, checkLimits
} from '../helpers/messaging';
import { setStorage } from '../helpers/storage';

const LIMIT_RULE_ID_BASE = 100000;

function todayKey(): string {
  const d = new Date();
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}

const EX = { id: 'example.com', label: 'Example', domains: ['example.com', 'www.example.com'] };

function hasExLimitRule(rules: any[]): boolean {
  return rules.some((r) => r.id >= LIMIT_RULE_ID_BASE && r.condition.urlFilter.includes('example.com'));
}
function hasExBlockRule(rules: any[]): boolean {
  return rules.some((r) => r.id < LIMIT_RULE_ID_BASE && r.condition.urlFilter.includes('example.com'));
}
async function findEx(page: any) {
  const sites = await getRestrictionSites(page);
  return sites.find((s: any) => s.id === 'example.com');
}

async function gotoExpectBlock(page: any, url: string, timeout = 15_000) {
  try {
    await page.goto(url, { waitUntil: 'commit', timeout });
  } catch {
    // declarativeNetRequest redirect may cause ERR_ABORTED
  }
  await expect.poll(() => page.url(), { timeout }).toContain('blocked/blocked.html');
}

test.describe('Tier 1: Restrictions & Limits', () => {
  test('an always-block restriction persists and blocks every visit', async ({ context, extensionPage }) => {
    const res = await addBlockedSite(extensionPage, { ...EX, mode: 'always' });
    expect(res.success).toBe(true);

    const s = await findEx(extensionPage);
    expect(s.mode).toBe('always');

    await expect.poll(async () => hasExBlockRule(await getDynamicRules(extensionPage)), { timeout: 5000 }).toBe(true);

    const page = await context.newPage();
    await gotoExpectBlock(page, 'https://example.com');
    expect(page.url()).toContain('site=example.com');
    expect(page.url()).not.toContain('reason=limit');
    await page.close();
  });

  test('a limit restriction persists; under the cap it is allowed and makes no block rule', async ({ context, extensionPage }) => {
    await addBlockedSite(extensionPage, { ...EX, mode: 'limit', dailyLimitSeconds: 3600 });
    await setStorage(extensionPage, { trackingData: { visits: {}, time: { [`example.com:${todayKey()}`]: 60 } } });
    await checkLimits(extensionPage);

    const s = await findEx(extensionPage);
    expect(s.mode).toBe('limit');
    expect(s.dailyLimitSeconds).toBe(3600);

    const rules = await getDynamicRules(extensionPage);
    expect(hasExBlockRule(rules), 'limit-mode site must never get an always-block rule').toBe(false);
    expect(hasExLimitRule(rules), 'under the cap → no limit rule yet').toBe(false);

    const page = await context.newPage();
    await page.goto('https://example.com', { waitUntil: 'domcontentloaded', timeout: 15_000 }).catch(() => {});
    await page.waitForTimeout(1500);
    expect(page.url()).not.toContain('blocked/blocked.html');
    await page.close();
  });

  test('a limit restriction over its cap blocks with reason=limit', async ({ context, extensionPage }) => {
    await addBlockedSite(extensionPage, { ...EX, mode: 'limit', dailyLimitSeconds: 3600 });
    await setStorage(extensionPage, { trackingData: { visits: {}, time: { [`example.com:${todayKey()}`]: 3700 } } });
    await checkLimits(extensionPage);

    await expect.poll(async () => hasExLimitRule(await getDynamicRules(extensionPage)), { timeout: 5000 }).toBe(true);
    expect(hasExBlockRule(await getDynamicRules(extensionPage))).toBe(false);

    const page = await context.newPage();
    await gotoExpectBlock(page, 'https://example.com');
    expect(page.url()).toContain('site=example.com');
    expect(page.url()).toContain('reason=limit');
    await page.close();
  });

  test('toggling Always ⇄ Limit moves the rules between ranges', async ({ extensionPage }) => {
    await addBlockedSite(extensionPage, { ...EX, mode: 'always' });
    await expect.poll(async () => hasExBlockRule(await getDynamicRules(extensionPage)), { timeout: 5000 }).toBe(true);

    // → Limit (under cap): block rule disappears, no limit rule
    await setStorage(extensionPage, { trackingData: { visits: {}, time: { [`example.com:${todayKey()}`]: 0 } } });
    await setSiteRestriction(extensionPage, 'example.com', 'limit', 3600);
    await expect.poll(async () => hasExBlockRule(await getDynamicRules(extensionPage)), { timeout: 5000 }).toBe(false);
    expect(hasExLimitRule(await getDynamicRules(extensionPage))).toBe(false);
    expect((await findEx(extensionPage)).mode).toBe('limit');

    // → Always again: block rule returns
    await setSiteRestriction(extensionPage, 'example.com', 'always');
    await expect.poll(async () => hasExBlockRule(await getDynamicRules(extensionPage)), { timeout: 5000 }).toBe(true);
    expect((await findEx(extensionPage)).mode).toBe('always');
  });

  test('removing a restriction clears its rules', async ({ context, extensionPage }) => {
    await addBlockedSite(extensionPage, { ...EX, mode: 'always' });
    await expect.poll(async () => hasExBlockRule(await getDynamicRules(extensionPage)), { timeout: 5000 }).toBe(true);

    await removeBlockedSite(extensionPage, 'example.com');
    await expect.poll(async () => hasExBlockRule(await getDynamicRules(extensionPage)), { timeout: 5000 }).toBe(false);

    const page = await context.newPage();
    await page.goto('https://example.com', { waitUntil: 'domcontentloaded', timeout: 15_000 }).catch(() => {});
    await page.waitForTimeout(1500);
    expect(page.url()).not.toContain('blocked/blocked.html');
    await page.close();
  });

  test('invalid limits are rejected', async ({ extensionPage }) => {
    await addBlockedSite(extensionPage, { ...EX, mode: 'always' });

    const tooSmall = await setSiteRestriction(extensionPage, 'example.com', 'limit', 30); // below 60s floor
    expect(tooSmall.success).toBe(false);

    const tooBig = await setSiteRestriction(extensionPage, 'example.com', 'limit', 90000); // above 24h
    expect(tooBig.success).toBe(false);

    const unknown = await setSiteRestriction(extensionPage, 'not-a-site.example', 'limit', 3600);
    expect(unknown.success).toBe(false);
  });

  test('the limit block page renders the DAILY LIMIT banner with site + usage', async ({ context, extensionPage, extensionId }) => {
    await addBlockedSite(extensionPage, { ...EX, mode: 'limit', dailyLimitSeconds: 3600 });
    await setStorage(extensionPage, { trackingData: { visits: {}, time: { [`example.com:${todayKey()}`]: 4200 } } }); // 1h10m
    await checkLimits(extensionPage);

    const page = await context.newPage();
    await page.goto(`chrome-extension://${extensionId}/blocked/blocked.html?site=example.com&reason=limit`, {
      waitUntil: 'domcontentloaded'
    });

    await expect(page.locator('#limit-banner')).toBeVisible();
    await expect(page.locator('.limit-headline')).toHaveText('DAILY LIMIT REACHED');
    await expect(page.locator('#limit-site')).toHaveText('Example');
    await expect(page.locator('#limit-cap')).toHaveText('1h');
    await expect(page.locator('#limit-spent')).toHaveText('1h 10m');
    await page.close();
  });
});
