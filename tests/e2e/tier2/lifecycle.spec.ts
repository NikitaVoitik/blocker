import { test, expect, webURL, launchExtension, extensionIdFor } from '../fixtures/extension';
import { addBlockedSite, removeBlockedSite, getStats, getTrackingDataForToday, sendMessage } from '../helpers/messaging';
import { stopExtensionWorker } from '../helpers/lifecycle';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

test('blocking and unflushed tracking survive worker termination', async ({ context, extensionId, extensionPage }) => {
  const page = await context.newPage();
  await page.goto(webURL('http://www.reddit.com/'));
  await page.bringToFront();
  await expect.poll(async () => (await getTrackingDataForToday(extensionPage)).reddit.visits).toBe(1);
  await page.waitForTimeout(1200);
  await stopExtensionWorker(context, extensionId);
  const data = await getTrackingDataForToday(extensionPage); // Wakes the real worker.
  expect(data.reddit.time).toBeGreaterThanOrEqual(1);
  await page.goto(webURL('http://x.com/')).catch(() => {});
  await expect(page).toHaveURL(/blocked\/blocked.html\?site=twitter/);
  await expect.poll(async () => (await getStats(extensionPage)).allTimeCount).toBe(1);
});

test('browser restart retains custom blocks, removals and attempt evidence', async ({ webServer }) => {
  const profile = await mkdtemp(path.join(tmpdir(), 'blocker-profile-'));
  let context = await launchExtension(profile, false);
  try {
    let id = await extensionIdFor(context);
    let popup = await context.newPage();
    await popup.goto(`chrome-extension://${id}/popup/popup.html`);
    await expect(popup.locator('#blocked-list')).toContainText('Twitter');
    await addBlockedSite(popup, { id: 'persist.test', label: 'Persist', domains: ['persist.test'] });
    await removeBlockedSite(popup, 'twitter');
    let page = await context.newPage();
    await page.goto(webURL('http://persist.test/')).catch(() => {});
    await expect(page).toHaveURL(/site=persist.test/);
    await expect.poll(async () => (await getStats(popup)).allTimeCount).toBe(1);
    // Older popup versions stored www prefixes and explicit ports verbatim.
    await popup.evaluate(async () => {
      const { blockedSites } = await chrome.storage.local.get<{ blockedSites: any[] }>('blockedSites');
      await chrome.storage.local.set({ blockedSites: blockedSites.map(site => site.id === 'persist.test'
        ? { ...site, domains: ['www.persist.test:8443'] } : site) });
    });
    await context.close();
    context = await launchExtension(profile, false);
    id = await extensionIdFor(context);
    // Navigate before opening a popup: persisted rules must enforce on startup.
    page = await context.newPage();
    await page.goto(webURL('http://persist.test/')).catch(() => {});
    await expect(page).toHaveURL(/site=persist.test/);
    await expect(page.locator('h1')).toHaveText('BLOCKED');
    await page.goto(webURL('http://twitter.com/'));
    await expect(page.locator('h1')).toHaveText('Test page');
    popup = await context.newPage();
    await popup.goto(`chrome-extension://${id}/popup/popup.html`);
    await expect(popup.locator('#blocked-list')).toContainText('Persist');
    await expect(popup.locator('#blocked-list')).not.toContainText('Twitter');
    await expect.poll(async () => (await getStats(popup)).allTimeCount).toBe(2);
  } finally { await context.close(); await rm(profile, { recursive: true, force: true }); }
});

test('new blocks immediately confront a site already open in another tab', async ({ context, extensionPage }) => {
  const page = await context.newPage();
  await page.goto(webURL('http://already-open.test/'));
  await expect(page.locator('h1')).toHaveText('Test page');
  await addBlockedSite(extensionPage, { id: 'already-open.test', label: 'Open', domains: ['already-open.test'] });
  await expect(page).toHaveURL(/site=already-open.test/);
});

test('Incognito warning follows the real Chrome permission and protection works when enabled', async ({ context, extensionId, extensionPage }) => {
  await expect(extensionPage.locator('#incognito-warning')).toBeVisible();
  const settingsPromise = context.waitForEvent('page');
  await extensionPage.locator('#incognito-settings').click();
  const settings = await settingsPromise;
  await expect(settings).toHaveURL(`chrome://extensions/?id=${extensionId}`);
  await settings.locator('#devMode').click();
  await settings.locator('#allow-incognito cr-toggle').click();
  const popup = await context.newPage();
  await expect.poll(async () => {
    try {
      await popup.goto(`chrome-extension://${extensionId}/popup/popup.html`);
      return await popup.evaluate(() => chrome.extension.isAllowedIncognitoAccess());
    } catch { return false; }
  }, { timeout: 10_000 }).toBe(true);
  await expect(popup.locator('#incognito-warning')).toBeHidden();
  await popup.evaluate(url => chrome.windows.create({ incognito: true, url }), webURL('http://twitter.com/'));
  const cdp = await context.browser()!.newBrowserCDPSession();
  try {
    await expect.poll(async () => {
      const { targetInfos } = await cdp.send('Target.getTargets');
      return targetInfos.some(target => target.url.includes('blocked/blocked.html?site=twitter'));
    }).toBe(true);
    await expect.poll(async () => (await getStats(popup)).allTimeCount).toBe(1);
    const normal = await context.newPage();
    await normal.goto(webURL('http://x.com/')).catch(() => {});
    await expect(normal).toHaveURL(/blocked\/blocked.html\?site=twitter/);
    await expect.poll(async () => (await getStats(popup)).allTimeCount).toBe(2);
  } finally { await cdp.detach(); }
});
