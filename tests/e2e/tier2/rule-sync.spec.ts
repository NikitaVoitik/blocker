import { expect, test } from '../fixtures/extension';
import { addBlockedSite, getDynamicRules, removeBlockedSite } from '../helpers/messaging';

const LIMIT_RULE_ID_BASE = 100000;

// Count only always-block (block-range) rules; limit-mode restrictions live in the limit range.
async function blockRuleCount(page: any): Promise<number> {
  const rules = await getDynamicRules(page);
  return rules.filter((r: any) => r.id < LIMIT_RULE_ID_BASE).length;
}

test.describe('Tier 2: Rule Sync', () => {
  test('block rule count matches always-block site domains', async ({ extensionPage }) => {
    const sites: any[] = await extensionPage.evaluate(async () => {
      return new Promise((resolve) => {
        chrome.runtime.sendMessage({ type: 'GET_BLOCKED_SITES' }, resolve);
      });
    });

    // Limit-mode restrictions produce no always-block rule, so exclude them from the expectation.
    const expectedRuleCount = sites
      .filter((s) => s.mode !== 'limit')
      .reduce((sum: number, site: any) => sum + site.domains.length, 0);

    expect(await blockRuleCount(extensionPage)).toBe(expectedRuleCount);
  });

  test('adding a site creates new rules immediately', async ({ extensionPage }) => {
    const before = await blockRuleCount(extensionPage);

    const site = {
      id: 'test-sync.com',
      label: 'Test Sync',
      domains: ['test-sync.com', 'www.test-sync.com'],
    };
    await addBlockedSite(extensionPage, site);

    await expect.poll(() => blockRuleCount(extensionPage), { timeout: 5000 }).toBe(before + 2);

    await removeBlockedSite(extensionPage, 'test-sync.com');
  });

  test('removing a site removes its rules', async ({ extensionPage }) => {
    const before = await blockRuleCount(extensionPage);

    const site = { id: 'remove-test.com', label: 'Remove Test', domains: ['remove-test.com'] };
    await addBlockedSite(extensionPage, site);

    await expect.poll(() => blockRuleCount(extensionPage), { timeout: 5000 }).toBe(before + 1);

    await removeBlockedSite(extensionPage, 'remove-test.com');

    await expect.poll(() => blockRuleCount(extensionPage), { timeout: 5000 }).toBe(before);
  });
});
