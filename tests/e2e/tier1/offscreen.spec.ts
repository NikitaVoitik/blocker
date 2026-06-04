import { test, expect } from '../fixtures/extension';

// offscreen/offscreen.js normally runs in an offscreen document the service
// worker creates and then closes, so its __coverage__ is gone before teardown.
// We instead open two offscreen.html pages of our own: one sends messages, the
// other receives them (the SW ignores offscreen-origin senders), keeping the
// responder page alive so its coverage is captured.
declare function capturePhoto(): Promise<string>;

test.describe('Tier 1: offscreen/offscreen.js', () => {
  test('capturePhoto + CAPTURE_PHOTO/CLEANUP message handlers', async ({ context, extensionId }) => {
    const url = `chrome-extension://${extensionId}/offscreen/offscreen.html`;
    const responder = await context.newPage();
    await responder.goto(url);
    const sender = await context.newPage();
    await sender.goto(url);

    // Direct call covers capturePhoto() success + cleanup() with a live stream.
    const dataUrl = await responder.evaluate(() => capturePhoto());
    expect(typeof dataUrl).toBe('string');
    expect(dataUrl.startsWith('data:image/')).toBe(true);

    // Message from an offscreen-origin page: the SW ignores it, the responder
    // page's listener handles CAPTURE_PHOTO → capturePhoto → success response.
    const captureRes = await sender.evaluate(
      () =>
        new Promise((resolve) => {
          chrome.runtime.sendMessage({ type: 'CAPTURE_PHOTO' }, (r) => resolve(r));
        }),
    );
    expect(captureRes).toBeTruthy();
    expect((captureRes as any).success).toBe(true);

    // CLEANUP branch of the listener.
    const cleanupRes = await sender.evaluate(
      () =>
        new Promise((resolve) => {
          chrome.runtime.sendMessage({ type: 'CLEANUP' }, (r) => resolve(r));
        }),
    );
    expect((cleanupRes as any).success).toBe(true);

    // capturePhoto error path: stream is null after cleanup, so getUserMedia is
    // called again — force it to reject to hit the catch + rethrow.
    const threw = await responder.evaluate(async () => {
      Object.defineProperty(navigator.mediaDevices, 'getUserMedia', {
        configurable: true,
        value: () => Promise.reject(new Error('camera denied')),
      });
      try {
        await capturePhoto();
        return 'resolved';
      } catch {
        return 'threw';
      }
    });
    expect(threw).toBe('threw');

    // beforeunload → cleanup() once more.
    await responder.evaluate(() => window.dispatchEvent(new Event('beforeunload')));

    await sender.close();
    await responder.close();
  });
});
