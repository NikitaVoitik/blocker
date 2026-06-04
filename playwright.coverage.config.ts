import { defineConfig } from '@playwright/test';
import base from './playwright.config';

// Coverage run: instrument + collect (via the extension fixture, gated on
// COVERAGE=1), restricted to tier1+tier2 (tier3 is soak/stress and adds no
// new lines). retries:1 (as in the base config) absorbs the occasional flaky
// real-time timing test; coverage merges across reruns, so it isn't inflated.
export default defineConfig({
  ...base,
  retries: 1,
  globalSetup: require.resolve('./coverage/global-setup.cjs'),
  globalTeardown: require.resolve('./coverage/global-teardown.cjs'),
  projects: [
    { name: 'tier1', testMatch: /tier1\/.+\.spec\.ts/, timeout: 60_000 },
    { name: 'tier2', testMatch: /tier2\/.+\.spec\.ts/, timeout: 120_000 },
  ],
});
