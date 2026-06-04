import { expect, test } from '../fixtures/extension';

// lib/filters.js (OverlayFilters) is shipped as a web-accessible resource but
// isn't wired into any page, so it never runs during normal flows. Load it into
// an extension-origin page and exercise it directly.
declare const OverlayFilters: any;

test.describe('Tier 1: lib/filters.js (OverlayFilters)', () => {
  test('overlay selection, canvas filters, and image loading', async ({ context, extensionId }) => {
    const page = await context.newPage();
    await page.goto(`chrome-extension://${extensionId}/offscreen/offscreen.html`);
    await page.addScriptTag({ url: `chrome-extension://${extensionId}/lib/filters.js` });

    // getOverlayForCount thresholds (none / clown / sad / crying)
    const sel = await page.evaluate(() => ({
      none: OverlayFilters.getOverlayForCount(0),
      clown: OverlayFilters.getOverlayForCount(3),
      sad: OverlayFilters.getOverlayForCount(6),
      crying: OverlayFilters.getOverlayForCount(10),
    }));
    expect(sel.none).toBeNull();
    expect(sel.clown.src).toContain('clown');
    expect(sel.sad.src).toContain('wojak-sad');
    expect(sel.crying.src).toContain('wojak-crying');

    // applyOverlay: null config → false; 'center' (clown); 'overlay' (sad/crying);
    // plus a tiny canvas to force the scale-to-fit branch.
    const results = await page.evaluate(async () => {
      const mk = (w: number, h: number) => {
        const c = document.createElement('canvas');
        c.width = w;
        c.height = h;
        return c;
      };
      return {
        none: await OverlayFilters.applyOverlay(mk(200, 150), 0),
        centerBig: await OverlayFilters.applyOverlay(mk(800, 600), 3),
        centerTiny: await OverlayFilters.applyOverlay(mk(30, 30), 3), // scale-to-fit branch
        overlaySad: await OverlayFilters.applyOverlay(mk(200, 150), 6),
        overlayCrying: await OverlayFilters.applyOverlay(mk(200, 150), 10),
      };
    });
    expect(results.none).toBe(false);
    expect(results.centerBig).toBe(true);
    expect(results.centerTiny).toBe(true);
    expect(results.overlaySad).toBe(true);
    expect(results.overlayCrying).toBe(true);

    // Text/grayscale/red-tint helpers run without throwing (default + custom opts).
    await page.evaluate(() => {
      const c = document.createElement('canvas');
      c.width = 64;
      c.height = 64;
      const ctx = c.getContext('2d')!;
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, 64, 64);
      OverlayFilters.applyTextOverlay(c, 'SHAME');
      OverlayFilters.applyTextOverlay(c, 'X', {
        font: '12px monospace',
        color: '#0f0',
        strokeColor: '#fff',
        y: 10,
        align: 'left',
      });
      OverlayFilters.applyGrayscale(c);
      OverlayFilters.applyRedTint(c);
      OverlayFilters.applyRedTint(c, 0.5);
    });

    // loadImage rejects for a missing asset.
    const loadErr = await page.evaluate(async () => {
      try {
        await OverlayFilters.loadImage('assets/overlays/does-not-exist.png');
        return null;
      } catch (e) {
        return (e as Error).message;
      }
    });
    expect(loadErr).toContain('Failed to load');

    // applyOverlay swallows a load failure and returns false (catch branch).
    const overlayFail = await page.evaluate(async () => {
      const orig = OverlayFilters.loadImage;
      OverlayFilters.loadImage = () => Promise.reject(new Error('boom'));
      const c = document.createElement('canvas');
      c.width = 100;
      c.height = 100;
      const r = await OverlayFilters.applyOverlay(c, 3);
      OverlayFilters.loadImage = orig;
      return r;
    });
    expect(overlayFail).toBe(false);

    await page.close();
  });
});
