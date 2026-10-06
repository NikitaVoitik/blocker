import { test, expect, webURL, launchExtension, closeExtension, extensionIdFor, type Page } from '../fixtures/extension';
import type { TestInfo } from '@playwright/test';
import { addBlockedSite, getRemovalLog, getStats, sendMessage } from '../helpers/messaging';
import { setStorage } from '../helpers/storage';
import { expectBlocked } from '../helpers/navigation';
import { stopExtensionWorker } from '../helpers/lifecycle';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

const row = (page: Page, label = 'Twitter / X') => page.locator('#blocked-list .site-item').filter({ has: page.locator('.site-label', { hasText: label }) });

async function lockInPopup(page: Page, label = 'Twitter / X', duration = '24 hours', custom?: { amount: number; unit: 'hours' | 'days' }) {
  await row(page, label).getByRole('button', { name: `Lock ${label}`, exact: true }).click();
  await page.getByRole('button', { name: duration, exact: true }).click();
  if (custom) {
    await page.getByLabel('Custom duration', { exact: true }).fill(String(custom.amount));
    await page.getByLabel('Duration unit', { exact: true }).selectOption(custom.unit);
  }
  const labelDuration = custom ? `${custom.amount} ${custom.unit}` : duration;
  await page.getByRole('button', { name: `Lock removal for ${labelDuration}`, exact: true }).click();
  await expect(page.locator('#commitment-overlay')).toBeHidden();
  await expect(row(page, label).getByRole('button', { name: `Locked ${label}`, exact: true })).toBeVisible();
}

async function evidence(page: Page, info: TestInfo, stage: string) {
  await info.attach(`${stage}-popup`, { body: await page.screenshot(), contentType: 'image/png' });
  const data = await page.evaluate(async () => ({
    capturedAt: new Date().toISOString(),
    blockedSites: await chrome.runtime.sendMessage({ type: 'GET_BLOCKED_SITES' }),
    removals: await chrome.runtime.sendMessage({ type: 'GET_REMOVAL_LOG' }),
    stats: await chrome.runtime.sendMessage({ type: 'GET_STATS' }),
    photoCount: (await chrome.runtime.sendMessage({ type: 'GET_PHOTOS' })).length,
  }));
  await info.attach(`${stage}-evidence`, { body: JSON.stringify(data, null, 2), contentType: 'application/json' });
}

test('commitment is opt-in, cancellation is inert, and keyboard confirmation shows the exact deadline', async ({ extensionPage }, info) => {
  const initial = await sendMessage(extensionPage, { type: 'GET_BLOCKED_SITES' });
  expect(initial.every((site: any) => !site.lockUntil)).toBe(true);
  const lock = row(extensionPage).getByRole('button', { name: 'Lock Twitter / X', exact: true });
  await expect(lock).toBeVisible();
  await lock.focus();
  await extensionPage.keyboard.press('Enter');
  const dialog = extensionPage.getByRole('dialog', { name: 'NO EARLY REMOVAL.' });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText('The site stays blocked after this deadline.', { exact: true })).toBeVisible();
  await expect(dialog.getByText(/Chrome still lets you disable or uninstall/)).toBeVisible();
  await dialog.getByRole('button', { name: '7 days', exact: true }).click();
  await extensionPage.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await expect(lock).toBeFocused();
  expect(await sendMessage(extensionPage, { type: 'GET_BLOCKED_SITES' })).toEqual(initial);
  await lock.click();
  await dialog.getByRole('button', { name: '1 hour', exact: true }).click();
  await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
  expect(await sendMessage(extensionPage, { type: 'GET_BLOCKED_SITES' })).toEqual(initial);
  await lock.click();
  await dialog.getByRole('button', { name: '7 days', exact: true }).click();
  await dialog.getByRole('button', { name: 'Lock removal for 7 days', exact: true }).focus();
  await extensionPage.keyboard.press('Tab');
  await extensionPage.keyboard.press('Tab');
  await expect(dialog.getByRole('button', { name: '1 hour', exact: true })).toBeFocused();
  await dialog.getByRole('button', { name: 'Lock removal for 7 days', exact: true }).focus();
  await extensionPage.keyboard.press('Enter');
  await expect(dialog).toBeHidden();
  const [site] = (await sendMessage(extensionPage, { type: 'GET_BLOCKED_SITES' })).filter((s: any) => s.id === 'twitter');
  expect(site.lockUntil - site.lockStartedAt).toBe(7 * 24 * 3600_000);
  expect(Math.abs(site.lockStartedAt - Date.now())).toBeLessThan(5000);
  await expect(row(extensionPage).locator('.site-remove')).toHaveCount(0);
  await row(extensionPage).getByRole('button', { name: 'Locked Twitter / X', exact: true }).click();
  await expect(extensionPage.locator('#commitment-deadline')).toHaveAttribute('datetime', new Date(site.lockUntil).toISOString());
  await evidence(extensionPage, info, 'locked-details');
});

test('runtime validates durations and refuses replacement, forged deadlines and locked removals without evidence', async ({ context, extensionPage }, info) => {
  for (const hours of [0, -1, 0.5, 8761, Number.MAX_SAFE_INTEGER, '24', null, {}, []]) {
    const result = await sendMessage(extensionPage, { type: 'LOCK_BLOCKED_SITE', siteId: 'twitter', durationHours: hours });
    expect(result).toMatchObject({ success: false, code: 'INVALID_LOCK_DURATION' });
  }
  expect(await sendMessage(extensionPage, { type: 'LOCK_BLOCKED_SITE', siteId: 'missing', durationHours: 1 })).toMatchObject({ success: false });
  for (const hours of [1, 2, 24, 168, 169, 8760]) {
    const id = `lock-${hours}.test`;
    await addBlockedSite(extensionPage, { id, label: id, domains: [id] });
    const result = await sendMessage(extensionPage, { type: 'LOCK_BLOCKED_SITE', siteId: id, durationHours: hours, lockUntil: 1 });
    expect(result.success).toBe(true);
    const site = result.sites.find((s: any) => s.id === id);
    expect(site.lockUntil - site.lockStartedAt).toBe(hours * 3600_000);
    expect(site.lockUntil).toBeGreaterThan(Date.now());
  }
  await extensionPage.reload();
  const beforeStats = await getStats(extensionPage);
  await lockInPopup(extensionPage);
  const original = (await sendMessage(extensionPage, { type: 'GET_BLOCKED_SITES' })).find((s: any) => s.id === 'twitter');
  for (const message of [
    { type: 'LOCK_BLOCKED_SITE', siteId: 'twitter', durationHours: 1 },
    { type: 'LOCK_BLOCKED_SITE', siteId: 'twitter', durationHours: 168 },
    { type: 'REMOVE_BLOCKED_SITE', siteId: 'twitter', capturePhoto: true },
  ]) expect(await sendMessage(extensionPage, message)).toMatchObject({ success: false, code: 'COMMITMENT_ACTIVE', lockUntil: original.lockUntil });
  expect(await addBlockedSite(extensionPage, { id: 'twitter', label: 'Replacement', domains: ['twitter.com'] })).toMatchObject({ success: false });
  const page = await context.newPage();
  await expectBlocked(page, webURL('http://x.com/'), 'twitter');
  await expect.poll(async () => (await getStats(extensionPage)).allTimeCount).toBe(beforeStats.allTimeCount + 1);
  expect(await getRemovalLog(extensionPage)).toHaveLength(0);
  await evidence(extensionPage, info, 'rejected-removal');
});

test('custom hours and days show accurate deadlines, remain opt-in, and fit the popup', async ({ extensionPage }, info) => {
  await extensionPage.setViewportSize({ width: 320, height: 600 });
  await row(extensionPage).getByRole('button', { name: 'Lock Twitter / X', exact: true }).click();
  const custom = extensionPage.getByRole('button', { name: 'Custom', exact: true });
  await expect(custom).toBeVisible();
  await custom.click();
  await extensionPage.getByLabel('Custom duration', { exact: true }).fill('2');
  const preview = Date.parse((await extensionPage.locator('#commitment-deadline').getAttribute('datetime'))!);
  expect(Math.abs(preview - Date.now() - 2 * 3600_000)).toBeLessThan(3000);
  await extensionPage.locator('#commitment-cancel').click();
  expect((await sendMessage(extensionPage, { type: 'GET_BLOCKED_SITES' })).find((s: any) => s.id === 'twitter').lockUntil).toBeUndefined();
  await lockInPopup(extensionPage, 'Twitter / X', 'Custom', { amount: 2, unit: 'hours' });
  await row(extensionPage, 'YouTube Shorts').getByRole('button', { name: 'Lock YouTube Shorts', exact: true }).click();
  await expect(extensionPage.getByRole('button', { name: '24 hours', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await custom.click();
  await extensionPage.getByLabel('Custom duration', { exact: true }).fill('10');
  await extensionPage.getByLabel('Duration unit', { exact: true }).selectOption('days');
  const daysPreview = Date.parse((await extensionPage.locator('#commitment-deadline').getAttribute('datetime'))!);
  expect(Math.abs(daysPreview - Date.now() - 10 * 24 * 3600_000)).toBeLessThan(3000);
  const box = await extensionPage.locator('#commitment-overlay').boundingBox();
  expect(box!.x).toBeGreaterThanOrEqual(0);
  expect(box!.y).toBeGreaterThanOrEqual(0);
  expect(box!.x + box!.width).toBeLessThanOrEqual(320);
  expect(box!.y + box!.height).toBeLessThanOrEqual(600);
  await expect(extensionPage.locator('#commitment-confirm')).toBeInViewport({ ratio: 1 });
  await expect(extensionPage.locator('#commitment-cancel')).toBeInViewport({ ratio: 1 });
  await evidence(extensionPage, info, 'custom-confirmation-320');
  await extensionPage.getByRole('button', { name: 'Lock removal for 10 days', exact: true }).click();
  await expect(extensionPage.locator('#commitment-overlay')).toBeHidden();
  const sites = await sendMessage(extensionPage, { type: 'GET_BLOCKED_SITES' });
  const twitter = sites.find((s: any) => s.id === 'twitter');
  const shorts = sites.find((s: any) => s.id === 'youtube-shorts');
  expect(twitter.lockUntil - twitter.lockStartedAt).toBe(2 * 3600_000);
  expect(shorts.lockUntil - shorts.lockStartedAt).toBe(10 * 24 * 3600_000);
  expect(await sendMessage(extensionPage, { type: 'LOCK_BLOCKED_SITE', siteId: 'youtube-shorts', durationHours: 3 })).toMatchObject({ success: false, code: 'COMMITMENT_ACTIVE', lockUntil: shorts.lockUntil });
});

test('invalid custom values cannot confirm and presets recover from an invalid custom choice', async ({ extensionPage }) => {
  await row(extensionPage).getByRole('button', { name: 'Lock Twitter / X', exact: true }).click();
  await extensionPage.getByRole('button', { name: 'Custom', exact: true }).click();
  const amount = extensionPage.getByLabel('Custom duration', { exact: true });
  for (const value of ['', '0', '-1', '1.5', '8761']) {
    await amount.fill(value);
    await expect(extensionPage.locator('#commitment-confirm')).toBeDisabled();
    await expect(extensionPage.locator('#commitment-duration-error')).toBeVisible();
    await expect(extensionPage.locator('#commitment-deadline')).not.toHaveAttribute('datetime');
  }
  await amount.fill('365');
  await extensionPage.getByLabel('Duration unit', { exact: true }).selectOption('days');
  await expect(extensionPage.locator('#commitment-confirm')).toBeEnabled();
  await expect(extensionPage.locator('#commitment-confirm')).toHaveText('Lock removal for 365 days');
  await amount.fill('366');
  await expect(extensionPage.locator('#commitment-confirm')).toBeDisabled();
  await extensionPage.getByRole('button', { name: '1 hour', exact: true }).click();
  await expect(amount).toBeHidden();
  await expect(extensionPage.locator('#commitment-duration-error')).toBeHidden();
  await expect(extensionPage.locator('#commitment-confirm')).toHaveText('Lock removal for 1 hour');
  await expect(extensionPage.locator('#commitment-confirm')).toBeEnabled();
  await extensionPage.keyboard.press('Escape');
  expect((await sendMessage(extensionPage, { type: 'GET_BLOCKED_SITES' })).find((s: any) => s.id === 'twitter').lockUntil).toBeUndefined();
});

test.describe('Rejected removal has no selfie', () => {
  test('a commitment set in another popup stops a stale gauntlet before camera capture', async ({ context, extensionId, extensionPage }) => {
    await row(extensionPage).locator('.site-remove').click();
    await extensionPage.locator('#gauntlet-continue').click();
    await extensionPage.locator('#gauntlet-continue').click();
    await expect(extensionPage.locator('#gauntlet-step')).toHaveText('STEP 3/3');
    const other = await context.newPage();
    await other.goto(`chrome-extension://${extensionId}/popup/popup.html`);
    await lockInPopup(other, 'Twitter / X', '1 hour');
    await expect(extensionPage.locator('#gauntlet-overlay')).toBeHidden();
    await expect(extensionPage.getByRole('dialog', { name: 'YOU MADE A DEAL.' })).toBeVisible();
    expect(await sendMessage(extensionPage, { type: 'REMOVE_BLOCKED_SITE', siteId: 'twitter', capturePhoto: true })).toMatchObject({ success: false, code: 'COMMITMENT_ACTIVE' });
    expect(await sendMessage(extensionPage, { type: 'GET_PHOTOS' })).toHaveLength(0);
    expect(await getRemovalLog(extensionPage)).toHaveLength(0);
    expect((await getStats(extensionPage)).allTimeCount).toBe(0);
    await other.close();
    await extensionPage.reload();
    await expect(row(extensionPage).getByRole('button', { name: 'Locked Twitter / X', exact: true })).toBeVisible();
    await stopExtensionWorker(context, extensionId);
    expect(await sendMessage(extensionPage, { type: 'REMOVE_BLOCKED_SITE', siteId: 'twitter' })).toMatchObject({ success: false, code: 'COMMITMENT_ACTIVE' });
  });
});

test('expiry updates an open popup, keeps the site blocked, and still requires deliberate removal', async ({ context, extensionPage }, info) => {
  await lockInPopup(extensionPage, 'Twitter / X', '1 hour');
  const sites = await sendMessage(extensionPage, { type: 'GET_BLOCKED_SITES' });
  // Model a legitimate commitment in its final seconds; no production clock hooks.
  const deadline = Date.now() + 2500;
  await setStorage(extensionPage, { blockedSites: sites.map((site: any) => site.id === 'twitter' ? { ...site, lockStartedAt: deadline - 3600_000, lockUntil: deadline } : site) });
  await expect(row(extensionPage).getByRole('button', { name: 'Locked Twitter / X', exact: true })).toContainText('<1m');
  await expect(row(extensionPage).getByText('Commitment served · still blocked', { exact: true })).toBeVisible({ timeout: 7000 });
  expect(await getRemovalLog(extensionPage)).toHaveLength(0);
  const page = await context.newPage();
  await expectBlocked(page, webURL('http://mobile.twitter.com/'), 'twitter');
  await evidence(extensionPage, info, 'expired-still-blocked');
  await row(extensionPage).locator('.site-remove').click();
  await extensionPage.locator('#gauntlet-cancel').click();
  expect(await getRemovalLog(extensionPage)).toHaveLength(0);
  await row(extensionPage).locator('.site-remove').click();
  for (let i = 0; i < 3; i++) await extensionPage.locator('#gauntlet-continue').click();
  await expect(row(extensionPage)).toHaveCount(0);
  expect(await getRemovalLog(extensionPage)).toHaveLength(1);
  await page.goto(webURL('http://mobile.twitter.com/'));
  await expect(page.locator('h1')).toHaveText('Test page');
});

test('a popup clock set past the deadline cannot convince the worker to remove a committed site', async ({ extensionPage }) => {
  await lockInPopup(extensionPage);
  await extensionPage.clock.install({ time: Date.now() + 8 * 24 * 3600_000 });
  expect(await sendMessage(extensionPage, { type: 'REMOVE_BLOCKED_SITE', siteId: 'twitter', capturePhoto: true })).toMatchObject({ success: false, code: 'COMMITMENT_ACTIVE' });
  expect(await getRemovalLog(extensionPage)).toHaveLength(0);
  expect(await sendMessage(extensionPage, { type: 'GET_PHOTOS' })).toHaveLength(0);
});

test('browser restart preserves a custom-site commitment and its original deadline', async ({ webServer }, info) => {
  const profile = await mkdtemp(path.join(tmpdir(), 'blocker-commitment-'));
  let context = await launchExtension(profile, false);
  try {
    let id = await extensionIdFor(context);
    let popup = await context.newPage();
    await popup.goto(`chrome-extension://${id}/popup/popup.html`);
    await popup.locator('#site-input').fill('restart-lock.test');
    await popup.locator('#add-site-btn').click();
    await lockInPopup(popup, 'restart-lock.test', 'Custom', { amount: 3, unit: 'hours' });
    const original = (await sendMessage(popup, { type: 'GET_BLOCKED_SITES' })).find((s: any) => s.id === 'restart-lock.test');
    await closeExtension(context);
    context = await launchExtension(profile, false);
    id = await extensionIdFor(context);
    const page = await context.newPage();
    await expectBlocked(page, webURL('http://restart-lock.test/'), 'restart-lock.test');
    popup = await context.newPage();
    await popup.goto(`chrome-extension://${id}/popup/popup.html`);
    await expect(row(popup, 'restart-lock.test').getByRole('button', { name: 'Locked restart-lock.test', exact: true })).toBeVisible();
    const stored = (await sendMessage(popup, { type: 'GET_BLOCKED_SITES' })).find((s: any) => s.id === 'restart-lock.test');
    expect(stored.lockUntil).toBe(original.lockUntil);
    expect(await sendMessage(popup, { type: 'REMOVE_BLOCKED_SITE', siteId: 'restart-lock.test' })).toMatchObject({ success: false, code: 'COMMITMENT_ACTIVE' });
    await evidence(popup, info, 'after-browser-restart');
  } finally { await closeExtension(context); await rm(profile, { recursive: true, force: true }); }
});
