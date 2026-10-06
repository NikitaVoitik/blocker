// Repeatable browser walkthrough of all three UX candidates, with real dwell time.
const { chromium, expect } = require('@playwright/test');
const fs = require('node:fs/promises');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 780, height: 900 }, reducedMotion: 'reduce' });
  const output = path.join(__dirname, 'commitment-lock-evidence');
  await fs.mkdir(output, { recursive: true });
  await page.context().tracing.start({ screenshots: true, snapshots: true });
  const results = [];
  try {
    await page.goto(pathToFileURL(path.join(__dirname, 'commitment-lock-preview.html')).href);
    const frame = page.frameLocator('iframe');
    for (const variant of ['add', 'row', 'screen']) {
      const started = Date.now();
      await frame.getByRole('button', { name: { add: 'A · At add', row: 'B · Per site', screen: 'C · Commitment screen' }[variant], exact: true }).click();
      for (let round = 0; round < 3; round++) {
        await frame.getByRole('button', { name: 'Restart demo', exact: true }).click();
        if (variant === 'add') {
          await frame.getByLabel('Site to block').fill('reddit.com');
          await frame.getByLabel('Commitment when adding').selectOption('24');
          await frame.getByRole('button', { name: 'Block + lock', exact: true }).click();
        } else if (variant === 'row') {
          await frame.getByRole('button', { name: 'Lock Twitter / X', exact: true }).click();
        } else {
          await frame.getByRole('button', { name: 'Commitments', exact: true }).click();
          await frame.getByRole('button', { name: 'Set commitment for Twitter / X', exact: true }).click();
        }
        await frame.getByRole('button', { name: '7 days', exact: true }).click();
        await expect(frame.getByText('The site stays blocked after this deadline.', { exact: true })).toBeVisible();
        await frame.getByRole('button', { name: 'Cancel', exact: true }).click();
        if (variant === 'add') await frame.getByRole('button', { name: 'Block + lock', exact: true }).click();
        else if (variant === 'row') await frame.getByRole('button', { name: 'Lock Twitter / X', exact: true }).click();
        else await frame.getByRole('button', { name: 'Set commitment for Twitter / X', exact: true }).click();
        await frame.getByRole('button', { name: '1 hour', exact: true }).click();
        await frame.getByRole('button', { name: 'Lock removal for 1 hour', exact: true }).click();
        if (variant === 'screen') await frame.getByRole('button', { name: 'Back to blocker', exact: true }).click();
        const site = variant === 'add' ? 'reddit.com' : 'Twitter / X';
        await expect(frame.getByRole('button', { name: `Locked ${site}`, exact: true })).toBeVisible();
        await page.waitForTimeout(4000);
        await frame.getByRole('button', { name: `Locked ${site}`, exact: true }).click();
        await expect(frame.getByText('YOU MADE A DEAL.', { exact: true })).toBeVisible();
        if (round === 0) await page.screenshot({ path: path.join(output, `${variant}-locked.png`) });
        await page.waitForTimeout(4000);
        await frame.getByRole('button', { name: 'Back to blocker', exact: true }).click();
        await frame.getByRole('button', { name: 'Advance past expiry', exact: true }).click();
        await expect(frame.getByText('Commitment served · still blocked').first()).toBeVisible();
        await frame.getByRole('button', { name: `Remove ${site}`, exact: true }).click();
        await expect(frame.getByText('STEP 1/3', { exact: true })).toBeVisible();
        await frame.getByRole('button', { name: 'Cancel', exact: true }).click();
        await expect(frame.getByText(site, { exact: true }).first()).toBeVisible();
        await page.waitForTimeout(4000);
        await frame.getByRole('button', { name: `Remove ${site}`, exact: true }).click();
        await frame.getByRole('button', { name: 'Continue', exact: true }).click();
        await frame.getByRole('button', { name: 'Continue', exact: true }).click();
        await frame.getByRole('button', { name: 'Remove', exact: true }).click();
        await expect(frame.getByText(site, { exact: true })).toHaveCount(0);
        await page.waitForTimeout(4000);
        await frame.getByRole('button', { name: 'Reopen popup', exact: true }).click();
        await page.waitForTimeout(4000);
      }
      results.push({ variant, rounds: 3, seconds: Math.round((Date.now() - started) / 1000), workflows: ['change duration', 'cancel commitment', 'confirm commitment', 'inspect active lock', 'expiry retains block', 'cancel removal', 'complete gauntlet', 'reopen popup'], passed: true });
    }
    await page.setViewportSize({ width: 360, height: 900 });
    await frame.getByRole('button', { name: 'B · Per site', exact: true }).click();
    await frame.getByRole('button', { name: 'Restart demo', exact: true }).click();
    await frame.getByRole('button', { name: 'Lock Twitter / X', exact: true }).click();
    await expect(frame.getByRole('button', { name: 'Lock removal for 24 hours', exact: true })).toBeVisible();
    await page.screenshot({ path: path.join(output, 'row-confirmation-360.png') });
    await fs.writeFile(path.join(output, 'walkthrough.json'), JSON.stringify({ runAt: new Date().toISOString(), results }, null, 2) + '\n');
    console.log(JSON.stringify(results));
  } finally {
    await page.context().tracing.stop({ path: path.join(output, 'walkthrough-trace.zip') });
    await browser.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
