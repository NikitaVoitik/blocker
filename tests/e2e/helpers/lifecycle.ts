import type { BrowserContext } from '@playwright/test';

export async function stopExtensionWorker(context: BrowserContext, extensionId: string): Promise<void> {
  const cdp = await context.browser()!.newBrowserCDPSession();
  try {
    const { targetInfos } = await cdp.send('Target.getTargets');
    const target = targetInfos.find(info => info.type === 'service_worker' && info.url.includes(extensionId));
    if (!target) throw new Error('Extension worker is missing');
    const { success } = await cdp.send('Target.closeTarget', { targetId: target.targetId });
    if (!success) throw new Error('Could not stop extension worker');
  } finally { await cdp.detach(); }
}
