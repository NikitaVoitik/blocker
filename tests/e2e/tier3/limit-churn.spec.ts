import { test, expect } from '../fixtures/extension';
import { setSiteLimit, checkLimits, getDynamicRules } from '../helpers/messaging';
import { setStorage } from '../helpers/storage';

const LIMIT_RULE_ID_BASE = 100000;
const ITERATIONS = 150;

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

test.describe('Tier 3: Daily Limit Churn', () => {
  test('rapid set/clear toggling via SET_SITE_LIMIT never orphans limit rules', async ({ extensionPage }) => {
    test.setTimeout(20 * 60 * 1000);
    const tk = todayKey();

    for (let i = 0; i < ITERATIONS; i++) {
      // Phase 1: clear every limit. Afterward there must be ZERO limit rules — a leftover
      // rule here is an orphan (the bug class this soak hunts).
      for (const s of SITES) await setSiteLimit(extensionPage, s.id, 0);
      await setStorage(extensionPage, { trackingData: { visits: {}, time: {} } });
      await checkLimits(extensionPage);

      let rules = await getDynamicRules(extensionPage);
      expect(rules.filter((r: any) => r.id >= LIMIT_RULE_ID_BASE).length, `iter ${i} after clear-all`).toBe(0);

      // Phase 2: set a limit on a random subset and push each over its cap.
      const chosen = SITES.filter(() => Math.random() < 0.5);
      const time: Record<string, number> = {};
      let expectedDomains = 0;
      for (const s of chosen) {
        await setSiteLimit(extensionPage, s.id, 60);
        time[`${s.id}:${tk}`] = 60 + Math.floor(Math.random() * 240); // over the 60s cap
        expectedDomains += s.domains.length;
      }
      await setStorage(extensionPage, { trackingData: { visits: {}, time } });
      await checkLimits(extensionPage);

      rules = await getDynamicRules(extensionPage);
      const limitRules = rules.filter((r: any) => r.id >= LIMIT_RULE_ID_BASE);
      const ctx = `iter ${i} chosen=${JSON.stringify(chosen.map((s) => s.id))}`;

      // Exactly one rule per domain of each chosen (over-limit) site — no more, no fewer.
      expect(limitRules.length, ctx).toBe(expectedDomains);

      const ids = rules.map((r: any) => r.id);
      expect(new Set(ids).size, ctx).toBe(ids.length); // no duplicate ids

      for (const r of limitRules) {
        expect(r.action.redirect.extensionPath, ctx).toContain('reason=limit');
        const belongsToChosen = chosen.some((s) => s.domains.some((d) => r.condition.urlFilter.includes(d)));
        expect(belongsToChosen, ctx).toBe(true);
      }
    }
  });
});
