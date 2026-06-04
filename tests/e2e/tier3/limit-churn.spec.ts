import { expect, test } from '../fixtures/extension';
import {
  addBlockedSite,
  checkLimits,
  getDynamicRules,
  setSiteRestriction,
} from '../helpers/messaging';
import { setStorage } from '../helpers/storage';

const LIMIT_RULE_ID_BASE = 100000;
const ITERATIONS = 150;

function todayKey(): string {
  const d = new Date();
  return (
    d.getFullYear() +
    '-' +
    String(d.getMonth() + 1).padStart(2, '0') +
    '-' +
    String(d.getDate()).padStart(2, '0')
  );
}

const SITES = [
  { id: 'reddit', domains: ['reddit.com', 'www.reddit.com', 'old.reddit.com'] },
  { id: 'instagram', domains: ['instagram.com', 'www.instagram.com'] },
  {
    id: 'facebook',
    domains: ['facebook.com', 'www.facebook.com', 'web.facebook.com', 'm.facebook.com'],
  },
  { id: 'linkedin', domains: ['linkedin.com', 'www.linkedin.com'] },
  { id: 'pinterest', domains: ['pinterest.com', 'www.pinterest.com'] },
  { id: 'tiktok', domains: ['tiktok.com', 'www.tiktok.com'] },
];

test.describe('Tier 3: Daily Limit Churn', () => {
  test('rapid set/clear toggling via SET_SITE_RESTRICTION never orphans limit rules', async ({
    extensionPage,
  }) => {
    test.setTimeout(20 * 60 * 1000);
    const tk = todayKey();

    for (let i = 0; i < ITERATIONS; i++) {
      // Phase 1: clear every restriction (mode 'off'). Afterward there must be ZERO limit rules.
      for (const s of SITES) await setSiteRestriction(extensionPage, s.id, 'off');
      await setStorage(extensionPage, { trackingData: { visits: {}, time: {} } });
      await checkLimits(extensionPage);

      let rules = await getDynamicRules(extensionPage);
      expect(
        rules.filter((r: any) => r.id >= LIMIT_RULE_ID_BASE).length,
        `iter ${i} after clear-all`,
      ).toBe(0);

      // Phase 2: (re)create a limit restriction on a random subset and push each over its cap.
      // Use ADD_BLOCKED_SITE (carries domains) since a cleared site is in neither list.
      const chosen = SITES.filter(() => Math.random() < 0.5);
      const time: Record<string, number> = {};
      let expectedDomains = 0;
      for (const s of chosen) {
        await addBlockedSite(extensionPage, {
          id: s.id,
          label: s.id,
          domains: s.domains,
          mode: 'limit',
          dailyLimitSeconds: 60,
        });
        time[`${s.id}:${tk}`] = 60 + Math.floor(Math.random() * 240); // over the 60s cap
        expectedDomains += s.domains.length;
      }
      await setStorage(extensionPage, { trackingData: { visits: {}, time } });
      await checkLimits(extensionPage);

      rules = await getDynamicRules(extensionPage);
      const limitRules = rules.filter((r: any) => r.id >= LIMIT_RULE_ID_BASE);
      const ctx = `iter ${i} chosen=${JSON.stringify(chosen.map((s) => s.id))}`;

      expect(limitRules.length, ctx).toBe(expectedDomains);

      const ids = rules.map((r: any) => r.id);
      expect(new Set(ids).size, ctx).toBe(ids.length);

      for (const r of limitRules) {
        expect(r.action.redirect.extensionPath, ctx).toContain('reason=limit');
        const belongsToChosen = chosen.some((s) =>
          s.domains.some((d) => r.condition.urlFilter.includes(d)),
        );
        expect(belongsToChosen, ctx).toBe(true);
      }
    }
  });
});
