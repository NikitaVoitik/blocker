import { test, expect } from '../fixtures/extension';
import { addBlockedSite, removeBlockedSite } from '../helpers/messaging';

async function gotoExpectBlock(page: any, url: string, timeout = 15_000) {
  try {
    await page.goto(url, { waitUntil: 'commit', timeout });
  } catch {
    // declarativeNetRequest redirect may cause ERR_ABORTED
  }
  // Poll page.url() — avoids execution context issues during redirect
  await expect.poll(() => page.url(), { timeout }).toContain('blocked/blocked.html');
}

test.describe('Tier 1: Blocking', () => {
  test('extension loads with default blocked sites', async ({ extensionPage }) => {
    const sites = await extensionPage.evaluate(async () => {
      return new Promise((resolve) => {
        chrome.runtime.sendMessage({ type: 'GET_BLOCKED_SITES' }, resolve);
      });
    });
    expect(Array.isArray(sites)).toBe(true);
    expect(sites.length).toBeGreaterThan(0);
    const ids = sites.map((s: any) => s.id);
    expect(ids).toContain('twitter');
    expect(ids).toContain('youtube-shorts');
  });

  test('visiting a blocked site redirects to blocked page', async ({ context, extensionId }) => {
    const page = await context.newPage();
    await gotoExpectBlock(page, 'https://www.twitter.com');
    expect(page.url()).toContain(`chrome-extension://${extensionId}/blocked/blocked.html`);
    expect(page.url()).toContain('site=twitter');
    await page.close();
  });

  test('visiting www.twitter.com variant also redirects', async ({ context }) => {
    const page = await context.newPage();
    await gotoExpectBlock(page, 'https://www.twitter.com');
    expect(page.url()).toContain('blocked/blocked.html');
    await page.close();
  });

  test('adding a custom site blocks it', async ({ context, extensionPage }) => {
    const site = { id: 'example.com', label: 'Example', domains: ['example.com', 'www.example.com'] };
    const result = await addBlockedSite(extensionPage, site);
    expect(result.success).toBe(true);

    await expect.poll(async () => {
      const rules: any[] = await extensionPage.evaluate(async () => {
        return (chrome as any).declarativeNetRequest.getDynamicRules();
      });
      return rules.some((r: any) => r.condition.urlFilter.includes('example.com'));
    }, { timeout: 5000 }).toBe(true);

    const page = await context.newPage();
    await gotoExpectBlock(page, 'https://example.com');
    expect(page.url()).toContain('site=example.com');
    await page.close();

    await removeBlockedSite(extensionPage, 'example.com');
  });

  test('removing a blocked site allows access', async ({ context, extensionPage }) => {
    const result = await removeBlockedSite(extensionPage, 'twitter');
    expect(result.success).toBe(true);

    // Wait for rules to sync, then verify they're actually gone
    await expect.poll(async () => {
      const rules: any[] = await extensionPage.evaluate(async () => {
        return (chrome as any).declarativeNetRequest.getDynamicRules();
      });
      return rules.some((r: any) =>
        r.condition.urlFilter.includes('twitter.com') || r.condition.urlFilter.includes('x.com')
      );
    }, { timeout: 5000 }).toBe(false);

    const page = await context.newPage();
    await page.goto('https://www.twitter.com', { waitUntil: 'domcontentloaded', timeout: 15_000 }).catch(() => {});
    await page.waitForTimeout(3000);
    expect(page.url()).not.toContain('blocked/blocked.html');
    await page.close();

    // Re-add twitter
    const site = {
      id: 'twitter',
      label: 'Twitter / X',
      domains: ['twitter.com', 'x.com', 'www.twitter.com', 'www.x.com', 'mobile.twitter.com', 'mobile.x.com'],
      builtin: true
    };
    await addBlockedSite(extensionPage, site);
    await expect.poll(async () => {
      const rules: any[] = await extensionPage.evaluate(async () => {
        return (chrome as any).declarativeNetRequest.getDynamicRules();
      });
      return rules.some((r: any) => r.condition.urlFilter.includes('twitter.com'));
    }, { timeout: 5000 }).toBe(true);
  });

  test('non-blocked sites load normally', async ({ context }) => {
    const page = await context.newPage();
    await page.goto('https://www.google.com', { waitUntil: 'domcontentloaded', timeout: 15_000 });
    expect(page.url()).toContain('google.com');
    expect(page.url()).not.toContain('blocked/blocked.html');
    await page.close();
  });
});
