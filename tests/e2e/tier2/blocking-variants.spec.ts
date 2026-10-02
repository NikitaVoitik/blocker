import { test, expect } from '../fixtures/extension';
import { expectBlocked } from '../helpers/navigation';

test.describe('Tier 2: Blocking Variants', () => {
  const twitterDomains = [
    'https://twitter.com',
    'https://x.com',
    'https://www.twitter.com',
    'https://www.x.com',
    'https://mobile.twitter.com',
    'https://mobile.x.com',
  ];

  for (const domain of twitterDomains) {
    test(`blocks ${domain}`, async ({ context }) => {
      const page = await context.newPage();
      await expectBlocked(page, domain, 'twitter');
      expect(page.url()).toContain('blocked/blocked.html');
      expect(page.url()).toContain('site=twitter');
      await page.close();
    });
  }

  test('blocked page shows correct site param in URL', async ({ context }) => {
    const page = await context.newPage();
    await expectBlocked(page, 'https://www.twitter.com/some/path?query=test', 'twitter');
    const url = new URL(page.url());
    expect(url.searchParams.get('site')).toBe('twitter');
    await page.close();
  });

  test('blocked page displays shame content', async ({ context }) => {
    const page = await context.newPage();
    await expectBlocked(page, 'https://mobile.twitter.com', 'twitter');

    await page.waitForTimeout(2000);

    const shameText = page.locator('#shame-text');
    await expect(shameText).not.toBeEmpty();

    const attemptCount = page.locator('#attempt-count');
    await expect(attemptCount).toBeVisible();
    await page.close();
  });
});
