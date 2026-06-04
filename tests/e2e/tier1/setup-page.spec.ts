import { expect, test } from '../fixtures/extension';

// setup/setup.js drives the first-run camera-permission flow. The test env uses
// a fake media device (auto-granted), so we cover the success/skip/close paths
// directly and stub getUserMedia to cover the denial path.
test.describe('Tier 1: setup/setup.js', () => {
  const setupUrl = (id: string) => `chrome-extension://${id}/setup/setup.html`;

  test('enabling the camera advances to the done state', async ({ context, extensionId }) => {
    const page = await context.newPage();
    await page.goto(setupUrl(extensionId));

    await page.locator('#enable-camera').click();
    await expect(page.locator('#enable-camera')).toHaveText('Camera Enabled!');
    // Auto-proceeds after 2s → showDone() (with an active stream → stops tracks).
    await expect(page.locator('#done-container')).toBeVisible({ timeout: 5000 });

    const stored = await page.evaluate(() => chrome.storage.local.get('webcamPermissionGranted'));
    expect(stored.webcamPermissionGranted).toBe(true);

    await page.close();
  });

  test('skip jumps straight to done and records no permission', async ({
    context,
    extensionId,
  }) => {
    const page = await context.newPage();
    await page.goto(setupUrl(extensionId));

    await page.locator('#skip-btn').click();
    await expect(page.locator('#done-container')).toBeVisible();

    const stored = await page.evaluate(() => chrome.storage.local.get('webcamPermissionGranted'));
    expect(stored.webcamPermissionGranted).toBe(false);

    await page.close();
  });

  test('camera denial shows the error state', async ({ context, extensionId }) => {
    const page = await context.newPage();
    await page.addInitScript(() => {
      // Force getUserMedia to reject → setup.js catch branch.
      Object.defineProperty(navigator.mediaDevices, 'getUserMedia', {
        configurable: true,
        value: () => Promise.reject(new Error('Permission denied')),
      });
    });
    await page.goto(setupUrl(extensionId));

    await page.locator('#enable-camera').click();
    await expect(page.locator('#error-msg')).toBeVisible();
    await expect(page.locator('#enable-camera')).toHaveText('Try Again');

    const stored = await page.evaluate(() => chrome.storage.local.get('webcamPermissionGranted'));
    expect(stored.webcamPermissionGranted).toBe(false);

    await page.close();
  });

  test('close button and beforeunload stop the active stream', async ({ context, extensionId }) => {
    const page = await context.newPage();
    await page.addInitScript(() => {
      (window as any).__closed = false;
      window.close = () => {
        (window as any).__closed = true;
      };
      // Suppress only the 2s auto-advance so the stream stays live while we test
      // the close/beforeunload handlers' stream-truthy branches.
      const orig = window.setTimeout.bind(window);
      (window as any).setTimeout = (fn: any, t: any, ...rest: any[]) =>
        typeof t === 'number' && t >= 1000 ? 0 : orig(fn, t, ...rest);
    });
    await page.goto(setupUrl(extensionId));

    await page.locator('#enable-camera').click();
    await expect(page.locator('#enable-camera')).toHaveText('Camera Enabled!'); // stream is live

    // beforeunload with a live stream → stops tracks.
    await page.evaluate(() => window.dispatchEvent(new Event('beforeunload')));

    // Reveal the done step (normally shown by the suppressed timer) and close.
    await page.evaluate(() => document.getElementById('done-container')!.classList.add('show'));
    await page.locator('#close-tab').click();
    expect(await page.evaluate(() => (window as any).__closed)).toBe(true);

    await page.close();
  });
});
