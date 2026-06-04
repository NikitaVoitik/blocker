import { expect, test } from '../fixtures/extension';
import { addBlockedSite, getRemovalLog } from '../helpers/messaging';
import { setStorage } from '../helpers/storage';

test.describe('Tier 2: Removal Gauntlet', () => {
  test('clicking remove opens gauntlet modal with correct site name', async ({
    context,
    extensionId,
  }) => {
    const page = await context.newPage();
    await page.goto(`chrome-extension://${extensionId}/popup/popup.html`);

    const firstSite = page.locator('.site-item').first();
    await firstSite.locator('.site-remove').click();

    const overlay = page.locator('#gauntlet-overlay');
    await expect(overlay).toBeVisible();

    await expect(page.locator('#gauntlet-step')).toHaveText('STEP 1/3');
    const title = await page.locator('#gauntlet-title').textContent();
    expect(title).toContain('COWARD');

    await page.close();
  });

  test('cancel at step 1 aborts removal', async ({ context, extensionId, extensionPage }) => {
    const site = { id: 'canceltest.com', label: 'Cancel Test', domains: ['canceltest.com'] };
    await addBlockedSite(extensionPage, site);

    const page = await context.newPage();
    await page.goto(`chrome-extension://${extensionId}/popup/popup.html`);

    await expect(page.locator('#blocked-list')).toContainText('Cancel Test');

    await page.locator('.site-item:has-text("Cancel Test") .site-remove').click();
    await expect(page.locator('#gauntlet-overlay')).toBeVisible();

    await page.locator('#gauntlet-cancel').click();
    await expect(page.locator('#gauntlet-overlay')).toBeHidden();

    await expect(page.locator('#blocked-list')).toContainText('Cancel Test');

    const log = await getRemovalLog(extensionPage);
    const entry = (log || []).find((e: any) => e.siteId === 'canceltest.com');
    expect(entry).toBeUndefined();

    await page.close();
  });

  test('cancel at step 2 aborts removal', async ({ context, extensionId, extensionPage }) => {
    const site = { id: 'cancel2.com', label: 'Cancel Step 2', domains: ['cancel2.com'] };
    await addBlockedSite(extensionPage, site);

    const page = await context.newPage();
    await page.goto(`chrome-extension://${extensionId}/popup/popup.html`);

    await page.locator('.site-item:has-text("Cancel Step 2") .site-remove').click();
    await expect(page.locator('#gauntlet-step')).toHaveText('STEP 1/3');

    await page.locator('#gauntlet-continue').click();
    await expect(page.locator('#gauntlet-step')).toHaveText('STEP 2/3');

    await page.locator('#gauntlet-cancel').click();
    await expect(page.locator('#gauntlet-overlay')).toBeHidden();

    await expect(page.locator('#blocked-list')).toContainText('Cancel Step 2');
    await page.close();
  });

  test('gauntlet steps through 3 stages with correct labels', async ({ context, extensionId }) => {
    const page = await context.newPage();
    await page.goto(`chrome-extension://${extensionId}/popup/popup.html`);

    await page.locator('.site-item').first().locator('.site-remove').click();

    await expect(page.locator('#gauntlet-step')).toHaveText('STEP 1/3');
    await expect(page.locator('#gauntlet-continue')).toHaveText('Continue');

    await page.locator('#gauntlet-continue').click();
    await expect(page.locator('#gauntlet-step')).toHaveText('STEP 2/3');
    await expect(page.locator('#gauntlet-continue')).toHaveText('Continue');

    await page.locator('#gauntlet-continue').click();
    await expect(page.locator('#gauntlet-step')).toHaveText('STEP 3/3');
    await expect(page.locator('#gauntlet-continue')).toHaveText('Remove');

    await page.close();
  });

  test('completing gauntlet removes site and logs removal', async ({
    context,
    extensionId,
    extensionPage,
  }) => {
    const site = { id: 'gauntlettest.com', label: 'Gauntlet Test', domains: ['gauntlettest.com'] };
    await addBlockedSite(extensionPage, site);

    const page = await context.newPage();
    await page.goto(`chrome-extension://${extensionId}/popup/popup.html`);

    await expect(page.locator('#blocked-list')).toContainText('Gauntlet Test');

    await page.locator('.site-item:has-text("Gauntlet Test") .site-remove').click();

    await page.locator('#gauntlet-continue').click();
    await page.locator('#gauntlet-continue').click();
    await page.locator('#gauntlet-continue').click();

    await expect(page.locator('#gauntlet-overlay')).toBeHidden();
    await expect(page.locator('#blocked-list')).not.toContainText('Gauntlet Test');

    await expect.poll(() => getRemovalLog(extensionPage), { timeout: 5000 }).toBeTruthy();
    const removalLog = await getRemovalLog(extensionPage);
    const entry = removalLog.find((e: any) => e.siteId === 'gauntlettest.com');
    expect(entry).toBeDefined();
    expect(entry.siteLabel).toBe('Gauntlet Test');
    expect(entry.timestamp).toBeGreaterThan(0);

    await page.close();
  });

  test('surrendered stat updates after removal', async ({
    context,
    extensionId,
    extensionPage,
  }) => {
    const site = {
      id: 'surrender-stat.com',
      label: 'Surrender Stat',
      domains: ['surrender-stat.com'],
    };
    await addBlockedSite(extensionPage, site);

    const page = await context.newPage();
    await page.goto(`chrome-extension://${extensionId}/popup/popup.html`);

    const initialCount = await page.locator('#surrendered').textContent();

    await page.locator('.site-item:has-text("Surrender Stat") .site-remove').click();
    await page.locator('#gauntlet-continue').click();
    await page.locator('#gauntlet-continue').click();
    await page.locator('#gauntlet-continue').click();

    await expect(page.locator('#gauntlet-overlay')).toBeHidden();

    const expectedCount = String(Number(initialCount) + 1);
    await expect(page.locator('#surrendered')).toHaveText(expectedCount);

    await page.close();
  });

  test('removal log persists across popup reopens', async ({
    context,
    extensionId,
    extensionPage,
  }) => {
    const site = { id: 'persist-test.com', label: 'Persist Test', domains: ['persist-test.com'] };
    await addBlockedSite(extensionPage, site);

    const page1 = await context.newPage();
    await page1.goto(`chrome-extension://${extensionId}/popup/popup.html`);

    await page1.locator('.site-item:has-text("Persist Test") .site-remove').click();
    await page1.locator('#gauntlet-continue').click();
    await page1.locator('#gauntlet-continue').click();
    await page1.locator('#gauntlet-continue').click();

    await expect(page1.locator('#gauntlet-overlay')).toBeHidden();
    const countAfter = await page1.locator('#surrendered').textContent();
    await page1.close();

    const page2 = await context.newPage();
    await page2.goto(`chrome-extension://${extensionId}/popup/popup.html`);
    await expect(page2.locator('#surrendered')).toHaveText(countAfter!);
    await page2.close();
  });

  test('coward log section appears on report page', async ({
    context,
    extensionId,
    extensionPage,
  }) => {
    await setStorage(extensionPage, {
      removalLog: [
        {
          siteId: 'twitter',
          siteLabel: 'Twitter / X',
          timestamp: Date.now() - 60000,
          photoId: null,
        },
        { siteId: 'reddit.com', siteLabel: 'reddit.com', timestamp: Date.now(), photoId: null },
      ],
    });

    const page = await context.newPage();
    await page.goto(`chrome-extension://${extensionId}/report/report.html`);
    await page.waitForTimeout(2000);

    await expect(page.locator('#coward-log-section')).toBeVisible();
    await expect(page.locator('#coward-total')).toHaveText('2');

    const entries = page.locator('.coward-log-entry');
    await expect(entries).toHaveCount(2);

    await expect(page.locator('.coward-log-badge').first()).toHaveText('COWARD');

    await expect(page.locator('.coward-log-site').first()).toHaveText('reddit.com');

    await page.close();
  });

  test('coward log shows empty state when no removals', async ({
    context,
    extensionId,
    extensionPage,
  }) => {
    await setStorage(extensionPage, { removalLog: [] });

    const page = await context.newPage();
    await page.goto(`chrome-extension://${extensionId}/report/report.html`);
    await page.waitForTimeout(2000);

    await expect(page.locator('#coward-total')).toHaveText('0');
    await expect(page.locator('#coward-log-empty')).toBeVisible();
    await expect(page.locator('#coward-log-empty')).toContainText('No surrenders yet');
    await expect(page.locator('.coward-log-entry')).toHaveCount(0);

    await page.close();
  });

  test('multiple removals accumulate in log', async ({ context, extensionId }) => {
    const msgPage = await context.newPage();
    await msgPage.goto(`chrome-extension://${extensionId}/blocked/blocked.html`);

    const sites = [
      { id: 'multi1.com', label: 'Multi 1', domains: ['multi1.com'] },
      { id: 'multi2.com', label: 'Multi 2', domains: ['multi2.com'] },
    ];
    for (const site of sites) {
      await addBlockedSite(msgPage, site);
    }

    const page = await context.newPage();
    await page.goto(`chrome-extension://${extensionId}/popup/popup.html`);

    // Remove first site
    await page.locator('.site-item:has-text("Multi 1") .site-remove').click();
    await page.locator('#gauntlet-continue').click();
    await page.locator('#gauntlet-continue').click();
    await page.locator('#gauntlet-continue').click();
    await expect(page.locator('#gauntlet-overlay')).toBeHidden();

    // Remove second site
    await page.locator('.site-item:has-text("Multi 2") .site-remove').click();
    await page.locator('#gauntlet-continue').click();
    await page.locator('#gauntlet-continue').click();
    await page.locator('#gauntlet-continue').click();
    await expect(page.locator('#gauntlet-overlay')).toBeHidden();

    await expect
      .poll(
        async () => {
          const l = await getRemovalLog(msgPage);
          return l && l.length >= 2;
        },
        { timeout: 5000 },
      )
      .toBeTruthy();
    const finalLog = await getRemovalLog(msgPage);
    const ids = finalLog.map((e: any) => e.siteId);
    expect(ids).toContain('multi1.com');
    expect(ids).toContain('multi2.com');
    expect(finalLog.length).toBeGreaterThanOrEqual(2);

    await page.close();
    await msgPage.close();
  });
});
