import { expect, test, type Page } from '@playwright/test';
import { installThreeHook, waitForCanvas } from './helpers';

// Joint hardware (ADR-0015): flange pairs with bolts at valve joints, weld beads between pipe parts.
const I = { x: 0, y: 0, z: 0, w: 1 }, one = { x: 1, y: 1, z: 1 };
const part = (id: string, type: string, x: number, props: Record<string, unknown> = {}) => ({ id, type, position: { x, y: 0.2, z: 0 }, rotation: I, scale: one, properties: props });
// pipe → valve → pipe → pipe: two flanged joints at the valve, one weld between the pipes.
const line = {
  schemaVersion: 3, units: 'm',
  components: [part('p1', 'pipe', -1.6, { length: 2 }), part('v', 'valve', 0, { open: true }), part('p2', 'pipe', 1.6, { length: 2 }), part('p3', 'pipe', 3.6, { length: 2 })],
  connections: [
    { id: 'a', from: { instanceId: 'p1', portId: 'out' }, to: { instanceId: 'v', portId: 'in' } },
    { id: 'b', from: { instanceId: 'v', portId: 'out' }, to: { instanceId: 'p2', portId: 'in' } },
    { id: 'c', from: { instanceId: 'p2', portId: 'out' }, to: { instanceId: 'p3', portId: 'in' } },
  ],
};

const hardware = (page: Page) =>
  page.evaluate(() => {
    const out: Record<string, number> = {};
    for (const s of (window as unknown as { __scenes: { traverse(f: (o: any) => void): void }[] }).__scenes)
      s.traverse((o) => { if (o.isInstancedMesh && o.userData?.joint) out[o.userData.role] = (out[o.userData.role] ?? 0) + o.count; });
    return out;
  });

async function load(page: Page, query = '') {
  await installThreeHook(page);
  await page.goto(`/${query}`);
  await waitForCanvas(page);
  await page.getByLabel('Import JSON text').fill(JSON.stringify(line));
  await page.getByRole('button', { name: 'Load text' }).click();
}

test('valve joints are bolted flange pairs and pipe-to-pipe joints are welded', async ({ page }) => {
  await load(page);
  // 2 flange pairs × (raised face, ring, hub) × 2 sides = 12 flange parts; 8 bolts each (DN150); 1 weld.
  await expect.poll(() => hardware(page)).toEqual({ flange: 12, bolt: 16, weld: 1 });
});

test('hosts can turn the joint hardware off', async ({ page }) => {
  await load(page, '?joints=off');
  await page.waitForTimeout(300);
  expect(await hardware(page)).toEqual({});
});
