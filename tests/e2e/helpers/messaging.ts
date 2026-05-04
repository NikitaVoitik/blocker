import { type Page } from '@playwright/test';

export async function sendMessage(page: Page, message: Record<string, any>): Promise<any> {
  return page.evaluate(async (msg) => {
    return new Promise((resolve) => {
      chrome.runtime.sendMessage(msg, (response) => {
        resolve(response);
      });
    });
  }, message);
}

export async function addBlockedSite(page: Page, site: { id: string; label: string; domains: string[]; builtin?: boolean }) {
  return sendMessage(page, { type: 'ADD_BLOCKED_SITE', site });
}

export async function removeBlockedSite(page: Page, siteId: string) {
  return sendMessage(page, { type: 'REMOVE_BLOCKED_SITE', siteId });
}

export async function addTrackedSite(page: Page, site: { id: string; label: string; domains: string[]; builtin?: boolean }) {
  return sendMessage(page, { type: 'ADD_TRACKED_SITE', site });
}

export async function removeTrackedSite(page: Page, siteId: string) {
  return sendMessage(page, { type: 'REMOVE_TRACKED_SITE', siteId });
}

export async function getStats(page: Page) {
  return sendMessage(page, { type: 'GET_STATS' });
}

export async function getTrackingDataForToday(page: Page) {
  return sendMessage(page, { type: 'GET_TRACKING_DATA' });
}

export async function getTrackingReportData(page: Page) {
  return sendMessage(page, { type: 'GET_TRACKING_REPORT_DATA' });
}
