import { test, expect } from '../fixtures/extension';
import { addBlockedSite, removeBlockedSite } from '../helpers/messaging';

test.describe('Tier 2: Rule Sync', () => {
  test('dynamic rules count matches blocked site domains', async ({ extensionPage }) => {
    const sites: any[] = await extensionPage.evaluate(async () => {
      return new Promise((resolve) => {
        chrome.runtime.sendMessage({ type: 'GET_BLOCKED_SITES' }, resolve);
      });
    });

    const expectedRuleCount = sites.reduce((sum: number, site: any) => sum + site.domains.length, 0);

    const actualRuleCount: number = await extensionPage.evaluate(async () => {
      const rules = await chrome.declarativeNetRequest.getDynamicRules();
      return rules.length;
    });

    expect(actualRuleCount).toBe(expectedRuleCount);
  });

  test('adding a site creates new rules immediately', async ({ extensionPage }) => {
    const before: number = await extensionPage.evaluate(async () => {
      const rules = await chrome.declarativeNetRequest.getDynamicRules();
      return rules.length;
    });

    const site = { id: 'test-sync.com', label: 'Test Sync', domains: ['test-sync.com', 'www.test-sync.com'] };
    await addBlockedSite(extensionPage, site);

    await expect.poll(async () => {
      const rules = await extensionPage.evaluate(async () => {
        const r = await chrome.declarativeNetRequest.getDynamicRules();
        return r.length;
      });
      return rules;
    }, { timeout: 5000 }).toBe(before + 2);

    await removeBlockedSite(extensionPage, 'test-sync.com');
  });

  test('removing a site removes its rules', async ({ extensionPage }) => {
    const before: number = await extensionPage.evaluate(async () => {
      const rules = await chrome.declarativeNetRequest.getDynamicRules();
      return rules.length;
    });

    const site = { id: 'remove-test.com', label: 'Remove Test', domains: ['remove-test.com'] };
    await addBlockedSite(extensionPage, site);

    await expect.poll(async () => {
      const rules = await extensionPage.evaluate(async () => {
        const r = await chrome.declarativeNetRequest.getDynamicRules();
        return r.length;
      });
      return rules;
    }, { timeout: 5000 }).toBe(before + 1);

    await removeBlockedSite(extensionPage, 'remove-test.com');

    await expect.poll(async () => {
      const rules = await extensionPage.evaluate(async () => {
        const r = await chrome.declarativeNetRequest.getDynamicRules();
        return r.length;
      });
      return rules;
    }, { timeout: 5000 }).toBe(before);
  });
});
