import { test, expect } from '../fixtures/extension';
import { getTrackingDataForToday } from '../helpers/messaging';
import { clearStorage } from '../helpers/storage';

const WALK_DURATION_MS = 60 * 60 * 1000; // 1 hour
const BLOCKED_URLS = ['https://twitter.com', 'https://x.com'];
const TRACKED_URLS = ['https://www.reddit.com', 'https://www.instagram.com', 'https://www.facebook.com'];
const NEUTRAL_URLS = ['https://www.google.com', 'https://www.wikipedia.org', 'https://www.github.com'];
const ALL_URLS = [...BLOCKED_URLS, ...TRACKED_URLS, ...NEUTRAL_URLS];

function randomChoice<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

test.describe('Tier 3: Random Walk', () => {
  test('data consistency after random navigation patterns', async ({ context, extensionId, extensionPage }) => {
    test.setTimeout(WALK_DURATION_MS + 5 * 60 * 1000);

    await clearStorage(extensionPage);
    await extensionPage.waitForTimeout(500);

    const startTime = Date.now();
    const openPages: { page: any; url: string }[] = [];
    let blockedRedirectCount = 0;

    while (Date.now() - startTime < WALK_DURATION_MS) {
      const action = randomInt(1, 5);

      switch (action) {
        case 1: {
          if (openPages.length < 10) {
            const url = randomChoice(ALL_URLS);
            const page = await context.newPage();
            try {
              await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 15_000 });
              if (page.url().includes('blocked/blocked.html')) {
                blockedRedirectCount++;
              }
            } catch (e) {
              // Navigation timeout is acceptable
            }
            openPages.push({ page, url });
          }
          break;
        }
        case 2: {
          if (openPages.length > 1) {
            const idx = randomInt(0, openPages.length - 1);
            const { page } = openPages.splice(idx, 1)[0];
            await page.close().catch(() => {});
          }
          break;
        }
        case 3: {
          if (openPages.length > 0) {
            const { page } = randomChoice(openPages);
            await page.bringToFront().catch(() => {});
          }
          break;
        }
        case 4: {
          if (openPages.length > 0) {
            const idx = randomInt(0, openPages.length - 1);
            const url = randomChoice(ALL_URLS);
            try {
              await openPages[idx].page.goto(url, { waitUntil: 'domcontentloaded', timeout: 15_000 });
              openPages[idx].url = url;
              if (openPages[idx].page.url().includes('blocked/blocked.html')) {
                blockedRedirectCount++;
              }
            } catch (e) {
              // Navigation timeout is acceptable
            }
          }
          break;
        }
        case 5: {
          await extensionPage.waitForTimeout(randomInt(500, 3000));
          break;
        }
      }

      await extensionPage.waitForTimeout(randomInt(100, 1000));
    }

    await extensionPage.bringToFront();
    await extensionPage.waitForTimeout(3000);

    for (const { page } of openPages) {
      await page.close().catch(() => {});
    }

    const data = await getTrackingDataForToday(extensionPage);

    for (const [siteId, stats] of Object.entries(data) as [string, any][]) {
      expect(stats.time).toBeGreaterThanOrEqual(0);
      expect(stats.visits).toBeGreaterThanOrEqual(0);
      const maxPossibleSeconds = Math.ceil((Date.now() - startTime) / 1000);
      expect(stats.time).toBeLessThanOrEqual(maxPossibleSeconds);
    }

    expect(blockedRedirectCount).toBeGreaterThan(0);
  });
});
