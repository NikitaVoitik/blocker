import { test, expect, webURL } from '../fixtures/extension';
import { addBlockedSite, addTrackedSite, getTrackingDataForToday } from '../helpers/messaging';
import { expectBlocked } from '../helpers/navigation';

test('50 blocked sites all redirect correctly', async ({ context, extensionPage }) => {
  for (let i = 0; i < 50; i++) {
    const host = `stress-block-${i}.test`;
    expect((await addBlockedSite(extensionPage, { id: host, label: host, domains: [host] })).success).toBe(true);
  }
  const page = await context.newPage();
  for (let i = 0; i < 50; i++) {
    const host = `stress-block-${i}.test`;
    await expectBlocked(page, `http://${host}/`, host);
  }
});

test('50 tracked sites each count exactly one real navigation', async ({ context, extensionPage }) => {
  const hosts = Array.from({ length: 50 }, (_, i) => `stress-track-${i}.test`);
  for (const host of hosts) {
    expect((await addTrackedSite(extensionPage, { id: host, label: host, domains: [host] })).success).toBe(true);
  }
  const page = await context.newPage();
  for (const host of hosts) {
    await page.goto(webURL(`http://${host}/`));
    await expect(page.locator('h1')).toHaveText('Test page');
  }
  await expect.poll(async () => {
    const data = await getTrackingDataForToday(extensionPage);
    return hosts.map(host => data[host]?.visits);
  }).toEqual(hosts.map(() => 1));
});
