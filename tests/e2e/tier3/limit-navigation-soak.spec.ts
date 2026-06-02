import { test, expect } from '../fixtures/extension';
import { addTrackedSite, setSiteLimit, checkLimits, getDynamicRules } from '../helpers/messaging';
import { setStorage } from '../helpers/storage';

const LIMIT_RULE_ID_BASE = 100000;
const ITERATIONS = 40;

function todayKey(): string {
  const d = new Date();
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}

async function exampleLimitRuleExists(page: any): Promise<boolean> {
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

test.describe('Tier 3: Daily Limit Navigation Soak', () => {
  test('an over-limit site stays blocked across many visits without leaking to other sites', async ({ context, extensionPage }) => {
    test.setTimeout(20 * 60 * 1000);

    // example.com: tracked, limited, and already over. example.org: never tracked/limited (control).
    await addTrackedSite(extensionPage, { id: 'example.com', label: 'Example', domains: ['example.com', 'www.example.com'] });
    await setSiteLimit(extensionPage, 'example.com', 60);
    await setStorage(extensionPage, { trackingData: { visits: {}, time: { [`example.com:${todayKey()}`]: 300 } } });
    await checkLimits(extensionPage);
    await expect.poll(() => exampleLimitRuleExists(extensionPage), { timeout: 5000 }).toBe(true);

    const page = await context.newPage();
    let blockedVisits = 0;
    let allowedVisits = 0;

    for (let i = 0; i < ITERATIONS; i++) {
      // Periodically re-run enforcement to prove repeated syncs don't drop the rule.
      if (i % 5 === 4) await checkLimits(extensionPage);

      if (Math.random() < 0.5) {
        // Limited + over: must be blocked on every single visit.
        await gotoExpectBlock(page, 'https://example.com');
        expect(page.url(), `iter ${i} (limited)`).toContain('reason=limit');
        expect(page.url(), `iter ${i} (limited)`).toContain('site=example.com');
        blockedVisits++;
      } else {
        // Never limited: must never be redirected to the block page.
        await page.goto('https://example.org', { waitUntil: 'domcontentloaded', timeout: 15_000 }).catch(() => {});
        await page.waitForTimeout(300);
        expect(page.url(), `iter ${i} (control)`).not.toContain('blocked/blocked.html');
        expect(page.url(), `iter ${i} (control)`).toContain('example.org');
        allowedVisits++;
      }
    }

    // The rule must still be in place after the whole soak.
    expect(await exampleLimitRuleExists(extensionPage)).toBe(true);
    // Sanity: the random walk actually exercised both branches.
    expect(blockedVisits, 'expected at least one blocked visit').toBeGreaterThan(0);
    expect(allowedVisits, 'expected at least one allowed visit').toBeGreaterThan(0);

    await page.close();
  });
});
