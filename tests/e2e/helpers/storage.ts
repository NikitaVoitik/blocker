import { type Page } from '@playwright/test';

export async function getStorage(page: Page, keys: string | string[]): Promise<Record<string, any>> {
  return page.evaluate(async (k) => {
    return chrome.storage.local.get(k);
  }, keys);
}

export async function setStorage(page: Page, data: Record<string, any>): Promise<void> {
  await page.evaluate(async (d) => {
    await chrome.storage.local.set(d);
  }, data);
}

export async function clearStorage(page: Page): Promise<void> {
  await page.evaluate(async () => {
    await chrome.storage.local.clear();
  });
}

export async function getTrackingData(page: Page): Promise<{ visits: Record<string, number>; time: Record<string, number> }> {
  const result = await getStorage(page, 'trackingData');
  return result.trackingData || { visits: {}, time: {} };
}

export async function getBlockedSites(page: Page): Promise<any[]> {
  const result = await getStorage(page, 'blockedSites');
  return result.blockedSites || [];
}
