import { test, expect, webURL, type Page } from '../fixtures/extension';
import { getStats, getTrackingDataForToday } from '../helpers/messaging';

// Fixed seed makes a failing navigation sequence reproducible.
let seed = 73421;
function choice(n: number) { seed = (seed * 1664525 + 1013904223) >>> 0; return seed % n; }
const hosts = ['twitter.com', 'x.com', 'reddit.com', 'instagram.com', 'neutral.test'];
test('seeded navigation, tab closing and switching preserve attempts and visits', async ({ context, extensionPage }) => {
  seed = 73421;
  const pages: Page[] = [];
  let attempts = 0;
  const expectedVisits: Record<string, number> = { reddit: 0, instagram: 0 };
  const start = Date.now();
  for (let step = 0; step < 100; step++) {
    const action = choice(4);
    if (action === 0 && pages.length > 1) {
      await pages.splice(choice(pages.length), 1)[0].close();
    } else if (action === 1 && pages.length > 0) {
      await pages[choice(pages.length)].bringToFront();
    } else {
      const page = pages.length === 0 || pages.length < 5 && action === 2 ? await context.newPage() : pages[choice(pages.length)];
      if (!pages.includes(page)) pages.push(page);
      const host = hosts[choice(hosts.length)];
      await page.goto(webURL(`http://${host}/`)).catch(error => {
        if (!['twitter.com', 'x.com'].includes(host)) throw error;
      });
      if (['twitter.com', 'x.com'].includes(host)) {
        await expect(page).toHaveURL(/blocked\/blocked.html\?site=twitter/);
        await expect(page.locator('h1')).toHaveText('BLOCKED');
        attempts++;
      } else {
        await expect(page.locator('h1')).toHaveText('Test page');
        if (host === 'reddit.com') expectedVisits.reddit++;
        if (host === 'instagram.com') expectedVisits.instagram++;
      }
    }
    await extensionPage.waitForTimeout(30);
  }
  await extensionPage.bringToFront();
  await expect.poll(async () => (await getStats(extensionPage)).allTimeCount).toBe(attempts);
  await expect.poll(async () => {
    const data = await getTrackingDataForToday(extensionPage);
    return { reddit: data.reddit.visits, instagram: data.instagram.visits };
  }).toEqual(expectedVisits);
  const data = await getTrackingDataForToday(extensionPage);
  const total = Object.values(data).reduce((sum: number, site: any) => sum + site.time, 0);
  expect(total).toBeLessThanOrEqual((Date.now() - start) / 1000 + 0.5);
  expect(attempts).toBeGreaterThan(0);
});
