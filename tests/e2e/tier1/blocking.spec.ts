import { test, expect, webURL } from '../fixtures/extension';
import { addBlockedSite, removeBlockedSite } from '../helpers/messaging';
import { expectBlocked } from '../helpers/navigation';

test.describe('Tier 1: Blocking', () => {
  test('extension loads with default blocked sites', async ({ extensionPage }) => {
    const sites = await extensionPage.evaluate(async () => {
      return new Promise<any[]>((resolve) => {
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
    await expectBlocked(page, 'https://www.twitter.com', 'twitter');
    expect(page.url()).toContain(`chrome-extension://${extensionId}/blocked/blocked.html`);
    expect(page.url()).toContain('site=twitter');
    await page.close();
  });

  test('adding a custom site blocks it', async ({ context, extensionPage }) => {
    const site = { id: 'example.com', label: 'Example', domains: ['example.com', 'www.example.com'] };
    const result = await addBlockedSite(extensionPage, site);
    expect(result.success).toBe(true);

    const page = await context.newPage();
    await expectBlocked(page, 'https://example.com', 'example.com');
    expect(page.url()).toContain('site=example.com');
    await page.close();

    await removeBlockedSite(extensionPage, 'example.com');
  });

  test('removing a blocked site allows access', async ({ context, extensionPage }) => {
    const result = await removeBlockedSite(extensionPage, 'twitter');
    expect(result.success).toBe(true);

    const page = await context.newPage();
    await page.goto(webURL('https://www.twitter.com'));
    await expect(page.locator('h1')).toHaveText('Test page');

    await page.close();
  });

  test('non-blocked sites load normally', async ({ context }) => {
    const page = await context.newPage();
    await page.goto(webURL('https://www.google.com'), { waitUntil: 'domcontentloaded', timeout: 15_000 });
    await expect(page.locator('h1')).toHaveText('Test page');
    await page.close();
  });
});
