import { test, expect } from '../fixtures/extension';
import { setSiteLimit, checkLimits, getDynamicRules, removeTrackedSite, getTrackedSites, getTrackingDataForToday } from '../helpers/messaging';
import { setStorage } from '../helpers/storage';

const LIMIT_RULE_ID_BASE = 100000;

function dateKey(daysAgo = 0): string {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}

async function limitRuleExists(page: any, domainFragment: string): Promise<boolean> {
  const rules = await getDynamicRules(page);
  return rules.some((r: any) => r.id >= LIMIT_RULE_ID_BASE && r.condition.urlFilter.includes(domainFragment));
}

test.describe('Tier 2: Daily Limit Enforcement', () => {
  test('time accrued while browsing counts toward the limit and boots the tab', async ({ context, extensionPage }) => {
    await setSiteLimit(extensionPage, 'reddit', 60);
    // Seed near the cap so a few seconds of real browsing crosses it.
    await setStorage(extensionPage, { trackingData: { visits: {}, time: { [`reddit:${dateKey()}`]: 56 } } });
    await extensionPage.waitForTimeout(400);

    const page = await context.newPage();
    await page.goto('https://www.reddit.com', { waitUntil: 'domcontentloaded', timeout: 30_000 }).catch(() => {});
    await page.bringToFront();
    await page.waitForTimeout(6000); // ~6s focused → 56 + 6 = 62 >= 60

    const res = await checkLimits(extensionPage);
    expect(res.overLimit).toContain('reddit');

    // The active reddit tab should be redirected to the limit block page.
    await expect.poll(() => page.url(), { timeout: 8000 }).toContain('blocked/blocked.html');
    expect(page.url()).toContain('reason=limit');
    expect(page.url()).toContain('site=reddit');

    await page.close();
  });

  test('blocks only once REAL focused time accrues up to the limit (not before)', async ({ context, extensionPage }) => {
    // Use a sub-minute limit seeded directly (SET_SITE_LIMIT enforces a 60s floor) so the
    // threshold is reachable with real browsing in seconds. This exercises the exact code
    // path a 60-minute limit takes — recordedTime >= dailyLimitSeconds — without the hour wait.
    const sites = await getTrackedSites(extensionPage);
    const updated = sites.map((s: any) => (s.id === 'reddit' ? { ...s, dailyLimitSeconds: 10 } : s));
    await setStorage(extensionPage, { trackedSites: updated, trackingData: { visits: {}, time: {} } });
    await extensionPage.waitForTimeout(400);

    const page = await context.newPage();
    await page.goto('https://www.reddit.com', { waitUntil: 'domcontentloaded', timeout: 30_000 }).catch(() => {});
    await page.bringToFront();

    // Phase 1 — browse a few seconds, still under the 10s limit: must NOT be blocked yet.
    await page.waitForTimeout(3500);
    let res = await checkLimits(extensionPage);
    let data = await getTrackingDataForToday(extensionPage);
    expect(data.reddit.time, 'recorded time should still be under the limit').toBeLessThan(10);
    expect(res.overLimit, 'not over the limit yet').not.toContain('reddit');
    expect(page.url(), 'still on reddit before the limit').not.toContain('blocked/blocked.html');

    // Phase 2 — keep browsing until accrued focus time crosses the limit: must get blocked.
    await page.bringToFront();
    await page.waitForTimeout(9000);
    res = await checkLimits(extensionPage);
    data = await getTrackingDataForToday(extensionPage);
    expect(data.reddit.time, 'real accrued time should have reached the limit').toBeGreaterThanOrEqual(10);
    expect(res.overLimit).toContain('reddit');
    await expect.poll(() => page.url(), { timeout: 8000 }).toContain('blocked/blocked.html');
    expect(page.url()).toContain('reason=limit');

    await page.close();
  });

  test('limit boundary: just under is allowed, reaching the cap blocks', async ({ extensionPage }) => {
    await setSiteLimit(extensionPage, 'reddit', 60);

    await setStorage(extensionPage, { trackingData: { visits: {}, time: { [`reddit:${dateKey()}`]: 59 } } });
    await extensionPage.waitForTimeout(300);
    let res = await checkLimits(extensionPage);
    expect(res.overLimit).not.toContain('reddit');
    expect(await limitRuleExists(extensionPage, 'reddit.com')).toBe(false);

    await setStorage(extensionPage, { trackingData: { visits: {}, time: { [`reddit:${dateKey()}`]: 60 } } });
    await extensionPage.waitForTimeout(300);
    res = await checkLimits(extensionPage);
    expect(res.overLimit).toContain('reddit');
    expect(await limitRuleExists(extensionPage, 'reddit.com')).toBe(true);
  });

  test('a limit reached on a previous day does not block today', async ({ extensionPage }) => {
    await setSiteLimit(extensionPage, 'reddit', 60);
    await setStorage(extensionPage, {
      trackingData: { visits: {}, time: { [`reddit:${dateKey(1)}`]: 9999, [`reddit:${dateKey()}`]: 0 } }
    });
    await extensionPage.waitForTimeout(300);

    const res = await checkLimits(extensionPage);
    expect(res.overLimit).not.toContain('reddit');
    expect(await limitRuleExists(extensionPage, 'reddit.com')).toBe(false);
  });

  test('one site over its limit does not block another limited site', async ({ extensionPage }) => {
    await setSiteLimit(extensionPage, 'reddit', 60);
    await setSiteLimit(extensionPage, 'instagram', 60);
    await setStorage(extensionPage, {
      trackingData: { visits: {}, time: { [`reddit:${dateKey()}`]: 120, [`instagram:${dateKey()}`]: 10 } }
    });
    await extensionPage.waitForTimeout(300);

    const res = await checkLimits(extensionPage);
    expect(res.overLimit).toContain('reddit');
    expect(res.overLimit).not.toContain('instagram');
    expect(await limitRuleExists(extensionPage, 'reddit.com')).toBe(true);
    expect(await limitRuleExists(extensionPage, 'instagram.com')).toBe(false);
  });

  test('clearing the limit restores access to an over-limit site', async ({ extensionPage }) => {
    await setSiteLimit(extensionPage, 'reddit', 60);
    await setStorage(extensionPage, { trackingData: { visits: {}, time: { [`reddit:${dateKey()}`]: 500 } } });
    await extensionPage.waitForTimeout(300);

    let res = await checkLimits(extensionPage);
    expect(res.overLimit).toContain('reddit');
    expect(await limitRuleExists(extensionPage, 'reddit.com')).toBe(true);

    await setSiteLimit(extensionPage, 'reddit', 0);
    res = await checkLimits(extensionPage);
    expect(res.overLimit).not.toContain('reddit');
    expect(await limitRuleExists(extensionPage, 'reddit.com')).toBe(false);
  });

  test('setting a limit below current usage immediately boots an open tab', async ({ context, extensionPage }) => {
    // Generous limit first so the site loads normally.
    await setSiteLimit(extensionPage, 'reddit', 3600);

    const page = await context.newPage();
    await page.goto('https://www.reddit.com', { waitUntil: 'domcontentloaded', timeout: 30_000 }).catch(() => {});
    await page.waitForTimeout(1000);
    expect(page.url()).not.toContain('blocked/blocked.html');

    // Record usage above a tighter limit, then apply it — the open tab should be booted.
    await setStorage(extensionPage, { trackingData: { visits: {}, time: { [`reddit:${dateKey()}`]: 300 } } });
    await setSiteLimit(extensionPage, 'reddit', 60);

    await expect.poll(() => page.url(), { timeout: 8000 }).toContain('blocked/blocked.html');
    expect(page.url()).toContain('reason=limit');
    expect(page.url()).toContain('site=reddit');
    await page.close();
  });

  test('re-focusing a backgrounded over-limit tab boots it', async ({ context, extensionPage }) => {
    // Load reddit while unlimited so it stays open and rendered.
    const page = await context.newPage();
    await page.goto('https://www.reddit.com', { waitUntil: 'domcontentloaded', timeout: 30_000 }).catch(() => {});
    await page.waitForTimeout(1000);
    expect(page.url()).not.toContain('blocked/blocked.html');

    // Background it behind the extension page.
    await extensionPage.bringToFront();
    await extensionPage.waitForTimeout(500);

    // Mark reddit over limit via a direct storage write. The storage.onChanged handler runs
    // syncLimitRules (sets overLimitSiteIds + rules) but does NOT boot tabs, so the loaded
    // background tab stays put — exactly the state the focus-handler boot is meant to catch.
    const sites = await getTrackedSites(extensionPage);
    const updated = sites.map((s: any) => (s.id === 'reddit' ? { ...s, dailyLimitSeconds: 60 } : s));
    await setStorage(extensionPage, {
      trackedSites: updated,
      trackingData: { visits: {}, time: { [`reddit:${dateKey()}`]: 300 } }
    });

    await expect.poll(() => limitRuleExists(extensionPage, 'reddit.com'), { timeout: 5000 }).toBe(true);
    expect(page.url()).not.toContain('blocked/blocked.html'); // not booted yet — still backgrounded

    // Focusing the tab fires the activation handler, which boots it.
    await page.bringToFront();
    await expect.poll(() => page.url(), { timeout: 8000 }).toContain('blocked/blocked.html');
    expect(page.url()).toContain('reason=limit');
    await page.close();
  });

  test('removing an over-limit tracked site clears its limit rule', async ({ extensionPage }) => {
    await setSiteLimit(extensionPage, 'reddit', 60);
    await setStorage(extensionPage, { trackingData: { visits: {}, time: { [`reddit:${dateKey()}`]: 500 } } });
    await extensionPage.waitForTimeout(300);
    await checkLimits(extensionPage);
    expect(await limitRuleExists(extensionPage, 'reddit.com')).toBe(true);

    // Removing the site must drop its limit rule, not leave it orphaned and blocking.
    await removeTrackedSite(extensionPage, 'reddit');
    await expect.poll(() => limitRuleExists(extensionPage, 'reddit.com'), { timeout: 5000 }).toBe(false);
  });

  test('limit rules never collide with block rules', async ({ extensionPage }) => {
    await setSiteLimit(extensionPage, 'reddit', 60);
    await setStorage(extensionPage, { trackingData: { visits: {}, time: { [`reddit:${dateKey()}`]: 999 } } });
    await extensionPage.waitForTimeout(300);
    await checkLimits(extensionPage);

    const rules = await getDynamicRules(extensionPage);
    const blockRules = rules.filter((r: any) => r.id < LIMIT_RULE_ID_BASE);
    const limitRules = rules.filter((r: any) => r.id >= LIMIT_RULE_ID_BASE);

    expect(blockRules.length).toBeGreaterThan(0); // default blocked sites present
    expect(limitRules.length).toBeGreaterThan(0); // reddit over its limit
    const ids = rules.map((r: any) => r.id);
    expect(new Set(ids).size).toBe(ids.length); // no duplicate ids
  });
});
