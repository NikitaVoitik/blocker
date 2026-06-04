import { expect, test } from '../fixtures/extension';

// content/youtube-shorts.js only injects on youtube.com, so it never runs in the
// test env. Load it into an extension page seeded with matching nodes to cover
// the initial sweep and the MutationObserver re-sweep.
test.describe('Tier 1: content/youtube-shorts.js', () => {
  test('removeShorts hides matching elements on load and as they appear', async ({
    context,
    extensionId,
  }) => {
    const page = await context.newPage();
    await page.goto(`chrome-extension://${extensionId}/offscreen/offscreen.html`);

    // Seed a matching shorts shelf + a node that must be left alone, BEFORE the
    // script loads so the initial removeShorts() pass has something to hide.
    await page.evaluate(() => {
      const shelf = document.createElement('ytd-reel-shelf-renderer');
      shelf.id = 'shelf';
      document.body.appendChild(shelf);
      const keep = document.createElement('div');
      keep.id = 'keep';
      document.body.appendChild(keep);
    });

    await page.addScriptTag({ url: `chrome-extension://${extensionId}/content/youtube-shorts.js` });

    // Initial pass hid the shelf, left the plain div alone.
    expect(await page.locator('#shelf').evaluate((el) => (el as HTMLElement).style.display)).toBe(
      'none',
    );
    expect(await page.locator('#keep').evaluate((el) => (el as HTMLElement).style.display)).toBe(
      '',
    );

    // A dynamically-added shorts node gets hidden by the observer.
    await page.evaluate(() => {
      const el = document.createElement('ytd-rich-shelf-renderer');
      el.setAttribute('is-shorts', '');
      el.id = 'dynamic';
      document.body.appendChild(el);
    });
    await expect
      .poll(() => page.locator('#dynamic').evaluate((el) => (el as HTMLElement).style.display))
      .toBe('none');

    await page.close();
  });
});
