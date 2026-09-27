import { test, expect } from '../fixtures/extension';
import { checkLimits, getTrackedSites, getTrackingDataForToday } from '../helpers/messaging';
import { setStorage } from '../helpers/storage';

// Real wall-clock accrual tests: keep a tracked site focused until genuinely-accrued focus
// time reaches its daily limit, and verify the block fires AT the limit and not before.
// The limit is seeded via storage (SET_SITE_LIMIT enforces a 60s floor) so the 10s case
// works; everything else uses the exact same code path a real 60-minute limit takes.
//
// These are deliberately long. tier3 has no per-test timeout. The 1-hour case also proves
// accumulation past the 1800s/flush cap works, because we flush every ~20s.

function todayKey(): string {
  const d = new Date();
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}

const CASES = [
  { label: '10 seconds', limitSec: 10 },
  { label: '5 minutes', limitSec: 300 },
  { label: '10 minutes', limitSec: 600 },
  { label: '1 hour', limitSec: 3600 },
];

test.describe('Tier 3: Real-Time Limit Accrual', () => {
  test.describe.configure({ retries: 0 }); // long real-time tests must never auto-retry

  for (const c of CASES) {
    test(`blocks reddit after ~${c.label} of real focused browsing`, async ({ context, extensionPage }) => {
      const L = c.limitSec;
      const flushEvery = Math.min(20, Math.max(2, Math.floor(L / 5))); // flush often enough to dodge the 1800s cap

      // Seed the limit + zero usage.
      const sites = await getTrackedSites(extensionPage);
      const updated = sites.map((s: any) => (s.id === 'reddit' ? { ...s, dailyLimitSeconds: L } : s));
      await setStorage(extensionPage, { trackedSites: updated, trackingData: { visits: {}, time: {} } });
      await extensionPage.waitForTimeout(400);

      const page = await context.newPage();
      await page.goto('https://www.reddit.com', { waitUntil: 'domcontentloaded', timeout: 30_000 }).catch(() => {});
      await page.bringToFront();
      await page.waitForTimeout(1500);

      // Establish a clean zero baseline so "recorded time" measures only the loop below
      // (flush away the page-load focus time, then zero the store, then resume focus).
      await extensionPage.bringToFront();
      await extensionPage.waitForTimeout(300);
      await setStorage(extensionPage, { trackingData: { visits: {}, time: {} } });
      await page.bringToFront();

      const deadline = Math.ceil(L * 1.5) + 30; // hard cap on real seconds to wait
      let waited = 0;
      let midChecked = false;
      let blocked = false;

      while (waited < deadline) {
        const chunk = Math.min(flushEvery, deadline - waited);
        await page.waitForTimeout(chunk * 1000);
        waited += chunk;

        // CHECK_LIMITS flushes accrued focus time (each flush << 1800s cap) and boots when over.
        const res = await checkLimits(extensionPage);

        // Once, around the halfway mark, prove the user is NOT blocked before the limit.
        if (!midChecked && waited >= L * 0.3 && waited <= L * 0.7) {
          midChecked = true;
          const data = await getTrackingDataForToday(extensionPage);
          expect(data.reddit?.time ?? 0, `recorded under limit @ ${waited}s real`).toBeLessThan(L);
          expect(res.overLimit, `not over the limit @ ${waited}s real`).not.toContain('reddit');
          expect(page.url(), `reddit still reachable @ ${waited}s real`).not.toContain('blocked/blocked.html');
        }

        if (res.overLimit.includes('reddit')) { blocked = true; break; }
      }

      expect(blocked, `reddit should cross its ${c.label} limit within ${deadline}s of focus`).toBe(true);

      // The focused tab is booted to the limit block page.
      await expect.poll(() => page.url(), { timeout: 10_000 }).toContain('blocked/blocked.html');
      expect(page.url()).toContain('reason=limit');
      expect(page.url()).toContain('site=reddit');

      // And the recorded focus time genuinely reached the configured limit.
      const finalData = await getTrackingDataForToday(extensionPage);
      expect(finalData.reddit.time, 'recorded focus time reached the limit').toBeGreaterThanOrEqual(L);

      await page.close();
    });
  }
});
