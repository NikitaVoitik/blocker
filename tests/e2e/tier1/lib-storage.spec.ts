import { expect, test } from '../fixtures/extension';

// lib/storage.js (ShameStorage) is a standalone IndexedDB helper not used by any
// page. Load it into an extension page and drive its public methods.
declare const shameStorage: any;

test.describe('Tier 1: lib/storage.js (ShameStorage)', () => {
  test('open (incl. cached handle), getPhotos, getPhotoCount, clearPhotos', async ({
    context,
    extensionId,
  }) => {
    const page = await context.newPage();
    await page.goto(`chrome-extension://${extensionId}/offscreen/offscreen.html`);
    await page.addScriptTag({ url: `chrome-extension://${extensionId}/lib/storage.js` });

    const res = await page.evaluate(async () => {
      const db1 = await shameStorage.open();
      const db2 = await shameStorage.open(); // returns cached this.db
      const before = await shameStorage.getPhotoCount();
      const photos = await shameStorage.getPhotos();
      await shameStorage.clearPhotos();
      const after = await shameStorage.getPhotoCount();
      return { sameHandle: db1 === db2, before, photosIsArray: Array.isArray(photos), after };
    });

    expect(res.sameHandle).toBe(true);
    expect(res.photosIsArray).toBe(true);
    expect(typeof res.before).toBe('number');
    expect(res.after).toBe(0);

    await page.close();
  });
});
