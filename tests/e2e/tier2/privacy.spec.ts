import { test, expect, webURL } from '../fixtures/extension';
import { expectBlocked } from '../helpers/navigation';
import { sendMessage } from '../helpers/messaging';

test('capture, report and gallery keep photos and browsing data on the device', async ({ context, extensionPage: popup, extensionId }, info) => {
  const traffic: { url: string; kind: string; from: string }[] = [];
  const sockets: string[] = [];
  context.on('request', request => {
    if (!/^https?:/.test(request.url())) return;
    let from = 'unknown';
    try { from = request.serviceWorker()?.url() || request.frame().url(); } catch { /* navigation without a frame */ }
    traffic.push({ url: request.url(), kind: request.resourceType(), from });
  });
  const watch = (page: import('@playwright/test').Page) => page.on('websocket', socket => sockets.push(socket.url()));
  context.pages().forEach(watch);
  context.on('page', watch);
  await popup.reload();
  const blocked = await context.newPage();
  const destination = webURL('http://twitter.com/');
  await expectBlocked(blocked, destination, 'twitter');
  await expect.poll(async () => (await sendMessage(popup, { type: 'GET_PHOTOS' })).length).toBe(1);
  const report = await context.newPage();
  await report.goto(`chrome-extension://${extensionId}/report/report.html`);
  await expect(report.locator('#all-time-count')).toHaveText('1');
  const gallery = await context.newPage();
  await gallery.goto(`chrome-extension://${extensionId}/blocked/blocked.html?gallery=true`);
  await expect(gallery.locator('#gallery-grid .gallery-item')).toHaveCount(1);
  await expect.poll(() => gallery.locator('.gallery-item img').evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0)).toBe(true);
  const setup = await context.newPage();
  await setup.goto(`chrome-extension://${extensionId}/setup/setup.html`);
  await expect(setup.locator('#enable-camera')).toBeVisible();
  // Bounded observation catches delayed initializers, not arbitrary future timers.
  await setup.waitForTimeout(1500);
  await info.attach('network-observation', { body: JSON.stringify({ traffic, sockets }, null, 2), contentType: 'application/json' });
  expect(traffic.filter(request => request.url !== destination || request.kind !== 'document'), 'Unexpected network traffic from a local-only extension').toEqual([]);
  expect(sockets, 'Unexpected WebSocket connection').toEqual([]);
});
