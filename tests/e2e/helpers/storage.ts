import type { Page } from '@playwright/test';

export async function getStorage(
  page: Page,
  keys: string | string[],
): Promise<Record<string, any>> {
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

export async function getTrackingData(
  page: Page,
): Promise<{ visits: Record<string, number>; time: Record<string, number> }> {
  const result = await getStorage(page, 'trackingData');
  return result.trackingData || { visits: {}, time: {} };
}

export async function getBlockedSites(page: Page): Promise<any[]> {
  const result = await getStorage(page, 'blockedSites');
  return result.blockedSites || [];
}

function todayKey(): string {
  const d = new Date();
  return (
    d.getFullYear() +
    '-' +
    String(d.getMonth() + 1).padStart(2, '0') +
    '-' +
    String(d.getDate()).padStart(2, '0')
  );
}

// Upsert a limit-mode restriction onto the blocked list and seed today's usage in one storage
// write (bypasses the 60s message-API floor so tests can use tiny caps). Preserves other entries.
export async function seedLimitRestriction(
  page: Page,
  opts: {
    id: string;
    label?: string;
    domains: string[];
    pathOnly?: boolean;
    capSeconds: number;
    usedSeconds?: number;
  },
): Promise<void> {
  await page.evaluate(
    async (o) => {
      const cur = (await chrome.storage.local.get('blockedSites')).blockedSites || [];
      const blocked = cur.filter((s: any) => s.id !== o.id);
      blocked.push({
        id: o.id,
        label: o.label || o.id,
        domains: o.domains,
        builtin: false,
        pathOnly: !!o.pathOnly,
        mode: 'limit',
        dailyLimitSeconds: o.capSeconds,
      });
      const td = (await chrome.storage.local.get('trackingData')).trackingData || {
        visits: {},
        time: {},
      };
      td.time[`${o.id}:${o.key}`] = o.usedSeconds || 0;
      await chrome.storage.local.set({ blockedSites: blocked, trackingData: td });
    },
    { ...opts, key: todayKey() },
  );
}
