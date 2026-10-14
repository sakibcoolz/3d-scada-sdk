import { expect, test, type Page } from '@playwright/test';
import { project, waitForCanvas } from './helpers';

const activeSubscriptions = (page: Page) => page.evaluate(() => (window as unknown as { __demoFeed: { active(): number } }).__demoFeed.active());

test('the demo feed reaches the viewer through a DataProvider subscription', async ({ page }) => {
  await page.goto('/?demo');
  await waitForCanvas(page);
  await expect(page.getByLabel('Telemetry summary')).toHaveText('Tags: 3 good, 0 uncertain, 0 unknown');
  expect(await activeSubscriptions(page)).toBe(1);
});

test('unmounting releases the subscription, also across repeated mounts', async ({ page }) => {
  await page.goto('/?demo');
  await waitForCanvas(page);
  const mount = page.getByLabel('Mount editor');
  for (let i = 0; i < 5; i++) {
    await mount.uncheck();
    await expect.poll(() => activeSubscriptions(page)).toBe(0);
    await mount.check();
    await expect.poll(() => activeSubscriptions(page)).toBe(1);
  }
  await waitForCanvas(page);
  await expect(page.getByLabel('Telemetry summary')).toHaveText('Tags: 3 good, 0 uncertain, 0 unknown');
});

test('two independent viewers each hold one subscription', async ({ page }) => {
  await page.goto('/?demo');
  await waitForCanvas(page);
  await page.getByLabel('Second viewer').check();
  await expect.poll(() => activeSubscriptions(page)).toBe(2);
  await expect(page.getByLabel('Telemetry summary')).toHaveCount(2);
  await page.getByLabel('Second viewer').uncheck();
  await expect.poll(() => activeSubscriptions(page)).toBe(1);
});

test('setTagValues pushes values through the editor handle', async ({ page }) => {
  await page.goto('/?demo');
  await waitForCanvas(page);
  await page.getByLabel('Live readings').uncheck();
  await page.evaluate(() =>
    (window as unknown as { __scadaEditor: { setTagValues(o: unknown[]): void } }).__scadaEditor.setTagValues([
      { tagId: 'LT-101', value: 20, quality: 'GOOD', sourceTimestamp: new Date(Date.now() + 1000).toISOString() },
    ]),
  );
  const box = (await page.locator('canvas').boundingBox())!;
  const tank = project([0, 2.2, 1], box);
  await page.mouse.click(tank.x, tank.y);
  await expect(page.getByLabel('Live values')).toContainText('level: 20 % · GOOD');
});

test('the SDK opens no network connection in any mode', async ({ page }) => {
  await page.addInitScript(() => {
    const calls: string[] = [];
    (window as unknown as { __networkCalls: string[] }).__networkCalls = calls;
    const originalFetch = window.fetch;
    window.fetch = (...args: Parameters<typeof fetch>) => {
      calls.push(`fetch ${String(args[0])}`);
      return originalFetch(...args);
    };
    const open = XMLHttpRequest.prototype.open;
    XMLHttpRequest.prototype.open = function (this: XMLHttpRequest, ...args: unknown[]) {
      calls.push(`xhr ${String(args[1])}`);
      return (open as (...a: unknown[]) => void).apply(this, args);
    } as typeof XMLHttpRequest.prototype.open;
    const NativeWebSocket = window.WebSocket;
    window.WebSocket = class extends NativeWebSocket {
      constructor(url: string | URL, protocols?: string | string[]) {
        calls.push(`websocket ${String(url)}`);
        super(url, protocols);
      }
    };
    const NativeEventSource = window.EventSource;
    window.EventSource = class extends NativeEventSource {
      constructor(url: string | URL, init?: EventSourceInit) {
        calls.push(`eventsource ${String(url)}`);
        super(url, init);
      }
    };
    navigator.sendBeacon = (url: string | URL) => {
      calls.push(`beacon ${String(url)}`);
      return false;
    };
  });
  const requests: string[] = [];
  page.on('request', (request) => {
    if (['fetch', 'xhr', 'websocket', 'eventsource'].includes(request.resourceType())) requests.push(request.url());
  });
  page.on('websocket', (socket) => requests.push(socket.url()));

  for (const url of ['/', '/?demo']) {
    await page.goto(url);
    await waitForCanvas(page);
    await page.getByRole('button', { name: 'Vertical Tank +' }).click();
    await page.getByLabel('View mode', { exact: true }).selectOption('glass');
    await page.waitForTimeout(1500);
  }
  await page.getByLabel('Second viewer').check();
  await page.getByLabel('Mount editor').uncheck();
  await page.getByLabel('Mount editor').check();
  await page.waitForTimeout(1500);

  expect(await page.evaluate(() => (window as unknown as { __networkCalls: string[] }).__networkCalls)).toEqual([]);
  expect(requests).toEqual([]);
});
