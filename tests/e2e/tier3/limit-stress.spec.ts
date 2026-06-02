import { test, expect } from '../fixtures/extension';
import { checkLimits, getDynamicRules, getTrackedSites } from '../helpers/messaging';
import { setStorage } from '../helpers/storage';

const LIMIT_RULE_ID_BASE = 100000;
const ITERATIONS = 120;

function todayKey(): string {
  const d = new Date();
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}

const SITES = [
  { id: 'reddit', domains: ['reddit.com', 'www.reddit.com', 'old.reddit.com'] },
  { id: 'instagram', domains: ['instagram.com', 'www.instagram.com'] },
  { id: 'facebook', domains: ['facebook.com', 'www.facebook.com', 'web.facebook.com', 'm.facebook.com'] },
  { id: 'linkedin', domains: ['linkedin.com', 'www.linkedin.com'] },
  { id: 'pinterest', domains: ['pinterest.com', 'www.pinterest.com'] },
  { id: 'tiktok', domains: ['tiktok.com', 'www.tiktok.com'] },
];

// Wait until the service worker's in-memory cache reflects the trackedSites we just wrote.
async function waitForLimitsApplied(page: any, expected: Record<string, number>) {
  await expect.poll(async () => {
    const sites = await getTrackedSites(page);
    const map: Record<string, number> = {};
    for (const s of sites) map[s.id] = Number(s.dailyLimitSeconds) || 0;
    return JSON.stringify(map);
  }, { timeout: 5000 }).toBe(JSON.stringify(expected));
}

test.describe('Tier 3: Daily Limit Stress', () => {
  test('limit rules stay consistent across randomized iterations', async ({ extensionPage }) => {
    test.setTimeout(20 * 60 * 1000);
    const tk = todayKey();

    for (let i = 0; i < ITERATIONS; i++) {
      // Randomize limits (0 = no limit) and today's usage for each site.
      const trackedSites: any[] = [];
      const expectedLimits: Record<string, number> = {};
      const time: Record<string, number> = {};

      for (const s of SITES) {
        const hasLimit = Math.random() < 0.7;
        const limitSec = hasLimit ? 60 + Math.floor(Math.random() * 3600) : 0;
        const entry: any = { id: s.id, label: s.id, domains: s.domains, builtin: true };
        if (limitSec > 0) entry.dailyLimitSeconds = limitSec;
        trackedSites.push(entry);
        expectedLimits[s.id] = limitSec;

        const cap = limitSec > 0 ? limitSec : 3600;
        const r = Math.random();
        let t: number;
        if (r < 0.4) t = cap + Math.floor(Math.random() * 100); // likely over (if limited)
        else if (r < 0.8) t = Math.floor(Math.random() * cap);  // under
        else t = 0;
        time[`${s.id}:${tk}`] = t;
      }

      await setStorage(extensionPage, { trackedSites, trackingData: { visits: {}, time } });
      await waitForLimitsApplied(extensionPage, expectedLimits);

      const res = await checkLimits(extensionPage);
      const overReturned = [...new Set(res.overLimit || [])].sort();

      // Independently compute the expected over-limit set + rule count.
      const expectedOver: string[] = [];
      let expectedRuleCount = 0;
      for (const s of trackedSites) {
        const cap = Number(s.dailyLimitSeconds) || 0;
        const used = time[`${s.id}:${tk}`] || 0;
        if (cap > 0 && used >= cap) {
          expectedOver.push(s.id);
          expectedRuleCount += s.domains.length;
        }
      }
      expectedOver.sort();

      const rules = await getDynamicRules(extensionPage);
      const limitRules = rules.filter((r: any) => r.id >= LIMIT_RULE_ID_BASE);
      const blockRules = rules.filter((r: any) => r.id < LIMIT_RULE_ID_BASE);
      const ctx = `iter ${i} limits=${JSON.stringify(expectedLimits)} time=${JSON.stringify(time)}`;

      // The reported over-limit set must match the independent computation.
      expect(overReturned, ctx).toEqual(expectedOver);

      // Exactly one rule per domain of each over-limit site.
      expect(limitRules.length, ctx).toBe(expectedRuleCount);

      // No duplicate rule ids anywhere.
      const ids = rules.map((r: any) => r.id);
      expect(new Set(ids).size, ctx).toBe(ids.length);

      // Block rules never leak into the limit id range and vice versa.
      for (const r of blockRules) expect(r.id, ctx).toBeLessThan(LIMIT_RULE_ID_BASE);

      // Every limit rule points at the limit block page and belongs to an over-limit site.
      for (const r of limitRules) {
        expect(r.action.redirect.extensionPath, ctx).toContain('reason=limit');
        const belongsToOver = expectedOver.some((id) => {
          const site = trackedSites.find((s) => s.id === id);
          return site.domains.some((d: string) => r.condition.urlFilter.includes(d));
        });
        expect(belongsToOver, ctx).toBe(true);
      }
    }
  });
});
