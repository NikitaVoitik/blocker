import { test, expect } from '../fixtures/extension';
import {
  setSiteRestriction, checkLimits, getDynamicRules, removeBlockedSite, addTrackedSite,
  getRestrictionSites, getAnalyticsSites, getTrackedSites, getTrackingDataForToday
} from '../helpers/messaging';
import { setStorage, seedLimitRestriction } from '../helpers/storage';

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

async function gotoExpectBlock(page: any, url: string, timeout = 20_000) {
  try {
    await page.goto(url, { waitUntil: 'commit', timeout });
  } catch {
    // DNR redirect may abort the navigation
  }
  await expect.poll(() => page.url(), { timeout }).toContain('blocked/blocked.html');
}

test.describe('Tier 2: Daily Limit Enforcement', () => {
  test('time accrued while browsing counts toward the limit and boots the tab', async ({ context, extensionPage }) => {
    await setSiteRestriction(extensionPage, 'reddit', 'limit', 60);
    await setStorage(extensionPage, { trackingData: { visits: {}, time: { [`reddit:${dateKey()}`]: 56 } } });
    await extensionPage.waitForTimeout(400);

    const page = await context.newPage();
    await page.goto('https://www.reddit.com', { waitUntil: 'domcontentloaded', timeout: 30_000 }).catch(() => {});
    await page.bringToFront();
    await page.waitForTimeout(6000); // ~6s focused → 56 + 6 = 62 >= 60

    const res = await checkLimits(extensionPage);
    expect(res.overLimit).toContain('reddit');

    await expect.poll(() => page.url(), { timeout: 8000 }).toContain('blocked/blocked.html');
    expect(page.url()).toContain('reason=limit');
    expect(page.url()).toContain('site=reddit');
    await page.close();
  });

  test('blocks only once REAL focused time accrues up to the limit (not before)', async ({ context, extensionPage }) => {
    // Sub-minute cap seeded directly (the message API enforces a 60s floor).
    await seedLimitRestriction(extensionPage, {
      id: 'reddit', label: 'Reddit', domains: ['reddit.com', 'www.reddit.com', 'old.reddit.com'], capSeconds: 10, usedSeconds: 0
    });
    await extensionPage.waitForTimeout(400);

    const page = await context.newPage();
    await page.goto('https://www.reddit.com', { waitUntil: 'domcontentloaded', timeout: 30_000 }).catch(() => {});
    await page.bringToFront();

    // Phase 1: under the cap → still allowed.
    await page.waitForTimeout(3500);
    let res = await checkLimits(extensionPage);
    let data = await getTrackingDataForToday(extensionPage);
    expect(data.reddit.time, 'recorded under the limit').toBeLessThan(10);
    expect(res.overLimit).not.toContain('reddit');
    expect(page.url()).not.toContain('blocked/blocked.html');

    // Phase 2: keep browsing past the cap → blocked.
    await page.bringToFront();
    await page.waitForTimeout(9000);
    res = await checkLimits(extensionPage);
    data = await getTrackingDataForToday(extensionPage);
    expect(data.reddit.time, 'recorded reached the limit').toBeGreaterThanOrEqual(10);
    expect(res.overLimit).toContain('reddit');
    await expect.poll(() => page.url(), { timeout: 8000 }).toContain('blocked/blocked.html');
    expect(page.url()).toContain('reason=limit');
    await page.close();
  });

  test('limit boundary: just under is allowed, reaching the cap blocks', async ({ extensionPage }) => {
    await setSiteRestriction(extensionPage, 'reddit', 'limit', 60);

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
    await setSiteRestriction(extensionPage, 'reddit', 'limit', 60);
    await setStorage(extensionPage, {
      trackingData: { visits: {}, time: { [`reddit:${dateKey(1)}`]: 9999, [`reddit:${dateKey()}`]: 0 } }
    });
    await extensionPage.waitForTimeout(300);

    const res = await checkLimits(extensionPage);
    expect(res.overLimit).not.toContain('reddit');
    expect(await limitRuleExists(extensionPage, 'reddit.com')).toBe(false);
  });

  test('one site over its limit does not block another limited site', async ({ extensionPage }) => {
    await setSiteRestriction(extensionPage, 'reddit', 'limit', 60);
    await setSiteRestriction(extensionPage, 'instagram', 'limit', 60);
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

  test('removing the restriction restores access to an over-limit site', async ({ extensionPage }) => {
    await setSiteRestriction(extensionPage, 'reddit', 'limit', 60);
    await setStorage(extensionPage, { trackingData: { visits: {}, time: { [`reddit:${dateKey()}`]: 500 } } });
    await extensionPage.waitForTimeout(300);

    let res = await checkLimits(extensionPage);
    expect(res.overLimit).toContain('reddit');
    expect(await limitRuleExists(extensionPage, 'reddit.com')).toBe(true);

    await setSiteRestriction(extensionPage, 'reddit', 'off');
    res = await checkLimits(extensionPage);
    expect(res.overLimit).not.toContain('reddit');
    expect(await limitRuleExists(extensionPage, 'reddit.com')).toBe(false);
  });

  test('setting a limit below current usage immediately boots an open tab', async ({ context, extensionPage }) => {
    await setSiteRestriction(extensionPage, 'reddit', 'limit', 3600);

    const page = await context.newPage();
    await page.goto('https://www.reddit.com', { waitUntil: 'domcontentloaded', timeout: 30_000 }).catch(() => {});
    await page.waitForTimeout(1000);
    expect(page.url()).not.toContain('blocked/blocked.html');

    await setStorage(extensionPage, { trackingData: { visits: {}, time: { [`reddit:${dateKey()}`]: 300 } } });
    await setSiteRestriction(extensionPage, 'reddit', 'limit', 60); // 300s >= 60s → over

    await expect.poll(() => page.url(), { timeout: 8000 }).toContain('blocked/blocked.html');
    expect(page.url()).toContain('reason=limit');
    await page.close();
  });

  test('re-focusing a backgrounded over-limit tab boots it', async ({ context, extensionPage }) => {
    const page = await context.newPage();
    await page.goto('https://www.reddit.com', { waitUntil: 'domcontentloaded', timeout: 30_000 }).catch(() => {});
    await page.waitForTimeout(1000);
    expect(page.url()).not.toContain('blocked/blocked.html');

    await extensionPage.bringToFront();
    await extensionPage.waitForTimeout(500);

    // Seed an over-limit restriction via storage: onChanged → syncLimitRules sets the rule +
    // overLimitSiteIds WITHOUT booting tabs, so the backgrounded tab stays put.
    await seedLimitRestriction(extensionPage, {
      id: 'reddit', label: 'Reddit', domains: ['reddit.com', 'www.reddit.com', 'old.reddit.com'], capSeconds: 60, usedSeconds: 300
    });
    await expect.poll(() => limitRuleExists(extensionPage, 'reddit.com'), { timeout: 5000 }).toBe(true);
    expect(page.url()).not.toContain('blocked/blocked.html');

    await page.bringToFront();
    await expect.poll(() => page.url(), { timeout: 8000 }).toContain('blocked/blocked.html');
    expect(page.url()).toContain('reason=limit');
    await page.close();
  });

  test('removing an over-limit restriction clears its limit rule', async ({ extensionPage }) => {
    await setSiteRestriction(extensionPage, 'reddit', 'limit', 60);
    await setStorage(extensionPage, { trackingData: { visits: {}, time: { [`reddit:${dateKey()}`]: 500 } } });
    await extensionPage.waitForTimeout(300);
    await checkLimits(extensionPage);
    expect(await limitRuleExists(extensionPage, 'reddit.com')).toBe(true);

    await removeBlockedSite(extensionPage, 'reddit');
    await expect.poll(() => limitRuleExists(extensionPage, 'reddit.com'), { timeout: 5000 }).toBe(false);
  });

  test('limit rules never collide with always-block rules', async ({ extensionPage }) => {
    await setSiteRestriction(extensionPage, 'reddit', 'limit', 60);
    await setStorage(extensionPage, { trackingData: { visits: {}, time: { [`reddit:${dateKey()}`]: 999 } } });
    await extensionPage.waitForTimeout(300);
    await checkLimits(extensionPage);

    const rules = await getDynamicRules(extensionPage);
    const blockRules = rules.filter((r: any) => r.id < LIMIT_RULE_ID_BASE);
    const limitRules = rules.filter((r: any) => r.id >= LIMIT_RULE_ID_BASE);

    expect(blockRules.length).toBeGreaterThan(0); // default always-block sites (twitter, youtube-shorts)
    expect(limitRules.length).toBeGreaterThan(0); // reddit over its limit
    const ids = rules.map((r: any) => r.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  test('a limit-mode site stays in analytics but leaves the tracked-management list', async ({ extensionPage }) => {
    await setSiteRestriction(extensionPage, 'reddit', 'limit', 3600);
    await setStorage(extensionPage, { trackingData: { visits: {}, time: { [`reddit:${dateKey()}`]: 120 } } });
    await extensionPage.waitForTimeout(300);

    // Analytics (effective) still includes the limited site + its usage...
    const analytics = await getAnalyticsSites(extensionPage);
    expect(analytics.some((s: any) => s.id === 'reddit')).toBe(true);
    const data = await getTrackingDataForToday(extensionPage);
    expect(data.reddit.time).toBe(120);

    // ...but it's owned by the restriction list now, not the analytics-management list.
    const tracked = await getTrackedSites(extensionPage);
    expect(tracked.some((s: any) => s.id === 'reddit')).toBe(false);
    const restrictions = await getRestrictionSites(extensionPage);
    expect(restrictions.find((s: any) => s.id === 'reddit')?.mode).toBe('limit');
  });

  test('a pathOnly limit accrues real time on its path, not the host-only tracked site', async ({ context, extensionPage }) => {
    // Host-only analytics tracking for example.com, plus a pathOnly limit on example.com/shorts.
    // A /shorts visit must accrue to the (more specific) pathOnly limit, not the host entry.
    await addTrackedSite(extensionPage, { id: 'ex-host', label: 'ex-host', domains: ['example.com', 'www.example.com'] });
    await seedLimitRestriction(extensionPage, {
      id: 'ex-shorts', label: 'ex-shorts', domains: ['example.com/shorts', 'www.example.com/shorts'],
      pathOnly: true, capSeconds: 600, usedSeconds: 0
    });
    await extensionPage.waitForTimeout(400);

    const page = await context.newPage();
    await page.goto('https://example.com/shorts/abc', { waitUntil: 'domcontentloaded', timeout: 15_000 }).catch(() => {});
    await page.bringToFront();
    await page.waitForTimeout(4000);
    await checkLimits(extensionPage);

    const data = await getTrackingDataForToday(extensionPage);
    expect(data['ex-shorts']?.time || 0, 'pathOnly limit should accrue the /shorts time').toBeGreaterThanOrEqual(2);
    expect(data['ex-host']?.time || 0, 'host-only site must not steal /shorts time').toBe(0);
    await page.close();
  });

  test('pathOnly limit (YouTube Shorts) blocks the /shorts path once over', async ({ context, extensionPage }) => {
    // youtube-shorts ships as an always-block, pathOnly site; convert it to a limit and push it over.
    await setSiteRestriction(extensionPage, 'youtube-shorts', 'limit', 60);
    await setStorage(extensionPage, { trackingData: { visits: {}, time: { [`youtube-shorts:${dateKey()}`]: 999 } } });
    await extensionPage.waitForTimeout(300);
    await checkLimits(extensionPage);

    await expect.poll(() => limitRuleExists(extensionPage, 'youtube.com/shorts'), { timeout: 5000 }).toBe(true);

    const page = await context.newPage();
    await gotoExpectBlock(page, 'https://www.youtube.com/shorts/abcdef');
    expect(page.url()).toContain('site=youtube-shorts');
    expect(page.url()).toContain('reason=limit');
    await page.close();
  });
});
