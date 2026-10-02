import { test as base, chromium, type BrowserContext, type Page } from '@playwright/test';
import path from 'node:path';
import http from 'node:http';
import https from 'node:https';
import { readFileSync } from 'node:fs';

const EXTENSION_PATH = path.resolve(__dirname, '../../../');
let serverPort = 0;
let securePort = 0;

// Real HTTP responses keep navigation, redirects, DNR and content scripts in Chrome.
// All hosts resolve locally; tests never depend on a public site's availability.
export function webURL(input: string): string {
  const url = new URL(input);
  url.port = String(url.protocol === 'https:' ? securePort : serverPort);
  return url.href;
}

export async function launchExtension(profile = '', camera = true): Promise<BrowserContext> {
  return chromium.launchPersistentContext(profile, {
    headless: false,
    ignoreHTTPSErrors: true,
    args: [
      `--disable-extensions-except=${EXTENSION_PATH}`,
      `--load-extension=${EXTENSION_PATH}`,
      '--no-first-run', '--disable-gpu', '--no-proxy-server',
      '--host-resolver-rules=MAP * 127.0.0.1, EXCLUDE localhost',
      ...(camera ? ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'] : ['--deny-permission-prompts']),
    ],
  });
}

export async function extensionIdFor(context: BrowserContext): Promise<string> {
  const sw = context.serviceWorkers()[0] || await context.waitForEvent('serviceworker');
  return new URL(sw.url()).host;
}

type Fixtures = { context: BrowserContext; extensionId: string; extensionPage: Page; camera: boolean };
type WorkerFixtures = { webServer: void };

export const test = base.extend<Fixtures, WorkerFixtures>({
  camera: [true, { option: true }],
  webServer: [async ({}, use) => {
    const handle: http.RequestListener = (req, res) => {
      const url = new URL(req.url || '/', 'http://localhost');
      if (url.pathname === '/redirect') {
        res.writeHead(302, { Location: url.searchParams.get('to') || '/' });
        res.end();
        return;
      }
      res.writeHead(200, { 'Content-Type': 'text/html', 'Cache-Control': 'no-store' });
      res.end('<!doctype html><html><body><h1>Test page</h1><ytd-reel-shelf-renderer>Shorts shelf</ytd-reel-shelf-renderer></body></html>');
    };
    const server = http.createServer(handle);
    const secure = https.createServer({
      key: readFileSync(path.join(__dirname, 'test-key.pem')),
      cert: readFileSync(path.join(__dirname, 'test-cert.pem')),
    }, handle);
    await new Promise<void>(resolve => secure.listen(0, '127.0.0.1', resolve));
    securePort = (secure.address() as import('node:net').AddressInfo).port;
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
    serverPort = (server.address() as import('node:net').AddressInfo).port;
    try { await use(); } finally {
      await Promise.all([server, secure].map(instance => new Promise<void>(resolve => instance.close(() => resolve()))));
    }
  }, { scope: 'worker' }],
  context: async ({ webServer, camera }, use) => {
    const context = await launchExtension('', camera);
    try {
      const id = await extensionIdFor(context);
      const ready = await context.newPage();
      await ready.goto(`chrome-extension://${id}/popup/popup.html`);
      await ready.locator('#blocked-list .site-item').first().waitFor();
      await ready.close();
      await use(context);
    } finally { await context.close(); }
  },
  extensionId: async ({ context }, use) => { await use(await extensionIdFor(context)); },
  extensionPage: async ({ context, extensionId }, use) => {
    const page = await context.newPage();
    await page.goto(`chrome-extension://${extensionId}/popup/popup.html`);
    await page.locator('#blocked-list .site-item').first().waitFor();
    await use(page);
  },
});

export { expect, type Page } from '@playwright/test';
