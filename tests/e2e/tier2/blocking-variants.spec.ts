import { test, expect } from '../fixtures/extension';

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
    test(`blocks ${domain}`, async ({ context, extensionId }) => {
      const page = await context.newPage();
      await page.goto(domain);
      await page.waitForURL(url => url.toString().includes('blocked/blocked.html'), { timeout: 15_000 });
      expect(page.url()).toContain('blocked/blocked.html');
      expect(page.url()).toContain('site=twitter');
      await page.close();
    });
  }

  test('blocks YouTube Shorts path but not regular YouTube', async ({ context, extensionId }) => {
    const shortsPage = await context.newPage();
    await shortsPage.goto('https://www.youtube.com/shorts/abc123');
    await shortsPage.waitForURL(url => url.toString().includes('blocked/blocked.html'), { timeout: 15_000 });
    expect(shortsPage.url()).toContain('site=youtube-shorts');
    await shortsPage.close();

    const ytPage = await context.newPage();
    await ytPage.goto('https://www.youtube.com', { waitUntil: 'domcontentloaded', timeout: 15_000 });
    expect(ytPage.url()).not.toContain('blocked/blocked.html');
    await ytPage.close();
  });

  test('blocked page shows correct site param in URL', async ({ context, extensionId }) => {
    const page = await context.newPage();
    await page.goto('https://x.com/some/path?query=test');
    await page.waitForURL(url => url.toString().includes('blocked/blocked.html'), { timeout: 15_000 });
    const url = new URL(page.url());
    expect(url.searchParams.get('site')).toBe('twitter');
    await page.close();
  });

  test('blocked page displays shame content', async ({ context, extensionId }) => {
    const page = await context.newPage();
    await page.goto('https://twitter.com');
    await page.waitForURL(url => url.toString().includes('blocked/blocked.html'), { timeout: 15_000 });

    await page.waitForTimeout(2000);

    const shameText = page.locator('#shame-text');
    await expect(shameText).not.toBeEmpty();

    const attemptCount = page.locator('#attempt-count');
    await expect(attemptCount).toBeVisible();
    await page.close();
  });
});
