import { test, expect, webURL } from '../fixtures/extension';
import { addBlockedSite, removeBlockedSite, getStats, sendMessage } from '../helpers/messaging';
import { setStorage } from '../helpers/storage';
import { expectBlocked } from '../helpers/navigation';

test('www input blocks the bare host and subdomains without blocking lookalikes', async ({ context, extensionId }) => {
  const popup = await context.newPage();
  await popup.goto(`chrome-extension://${extensionId}/popup/popup.html`);
  await popup.locator('#site-input').fill('https://www.focus.test/some/path');
  await popup.locator('#add-site-btn').click();
  await expect(popup.locator('#blocked-list')).toContainText('focus.test');
  const page = await context.newPage();
  for (const host of ['focus.test', 'www.focus.test', 'mobile.focus.test']) {
    await expectBlocked(page, webURL(`http://${host}/`));
  }
  for (const host of ['focus.test.evil.test', 'focus.testing']) {
    await page.goto(webURL(`http://${host}/`));
    await expect(page.locator('h1')).toHaveText('Test page');
  }
});

test('Shorts blocks direct, SPA and redirect navigation while regular videos stay available', async ({ context }) => {
  const page = await context.newPage();
  await page.goto(webURL('http://www.youtube.com/watch?v=test'));
  await expect(page.locator('h1')).toHaveText('Test page');
  await page.evaluate(() => history.pushState({}, '', '/shorts/test'));
  await expect(page).toHaveURL(/blocked\/blocked.html\?site=youtube-shorts/);
  await expectBlocked(page, webURL('http://m.youtube.com/shorts/test'));
  await expectBlocked(page, webURL(`http://neutral.test/redirect?to=${encodeURIComponent(webURL('http://youtube.com/shorts/test'))}`));
  await page.goto(webURL('http://www.youtube.com/shortstory'));
  await expect(page.locator('h1')).toHaveText('Test page');
});

test('removing Shorts restores shelves in open pages and newly loaded pages', async ({ context, extensionPage }) => {
  const page = await context.newPage();
  await page.goto(webURL('http://www.youtube.com/watch?v=test'));
  const shelf = page.locator('ytd-reel-shelf-renderer');
  await expect(shelf).toBeHidden();
  await removeBlockedSite(extensionPage, 'youtube-shorts');
  await expect(shelf).toBeVisible();
  await page.reload();
  await expect(shelf).toBeVisible();
  await page.evaluate(() => history.pushState({}, '', '/shorts/test'));
  await expect(page.locator('h1')).toHaveText('Test page');
});

test.describe('Camera denied', () => {
  test.use({ camera: false });
  test('each blocked visit is recorded once even without a photo, including concurrent visits', async ({ context, extensionPage }) => {
    const before = await getStats(extensionPage);
    const pages = await Promise.all(Array.from({ length: 6 }, () => context.newPage()));
    await Promise.all(pages.map(page => expectBlocked(page, webURL('http://www.twitter.com/'))));
    await expect.poll(async () => (await getStats(extensionPage)).allTimeCount).toBe(before.allTimeCount + 6);
    const report = await sendMessage(extensionPage, { type: 'GET_REPORT_DATA' });
    expect(report.todayCount).toBe(before.todayCount + 6);
    const photos = await sendMessage(extensionPage, { type: 'GET_PHOTOS' });
    expect(photos).toHaveLength(0);
    await pages[0].reload();
    expect((await getStats(extensionPage)).allTimeCount).toBe(before.allTimeCount + 6);
  });
});

test('removal selfies link to report thumbnails without counting as visit attempts', async ({ context, extensionId, extensionPage }) => {
  const before = await getStats(extensionPage);
  await extensionPage.locator('#blocked-list .site-item').first().locator('.site-remove').click();
  for (let i = 0; i < 3; i++) await extensionPage.locator('#gauntlet-continue').click();
  await expect(extensionPage.locator('#surrendered')).toHaveText('1');
  expect((await getStats(extensionPage)).allTimeCount).toBe(before.allTimeCount);
  // Numeric IDs can coincide in the normal and private photo stores.
  await extensionPage.evaluate(async () => {
    const { removalLog } = await chrome.storage.local.get<{ removalLog: any[] }>('removalLog');
    await chrome.storage.local.set({ removalLog: [...removalLog, { ...removalLog[0], photoContext: 'incognito' }] });
  });
  const report = await context.newPage();
  await report.goto(`chrome-extension://${extensionId}/report/report.html`);
  await expect(report.locator('.coward-log-entry')).toHaveCount(2);
  await expect(report.locator('.coward-log-thumb')).toHaveCount(1);
  expect(await report.locator('.coward-log-thumb').evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0)).toBe(true);
});

test('report resets yesterday counts without requiring the popup to be opened', async ({ context, extensionId, extensionPage }) => {
  await setStorage(extensionPage, { attemptCount: 9, todayCount: 9, todayDate: 'Thu Jan 01 1970', dailyCounts: {} });
  const report = await context.newPage();
  await report.goto(`chrome-extension://${extensionId}/report/report.html`);
  await expect(report.locator('#today-count')).toHaveText('0');
  await expect(report.locator('#all-time-count')).toHaveText('9');
});

test('blocked sites cannot load inside frames, while allowed frames load normally', async ({ context, extensionPage }) => {
  await addBlockedSite(extensionPage, { id: 'frame.test', label: 'Frame', domains: ['frame.test'] });
  const page = await context.newPage();
  await page.goto(webURL('http://neutral.test/'));
  const failure = page.waitForEvent('requestfailed', request => new URL(request.url()).hostname === 'frame.test');
  await page.evaluate(url => { const frame = document.createElement('iframe'); frame.src = url; document.body.append(frame); }, webURL('http://frame.test/'));
  expect((await failure).failure()?.errorText).toBe('net::ERR_BLOCKED_BY_CLIENT');
  await page.evaluate(url => { const frame = document.createElement('iframe'); frame.id = 'allowed'; frame.src = url; document.body.append(frame); }, webURL('http://allowed.test/'));
  await expect(page.frameLocator('#allowed').locator('h1')).toHaveText('Test page');
});
