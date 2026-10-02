import { expect, webURL, type Page } from '../fixtures/extension';

export async function expectBlocked(page: Page, url: string, siteId?: string) {
  // A failed visit must not inherit a previous block page and falsely pass.
  await page.goto('about:blank');
  // Chrome can abort the original request while redirecting it through DNR.
  await page.goto(webURL(url)).catch(error => {
    if (!error.message.includes('net::ERR_ABORTED')) throw error;
  });
  await expect(page).toHaveURL(url => url.protocol === 'chrome-extension:'
    && url.pathname === '/blocked/blocked.html'
    && (siteId === undefined || url.searchParams.get('site') === siteId));
  await expect(page.locator('h1')).toHaveText('BLOCKED');
}
