import AxeBuilder from '@axe-core/playwright';
import { test, expect } from '../fixtures/extension';

test.use({ camera: false });

// Distinct contract: controls and rendered text must be usable with assistive
// technology. Functional click-through tests do not detect these failures.
for (const screen of ['popup', 'commitment', 'tracking', 'report', 'gallery', 'setup', 'blocked'] as const) {
  test(`${screen} has no automatically detectable WCAG A/AA violations`, async ({ extensionPage: page, extensionId }, info) => {
    const paths = { popup: 'popup/popup.html', commitment: 'popup/popup.html', tracking: 'popup/popup.html', report: 'report/report.html', gallery: 'blocked/blocked.html?gallery=true', setup: 'setup/setup.html', blocked: 'blocked/blocked.html?site=twitter' };
    await page.goto(`chrome-extension://${extensionId}/${paths[screen]}`);
    if (screen === 'commitment') {
      await page.getByRole('button', { name: 'Lock Twitter / X', exact: true }).click();
      await page.getByRole('button', { name: 'Custom', exact: true }).click();
    }
    if (screen === 'tracking') await page.locator('[data-tab="tracker"]').click();
    if (screen === 'gallery') await expect(page.locator('#storage-count')).toHaveText('0 / 50');
    if (screen === 'blocked') await expect(page.locator('.mirror-text')).toBeVisible();
    if (screen === 'report') await expect(page.locator('#daily-chart .bar')).toHaveCount(30);
    // Extension origins cannot open axe's temporary about:blank result window.
    const scan = await new AxeBuilder({ page }).setLegacyMode(true)
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
    await info.attach('accessibility-scan', { body: JSON.stringify(scan, null, 2), contentType: 'application/json' });
    expect(scan.violations).toEqual([]);
  });
}
