import { expect, test } from '../fixtures/extension';
import { addBlockedSite, checkLimits, getDynamicRules } from '../helpers/messaging';
import { setStorage } from '../helpers/storage';

const LIMIT_RULE_ID_BASE = 100000;
const ITERATIONS = 40;

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

async function exampleLimitRuleExists(page: any): Promise<boolean> {
  const rules = await getDynamicRules(page);
  return rules.some(
    (r: any) => r.id >= LIMIT_RULE_ID_BASE && r.condition.urlFilter.includes('example.com'),
  );
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
  test('an over-limit site stays blocked across many visits without leaking to other sites', async ({
    context,
    extensionPage,
  }) => {
    test.setTimeout(20 * 60 * 1000);

    // example.com: a limit restriction already over its cap. example.org: never restricted (control).
    await addBlockedSite(extensionPage, {
      id: 'example.com',
      label: 'Example',
      domains: ['example.com', 'www.example.com'],
      mode: 'limit',
      dailyLimitSeconds: 60,
    });
    await setStorage(extensionPage, {
      trackingData: { visits: {}, time: { [`example.com:${todayKey()}`]: 300 } },
    });
    await checkLimits(extensionPage);
    await expect.poll(() => exampleLimitRuleExists(extensionPage), { timeout: 5000 }).toBe(true);

    let blockedVisits = 0;
    let allowedVisits = 0;

    for (let i = 0; i < ITERATIONS; i++) {
      if (i % 5 === 4) await checkLimits(extensionPage);

      // Fresh page each visit — avoids stale-URL races from alternating blocked/real navigations.
      const page = await context.newPage();
      if (Math.random() < 0.5) {
        await gotoExpectBlock(page, 'https://example.com');
        expect(page.url(), `iter ${i} (limited)`).toContain('reason=limit');
        expect(page.url(), `iter ${i} (limited)`).toContain('site=example.com');
        blockedVisits++;
      } else {
        await page
          .goto('https://example.org', { waitUntil: 'domcontentloaded', timeout: 15_000 })
          .catch(() => {});
        await page.waitForTimeout(200);
        // The invariant: a never-restricted site is never redirected to the block page.
        expect(page.url(), `iter ${i} (control)`).not.toContain('blocked/blocked.html');
        allowedVisits++;
      }
      await page.close();
    }

    expect(await exampleLimitRuleExists(extensionPage)).toBe(true);
    expect(blockedVisits, 'expected at least one blocked visit').toBeGreaterThan(0);
    expect(allowedVisits, 'expected at least one allowed visit').toBeGreaterThan(0);
  });
});
