import { test, expect, type BrowserContext } from '@playwright/test';
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';

const finalizers = new WeakMap<BrowserContext, () => Promise<void>>();

export async function observeContext(context: BrowserContext, extensionPath: string) {
  const info = test.info();
  const index = info.attachments.filter(a => a.name === 'browser-start').length;
  const prefix = `browser-${index}`;
  const events: object[] = [];
  const errors: string[] = [];
  let droppedEvents = 0;
  const record = (event: object) => {
    if (events.length === 500) { events.shift(); droppedEvents++; }
    events.push({ at: new Date().toISOString(), ...event });
  };
  context.on('weberror', event => {
    errors.push(event.error().stack || event.error().message);
    record({ type: 'uncaught', error: event.error().message, url: event.page()?.url() });
  });
  context.on('console', message => record({ type: `console.${message.type()}`, text: message.text(), location: message.location() }));
  context.on('requestfailed', request => record({ type: 'requestfailed', url: request.url(), error: request.failure()?.errorText }));
  const receiptPath = path.resolve(__dirname, '../../../dist/package-receipt.json');
  const manifest = JSON.parse(readFileSync(path.join(extensionPath, 'manifest.json'), 'utf8'));
  const identity = {
    browser: context.browser()?.version(), extensionPath,
    manifest,
    workerSha256: createHash('sha256').update(readFileSync(path.join(extensionPath, manifest.background.service_worker))).digest('hex'),
    package: extensionPath === path.resolve(__dirname, '../../../dist/test-extension') && existsSync(receiptPath) ? JSON.parse(readFileSync(receiptPath, 'utf8')) : null,
    test: info.titlePath, seed: process.env.TEST_SEEDS || '73421',
  };
  await info.attach('browser-start', { body: JSON.stringify(identity, null, 2), contentType: 'application/json' });
  await context.tracing.start({ screenshots: true, snapshots: true, sources: true });
  finalizers.set(context, async () => {
    const pages = context.pages();
    for (const [i, page] of pages.entries()) {
      if (page.isClosed() || !page.url().startsWith('chrome-extension://')) continue;
      try {
        await info.attach(`${prefix}-page-${i}`, { body: await page.screenshot({ timeout: 5000 }), contentType: 'image/png' });
      } catch (error) { record({ type: 'screenshot-unavailable', url: page.url(), error: String(error) }); }
    }
    await info.attach(`${prefix}-diagnostics`, {
      body: JSON.stringify({ ...identity, pages: pages.map(page => page.url()), errors, events, droppedEvents }, null, 2),
      contentType: 'application/json',
    });
    const trace = info.outputPath(`${prefix}-trace.zip`);
    await context.tracing.stop({ path: trace });
    await info.attach('trace', { path: trace, contentType: 'application/zip' });
    expect(errors, 'Uncaught browser errors; see diagnostics attachment').toEqual([]);
  });
}

// Use this for explicit browser restarts too, so evidence survives context.close().
export async function closeExtension(context: BrowserContext) {
  const finish = finalizers.get(context);
  finalizers.delete(context);
  try { await finish?.(); } finally { await context.close(); }
}
