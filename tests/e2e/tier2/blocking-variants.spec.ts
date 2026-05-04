import { test, expect } from '../fixtures/extension';

async function gotoExpectBlock(page: any, url: string, timeout = 15_000) {
  try {
    await page.goto(url, { waitUntil: 'commit', timeout });
  } catch {
    // declarativeNetRequest redirect may cause ERR_ABORTED
  }
  await expect.poll(() => page.url(), { timeout }).toContain('blocked/blocked.html');
}

test.describe('Tier 2: Blocking Variants', () => {
  // Note: bare x.com is excluded — Chromium resolves it before declarativeNetRequest
  // can intercept, so it's not reliably testable. www.x.com and mobile.x.com work fine.
  const twitterDomains = [
    'https://twitter.com',
    'https://www.twitter.com',
    'https://www.x.com',
    'https://mobile.twitter.com',
    'https://mobile.x.com',
  ];

  for (const domain of twitterDomains) {
    test(`blocks ${domain}`, async ({ context }) => {
      const page = await context.newPage();
      await gotoExpectBlock(page, domain);
      expect(page.url()).toContain('blocked/blocked.html');
      expect(page.url()).toContain('site=twitter');
      await page.close();
    });
  }

  // YouTube Shorts blocking depends on not hitting a consent/region redirect.
  // Verify via rule inspection instead of live navigation.
  test('YouTube Shorts rules exist but regular YouTube is not blocked', async ({ context, extensionPage }) => {
    const rules: any[] = await extensionPage.evaluate(async () => {
      return (chrome as any).declarativeNetRequest.getDynamicRules();
    });
    const shortsRules = rules.filter((r: any) => r.condition.urlFilter.includes('youtube.com/shorts'));
    expect(shortsRules.length).toBeGreaterThan(0);

    // Regular YouTube should NOT be blocked
    const ytPage = await context.newPage();
    await ytPage.goto('https://www.youtube.com', { waitUntil: 'domcontentloaded', timeout: 15_000 });
    expect(ytPage.url()).not.toContain('blocked/blocked.html');
    await ytPage.close();
  });

  test('blocked page shows correct site param in URL', async ({ context }) => {
    const page = await context.newPage();
    await gotoExpectBlock(page, 'https://www.twitter.com/some/path?query=test');
    const url = new URL(page.url());
    expect(url.searchParams.get('site')).toBe('twitter');
    await page.close();
  });

  test('blocked page displays shame content', async ({ context }) => {
    const page = await context.newPage();
    await gotoExpectBlock(page, 'https://twitter.com');

    await page.waitForTimeout(2000);

    const shameText = page.locator('#shame-text');
    await expect(shameText).not.toBeEmpty();

    const attemptCount = page.locator('#attempt-count');
    await expect(attemptCount).toBeVisible();
    await page.close();
  });
});
