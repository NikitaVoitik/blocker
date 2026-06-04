import { expect, test } from '../fixtures/extension';

test.describe("Tier 1: What's New banner", () => {
  test('shows on first open, jumps to Tracker tab, and stays dismissed after', async ({
    context,
    extensionId,
  }) => {
    const page = await context.newPage();
    await page.goto(`chrome-extension://${extensionId}/popup/popup.html`);

    const banner = page.locator('#whats-new');
    await expect(banner).toBeVisible();
    await expect(banner).toContainText('Daily Limits');

    // Clicking the banner body switches to the Tracker tab...
    await banner.click();
    await expect(page.locator('[data-tab="tracker"]')).toHaveClass(/active/);
    await expect(page.locator('#tab-tracker')).toBeVisible();
    // ...and dismisses the banner.
    await expect(banner).toBeHidden();
    await page.close();

    // Reopening the popup: dismissal persisted to storage, banner stays gone.
    const page2 = await context.newPage();
    await page2.goto(`chrome-extension://${extensionId}/popup/popup.html`);
    await expect(page2.locator('#whats-new')).toBeHidden();
    await page2.close();
  });

  test('✕ dismisses the banner without leaving the Blocker tab', async ({
    context,
    extensionId,
  }) => {
    const page = await context.newPage();
    await page.goto(`chrome-extension://${extensionId}/popup/popup.html`);

    const banner = page.locator('#whats-new');
    await expect(banner).toBeVisible();

    await page.locator('#whats-new-dismiss').click();

    await expect(banner).toBeHidden();
    // Still on the Blocker tab — the ✕ must not trigger the jump-to-Tracker click.
    await expect(page.locator('[data-tab="blocker"]')).toHaveClass(/active/);
    await page.close();
  });
});
