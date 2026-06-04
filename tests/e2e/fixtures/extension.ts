import { test as base, chromium, type BrowserContext, type Page } from '@playwright/test';
import path from 'path';
import fs from 'fs';

const REPO_ROOT = path.resolve(__dirname, '../../../');

// When COVERAGE=1, load the istanbul-instrumented copy (built by the coverage
// global-setup) instead of the repo root, and dump each context's __coverage__
// to coverage/.raw for the global-teardown to aggregate. Off by default so
// `npm test` is completely unaffected.
const COVERAGE = !!process.env.COVERAGE;
const INSTRUMENTED_DIR = path.join(REPO_ROOT, 'coverage', '.instrumented');
const RAW_DIR = path.join(REPO_ROOT, 'coverage', '.raw');
const EXTENSION_PATH = COVERAGE ? INSTRUMENTED_DIR : REPO_ROOT;

let covCounter = 0;
function writeCoverage(data: unknown): void {
  if (!data || typeof data !== 'object' || !Object.keys(data as object).length) return;
  try {
    fs.mkdirSync(RAW_DIR, { recursive: true });
    const file = path.join(RAW_DIR, `cov-${process.pid}-${Date.now()}-${covCounter++}.json`);
    fs.writeFileSync(file, JSON.stringify(data));
  } catch {
    // best-effort: a lost dump just lowers the reported number
  }
}

async function dumpPage(page: Page): Promise<void> {
  if (page.isClosed()) return;
  try {
    const cov = await page.evaluate(() => (window as any).__coverage__).catch(() => null);
    writeCoverage(cov);
  } catch {
    // ignore
  }
}

// Tests routinely call page.close() before the fixture tears down, which would
// drop that page's __coverage__. Patch close so each page flushes coverage just
// before it actually closes.
function hookPageClose(page: Page): void {
  const origClose = page.close.bind(page);
  (page as any).close = async (...args: unknown[]) => {
    await dumpPage(page);
    return origClose(...(args as []));
  };
}

async function collectCoverage(context: BrowserContext): Promise<void> {
  // Service worker counter (captures startup + message-handler execution).
  try {
    const sw = context.serviceWorkers()[0];
    if (sw) {
      const swCov = await sw.evaluate(() => (globalThis as any).__coverage__).catch(() => null);
      writeCoverage(swCov);
    }
  } catch {
    // ignore
  }
  // Every still-open page that ran instrumented extension scripts.
  for (const page of context.pages()) {
    await dumpPage(page);
  }
}

export type ExtensionFixtures = {
  context: BrowserContext;
  extensionId: string;
  extensionPage: Page;
};

export const test = base.extend<ExtensionFixtures>({
  context: async ({}, use) => {
    const context = await chromium.launchPersistentContext('', {
      headless: false,
      args: [
        `--disable-extensions-except=${EXTENSION_PATH}`,
        `--load-extension=${EXTENSION_PATH}`,
        '--no-first-run',
        '--disable-gpu',
        '--use-fake-device-for-media-stream',
        '--use-fake-ui-for-media-stream',
      ],
    });
    if (COVERAGE) {
      context.on('page', hookPageClose);
      context.pages().forEach(hookPageClose);
    }
    await use(context);
    if (COVERAGE) {
      await collectCoverage(context);
    }
    await context.close();
  },

  extensionId: async ({ context }, use) => {
    let sw = context.serviceWorkers()[0];
    if (!sw) {
      sw = await context.waitForEvent('serviceworker');
    }
    const extensionId = sw.url().split('/')[2];
    await use(extensionId);
  },

  extensionPage: async ({ context, extensionId }, use) => {
    const page = await context.newPage();
    await page.goto(`chrome-extension://${extensionId}/blocked/blocked.html`);
    await use(page);
  },
});

export { expect } from '@playwright/test';
