import { test, expect } from '../fixtures/extension';

test.describe('Tier 1: Popup', () => {
  test('popup opens and displays both tabs', async ({ context, extensionId }) => {
    const page = await context.newPage();
    await page.goto(`chrome-extension://${extensionId}/popup/popup.html`);

    const blockerTab = page.locator('[data-tab="blocker"]');
    const trackerTab = page.locator('[data-tab="tracker"]');

    await expect(blockerTab).toBeVisible();
    await expect(trackerTab).toBeVisible();
    await expect(blockerTab).toHaveClass(/active/);
    await page.close();
  });

  test('blocker tab shows blocked sites list', async ({ context, extensionId }) => {
    const page = await context.newPage();
    await page.goto(`chrome-extension://${extensionId}/popup/popup.html`);

    const siteList = page.locator('#blocked-list');
    await expect(siteList).toBeVisible();

    const items = siteList.locator('.site-item');
    await expect(items).not.toHaveCount(0);
    await page.close();
  });

  test('switching to tracker tab shows tracking data', async ({ context, extensionId }) => {
    const page = await context.newPage();
    await page.goto(`chrome-extension://${extensionId}/popup/popup.html`);

    await page.locator('[data-tab="tracker"]').click();

    const trackerPanel = page.locator('#tab-tracker');
    await expect(trackerPanel).toBeVisible();

    const trackedList = page.locator('#tracked-list');
    await expect(trackedList).toBeVisible();
    await page.close();
  });

  test('adding a site via input works', async ({ context, extensionId }) => {
    const page = await context.newPage();
    await page.goto(`chrome-extension://${extensionId}/popup/popup.html`);

    await page.locator('#site-input').fill('testsite123.com');
    await page.locator('#add-site-btn').click();

    await expect(page.locator('#blocked-list')).toContainText('testsite123.com');

    const removeBtn = page.locator('.site-item:has-text("testsite123.com") .site-remove');
    await removeBtn.click();

    // Gauntlet modal appears — click through all 3 steps
    await expect(page.locator('#gauntlet-overlay')).toBeVisible();
    await page.locator('#gauntlet-continue').click();
    await page.locator('#gauntlet-continue').click();
    await page.locator('#gauntlet-continue').click();

    await expect(page.locator('#blocked-list')).not.toContainText('testsite123.com');
    await page.close();
  });
});
