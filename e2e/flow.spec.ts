import { expect, test } from '@playwright/test';
import { waitForCanvas } from './helpers';

const summary = (page: import('@playwright/test').Page) => page.getByLabel('Flow summary');

test('demo flow shows host readings, reverse flow and bad quality without inventing flow', async ({ page }) => {
  await page.goto('/?demo');
  await waitForCanvas(page);
  // tee-b has no reading in the demo, so it stays unknown even though its valve is open.
  await expect(summary(page)).toHaveText('Flow: 4 forward, 0 reverse, 0 stopped, 1 unknown (1 no reading)');

  await page.getByLabel('Value FT-101').fill('-2');
  await expect(summary(page)).toHaveText('Flow: 3 forward, 1 reverse, 0 stopped, 1 unknown (1 no reading)');

  await page.getByLabel('Value FT-102').fill('0');
  await expect(summary(page)).toHaveText('Flow: 2 forward, 1 reverse, 1 stopped, 1 unknown (1 no reading)');

  await page.getByLabel('Quality FT-103').selectOption('BAD');
  await expect(summary(page)).toHaveText('Flow: 1 forward, 1 reverse, 1 stopped, 2 unknown (1 bad quality, 1 no reading)');

  await expect(page.getByText('SIMULATED FLOW')).toHaveCount(0);
});

test('simulated readings are labelled', async ({ page }) => {
  await page.goto('/?demo');
  await waitForCanvas(page);
  await page.getByLabel('Flow source').selectOption('SIMULATED');
  await expect(page.getByText('SIMULATED FLOW')).toBeVisible();
  await expect(summary(page)).toHaveText('Flow: 4 forward, 0 reverse, 0 stopped, 1 unknown (1 no reading)');
});

test('readings go stale when the host stops sending them', async ({ page }) => {
  await page.clock.install();
  await page.goto('/?demo');
  await waitForCanvas(page);
  await expect(summary(page)).toHaveText('Flow: 4 forward, 0 reverse, 0 stopped, 1 unknown (1 no reading)');

  await page.getByLabel('Live readings').uncheck();
  await page.clock.fastForward(11_000);
  await expect(summary(page)).toHaveText('Flow: 0 forward, 0 reverse, 0 stopped, 5 unknown (4 stale, 1 no reading)');

  await page.getByLabel('Live readings').check();
  await page.clock.fastForward(1_500);
  await expect(summary(page)).toHaveText('Flow: 4 forward, 0 reverse, 0 stopped, 1 unknown (1 no reading)');
});

test('no flow overlay without host readings', async ({ page }) => {
  await page.goto('/');
  await waitForCanvas(page);
  await expect(summary(page)).toHaveCount(0);
});

test('markers move from→to for positive rates, back for negative, and stay put when stopped', async ({ page }) => {
  // Read marker positions from the live Three.js scene through the devtools hook.
  await page.addInitScript(() => {
    const hook = new EventTarget();
    (window as unknown as { __scenes: unknown[] }).__scenes = [];
    hook.addEventListener('observe', (e) => {
      const detail = (e as CustomEvent).detail;
      if (detail?.isScene) (window as unknown as { __scenes: unknown[] }).__scenes.push(detail);
    });
    (window as unknown as { __THREE_DEVTOOLS__: EventTarget }).__THREE_DEVTOOLS__ = hook;
  });
  await page.goto('/?demo');
  await waitForCanvas(page);

  // Markers on the tank-valve run, which goes from (1.2, 0.635, 0) to (2.4, 0.635, 0).
  const markerXs = () =>
    page.evaluate(() => {
      const xs: number[] = [];
      for (const scene of (window as unknown as { __scenes: { traverse(f: (o: any) => void): void }[] }).__scenes) {
        scene.traverse((o) => {
          if (!o.isInstancedMesh || o.userData?.role !== 'flow-markers') return;
          const m = o.instanceMatrix.array;
          for (let i = 0; i < o.count; i++) {
            const [x, y] = [m[i * 16 + 12], m[i * 16 + 13]];
            if (Math.abs(y - 0.635) < 1e-6 && x >= 1.2 && x <= 2.4) xs.push(x);
          }
        });
      }
      return xs;
    });
  const length = 1.2;
  /** Signed shift of each earlier marker to its nearest later marker, around the loop. */
  async function shifts(): Promise<number[]> {
    const before = await markerXs();
    await page.waitForTimeout(150);
    const after = await markerXs();
    return before.map((a) =>
      after
        .map((b) => ((((b - a) % length) + 1.5 * length) % length) - length / 2)
        .reduce((best, d) => (Math.abs(d) < Math.abs(best) ? d : best)),
    );
  }

  for (const [rate, check] of [
    ['2', (d: number) => expect(d).toBeGreaterThan(0.02)],
    ['-2', (d: number) => expect(d).toBeLessThan(-0.02)],
    ['0', (d: number) => expect(Math.abs(d)).toBeLessThan(1e-6)],
  ] as const) {
    await page.getByLabel('Value FT-101').fill(rate);
    await page.waitForTimeout(300);
    const result = await shifts();
    expect(result.length).toBeGreaterThan(0);
    result.forEach(check);
  }
});
