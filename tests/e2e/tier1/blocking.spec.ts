import { test, expect } from '../fixtures/extension';
import { addBlockedSite, removeBlockedSite } from '../helpers/messaging';

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
    await page.goto('https://twitter.com');
    await page.waitForURL(url => url.toString().includes('blocked/blocked.html'));
    expect(page.url()).toContain(`chrome-extension://${extensionId}/blocked/blocked.html`);
    expect(page.url()).toContain('site=twitter');
    await page.close();
  });

  test('visiting x.com variant also redirects', async ({ context, extensionId }) => {
    const page = await context.newPage();
    await page.goto('https://x.com');
    await page.waitForURL(url => url.toString().includes('blocked/blocked.html'));
    expect(page.url()).toContain('blocked/blocked.html');
    await page.close();
  });

  test('adding a custom site blocks it', async ({ context, extensionId, extensionPage }) => {
    const site = { id: 'example.com', label: 'Example', domains: ['example.com', 'www.example.com'] };
    const result = await addBlockedSite(extensionPage, site);
    expect(result.success).toBe(true);

    await extensionPage.waitForTimeout(500);

    const page = await context.newPage();
    await page.goto('https://example.com');
    await page.waitForURL(url => url.toString().includes('blocked/blocked.html'), { timeout: 10_000 });
    expect(page.url()).toContain('site=example.com');
    await page.close();

    await removeBlockedSite(extensionPage, 'example.com');
  });

  test('removing a blocked site allows access', async ({ context, extensionPage }) => {
    await removeBlockedSite(extensionPage, 'twitter');
    await extensionPage.waitForTimeout(500);

    const page = await context.newPage();
    const response = await page.goto('https://twitter.com', { waitUntil: 'domcontentloaded', timeout: 15_000 });
    expect(page.url()).not.toContain('blocked/blocked.html');
    await page.close();

    const site = {
      id: 'twitter',
      label: 'Twitter / X',
      domains: ['twitter.com', 'x.com', 'www.twitter.com', 'www.x.com', 'mobile.twitter.com', 'mobile.x.com'],
      builtin: true
    };
    await addBlockedSite(extensionPage, site);
  });

  test('non-blocked sites load normally', async ({ context }) => {
    const page = await context.newPage();
    await page.goto('https://www.google.com', { waitUntil: 'domcontentloaded', timeout: 15_000 });
    expect(page.url()).toContain('google.com');
    expect(page.url()).not.toContain('blocked/blocked.html');
    await page.close();
  });
});
