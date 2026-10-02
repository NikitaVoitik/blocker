import { test, expect, webURL } from '../fixtures/extension';
import { addBlockedSite } from '../helpers/messaging';
import { expectBlocked } from '../helpers/navigation';

// Tier 1 owns add/remove navigation. This suite owns alarm repair and concurrent mutations.
test('the verification alarm repairs changed rules even when their count is unchanged', async ({ context, extensionPage }) => {
  await extensionPage.evaluate(async () => {
    const rules = await chrome.declarativeNetRequest.getDynamicRules();
    await chrome.declarativeNetRequest.updateDynamicRules({
      removeRuleIds: rules.map(rule => rule.id),
      addRules: rules.map(rule => ({ ...rule, condition: { requestDomains: ['wrong.test'], resourceTypes: ['main_frame'] } })),
    });
    await chrome.alarms.create('verify-block-rules', { when: Date.now() + 100 });
  });
  await expect.poll(async () => extensionPage.evaluate(async () => {
    const rules = await chrome.declarativeNetRequest.getDynamicRules();
    return rules.some(rule => rule.condition.requestDomains?.includes('twitter.com'));
  })).toBe(true);
  const page = await context.newPage();
  await page.goto(webURL('http://unlisted.twitter.com/')).catch(() => {});
  await expect(page).toHaveURL(/blocked\/blocked.html\?site=twitter/);
});

test('concurrent additions retain every site and enforce every block', async ({ context, extensionPage }) => {
  const hosts = Array.from({ length: 10 }, (_, i) => `parallel-${i}.test`);
  const results = await Promise.all(hosts.map(host => addBlockedSite(extensionPage, { id: host, label: host, domains: [host] })));
  expect(results.every(result => result.success)).toBe(true);
  const page = await context.newPage();
  for (const host of hosts) {
    await expectBlocked(page, `http://${host}/`, host);
  }
});
