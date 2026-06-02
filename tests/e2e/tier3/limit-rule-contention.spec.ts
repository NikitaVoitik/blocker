import { test, expect } from '../fixtures/extension';
import { setSiteLimit, checkLimits, getDynamicRules, addBlockedSite, removeBlockedSite } from '../helpers/messaging';
import { setStorage, getBlockedSites } from '../helpers/storage';

const LIMIT_RULE_ID_BASE = 100000;
const ROUNDS = 80;

function todayKey(): string {
  const d = new Date();
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}

const TRACKED = [
  { id: 'reddit', domains: ['reddit.com', 'www.reddit.com', 'old.reddit.com'] },
  { id: 'instagram', domains: ['instagram.com', 'www.instagram.com'] },
  { id: 'facebook', domains: ['facebook.com', 'www.facebook.com', 'web.facebook.com', 'm.facebook.com'] },
  { id: 'linkedin', domains: ['linkedin.com', 'www.linkedin.com'] },
];

// Disposable custom blocked sites toggled to churn the BLOCK rule set (.example never resolves;
// we only ever add/remove them, never navigate to them).
const EXTRA_BLOCKED = [
  { id: 'a.example', label: 'A', domains: ['a.example'] },
  { id: 'b.example', label: 'B', domains: ['b.example', 'www.b.example'] },
  { id: 'c.example', label: 'C', domains: ['c.example'] },
  { id: 'd.example', label: 'D', domains: ['d.example', 'www.d.example'] },
];

test.describe('Tier 3: Limit/Block Rule Contention', () => {
  test('concurrent block + limit rule updates never collide, duplicate, or cross ID ranges', async ({ extensionPage }) => {
    test.setTimeout(20 * 60 * 1000);
    const tk = todayKey();

    for (let r = 0; r < ROUNDS; r++) {
      // Randomize which limited sites are over their cap this round.
      const time: Record<string, number> = {};
      for (const s of TRACKED) time[`${s.id}:${tk}`] = Math.random() < 0.5 ? 999 : 0;
      await setStorage(extensionPage, { trackingData: { visits: {}, time } });

      // Fire a batch that hammers BOTH rule systems at the same time: limit syncs
      // (SET_SITE_LIMIT / CHECK_LIMITS -> syncLimitRules) and block syncs
      // (ADD/REMOVE_BLOCKED_SITE -> syncBlockRules) contend on updateDynamicRules.
      const ops: Promise<any>[] = [];
      for (const s of TRACKED) ops.push(setSiteLimit(extensionPage, s.id, Math.random() < 0.5 ? 60 : 0));
      for (const b of EXTRA_BLOCKED) {
        ops.push(Math.random() < 0.5 ? addBlockedSite(extensionPage, b) : removeBlockedSite(extensionPage, b.id));
      }
      ops.push(checkLimits(extensionPage));
      await Promise.all(ops);

      // Invariants that must hold regardless of how the concurrent updates interleaved:
      const rules = await getDynamicRules(extensionPage);
      const ctx = `round ${r}`;

      const ids = rules.map((rule: any) => rule.id);
      expect(new Set(ids).size, ctx).toBe(ids.length); // no duplicate rule ids

      // The two rule systems must never bleed into each other's ID range:
      // reason=limit  <=>  id >= LIMIT_RULE_ID_BASE.
      for (const rule of rules) {
        const isLimit = ((rule.action.redirect && rule.action.redirect.extensionPath) || '').includes('reason=limit');
        if (isLimit) expect(rule.id, `${ctx} (limit rule)`).toBeGreaterThanOrEqual(LIMIT_RULE_ID_BASE);
        else expect(rule.id, `${ctx} (block rule)`).toBeLessThan(LIMIT_RULE_ID_BASE);
      }
    }

    // After the storm, sequentially restore a known block-list and confirm the block rules
    // converged exactly to the persisted blocked sites (no lost or stranded rules).
    for (const b of EXTRA_BLOCKED) await removeBlockedSite(extensionPage, b.id);
    await checkLimits(extensionPage);

    const blocked = await getBlockedSites(extensionPage);
    const expectedBlockRules = blocked.reduce((sum: number, s: any) => sum + s.domains.length, 0);
    const finalRules = await getDynamicRules(extensionPage);
    const blockRules = finalRules.filter((rule: any) => rule.id < LIMIT_RULE_ID_BASE);
    expect(blockRules.length).toBe(expectedBlockRules);
  });
});
