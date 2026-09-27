import { expect, type Page, test } from '../fixtures/extension';
import { removeBlockedSite, removeTrackedSite } from '../helpers/messaging';
import { setStorage } from '../helpers/storage';

// popup.js exposes its top-level helpers on window (classic script).
declare function getShameLevel(n: number): { name: string; class: string };
declare function extractHostname(s: string): string;
declare function formatTime(n: number): string;

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

test.describe('Tier 1: popup.js UI + helpers', () => {
  const popupUrl = (id: string) => `chrome-extension://${id}/popup/popup.html`;
  const openPopup = async (context: any, id: string): Promise<Page> => {
    const page = await context.newPage();
    await page.goto(popupUrl(id));
    return page;
  };

  test('pure formatting helpers cover their branches', async ({ context, extensionId }) => {
    const popup = await openPopup(context, extensionId);
    const r = await popup.evaluate(() => ({
      shame: [0, 1, 3, 6, 10, 20, 999].map((n) => getShameLevel(n).name),
      host: [
        extractHostname('  HTTPS://WWW.Example.com/path?x=1'),
        extractHostname('reddit.com'),
        extractHostname(''),
      ],
      time: [formatTime(0), formatTime(59), formatTime(90), formatTime(3700), formatTime(7260)],
    }));
    expect(r.shame[0]).toBe('Clean');
    expect(r.shame[6]).toBe('Beyond Saving');
    expect(r.host[0]).toBe('www.example.com');
    expect(r.time).toEqual(['<1m', '<1m', '1m', '1h 1m', '2h 1m']);
    await popup.close();
  });

  test('available block presets render and can be re-added', async ({ context, extensionId }) => {
    const popup = await openPopup(context, extensionId);
    await removeBlockedSite(popup, 'twitter'); // twitter becomes an available preset
    await popup.reload();

    const presets = popup.locator('#preset-suggestions');
    await expect(presets).toBeVisible();
    await presets.locator('.preset-add').first().click();
    await expect(popup.locator('.site-item', { hasText: 'Twitter' })).toBeVisible();
    await popup.close();
  });

  test('pressing Enter in the site input adds a site', async ({ context, extensionId }) => {
    const popup = await openPopup(context, extensionId);
    await popup.locator('#site-input').fill('entersite.com');
    await popup.locator('#site-input').press('Enter');
    await expect(popup.locator('.site-item', { hasText: 'entersite.com' })).toBeVisible();
    await popup.close();
  });

  test('tracker tab: breakdown, presets, add/remove tracked sites', async ({
    context,
    extensionId,
  }) => {
    const popup = await openPopup(context, extensionId);
    await removeTrackedSite(popup, 'instagram'); // instagram becomes a tracking preset
    await setStorage(popup, {
      trackingData: {
        visits: { [`facebook:${todayKey()}`]: 4 },
        time: { [`facebook:${todayKey()}`]: 180 },
      },
    });
    await popup.reload();

    await popup.locator('[data-tab="tracker"]').click();
    await expect(popup.locator('#tracked-breakdown .breakdown-item')).not.toHaveCount(0);

    const trackPresets = popup.locator('#tracking-preset-suggestions');
    await expect(trackPresets).toBeVisible();
    await trackPresets.locator('.preset-add').first().click();

    await popup.locator('#track-site-input').fill('mytracked.com');
    await popup.locator('#track-site-input').press('Enter');
    await expect(popup.locator('#tracked-list')).toContainText('mytracked.com');

    await popup
      .locator('#tracked-list .site-item-track', { hasText: 'mytracked.com' })
      .locator('.site-remove')
      .click();
    await expect(popup.locator('#tracked-list')).not.toContainText('mytracked.com');
    await popup.close();
  });

  test('footer buttons open their respective tabs', async ({ context, extensionId }) => {
    const popup = await openPopup(context, extensionId);
    for (const id of ['#view-gallery', '#view-report', '#test-block']) {
      const [opened] = await Promise.all([context.waitForEvent('page'), popup.locator(id).click()]);
      await opened.waitForLoadState('domcontentloaded').catch(() => {});
    }
    // "Full Report" lives in the Tracker tab.
    await popup.locator('[data-tab="tracker"]').click();
    const [tracking] = await Promise.all([
      context.waitForEvent('page'),
      popup.locator('#view-tracking-report').click(),
    ]);
    await tracking.waitForLoadState('domcontentloaded').catch(() => {});
    await popup.close();
  });

});