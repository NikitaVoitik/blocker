import { defineConfig } from '@playwright/test';
import path from 'path';

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 60_000,
  retries: 1,
  workers: 1,
  reporter: [['html', { open: 'never' }], ['list']],
  use: {
    headless: false,
    viewport: { width: 1280, height: 720 },
  },
  projects: [
    {
      name: 'tier1',
      testMatch: /tier1\/.+\.spec\.ts/,
      timeout: 60_000,
    },
    {
      name: 'tier2',
      testMatch: /tier2\/.+\.spec\.ts/,
      timeout: 120_000,
    },
    {
      name: 'tier3',
      testMatch: /tier3\/.+\.spec\.ts/,
      timeout: 0,
    },
  ],
});
