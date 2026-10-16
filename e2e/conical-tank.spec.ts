import { expect, test, type Page } from '@playwright/test';
import { installThreeHook, renderedParts, sceneJson, startDrag, waitForCanvas } from './helpers';

// Conical-bottom tank (T-048): legs, cone, side outlet, sight gauge, liquid that follows the cone.
const lathe = (page: Page) =>
  page.evaluate(() => {
    let found: { visible: boolean; fraction: number; top: number } | null = null;
    for (const s of (window as unknown as { __scenes: { traverse(f: (o: any) => void): void }[] }).__scenes)
      s.traverse((o) => {
        if (o.userData?.role !== 'liquid' || o.userData.levelFraction === undefined) return;
        const box = o.geometry ? (o.geometry.computeBoundingBox(), o.geometry.boundingBox) : null;
        found = { visible: o.visible, fraction: o.userData.levelFraction, top: box ? box.max.y : Number.NaN };
      });
    return found as { visible: boolean; fraction: number; top: number } | null;
  });

test('the palette adds a conical tank standing on its legs, with liquid and gauge following the level', async ({ page }) => {
  await installThreeHook(page);
  await page.goto('/');
  await waitForCanvas(page);
  await page.getByRole('button', { name: 'Conical Tank +' }).click();
  const tank = (await sceneJson(page)).components[0];
  expect(tank).toMatchObject({ type: 'conicalTank', properties: { level: 45 } });
  expect(tank.position.y).toBeCloseTo(2.5, 9); // legs on the ground
  await expect.poll(async () => (await lathe(page))?.fraction).toBe(0.45);

  await page.getByLabel('Liquid level %').fill('90');
  await expect.poll(async () => (await lathe(page))?.fraction).toBe(0.9);
  const high = (await lathe(page))!.top;
  await page.getByLabel('Liquid level %').fill('10');
  await expect.poll(async () => (await lathe(page))?.fraction).toBe(0.1);
  expect((await lathe(page))!.top).toBeLessThan(high - 2);
  // The sight gauge's liquid column scales with the same level.
  const gauge = (await renderedParts(page)).find((p) => p.componentId === tank.id && p.role === 'liquid');
  expect(gauge?.scaleY).toBeCloseTo(0.1, 6);
  expect((await renderedParts(page)).filter((p) => p.componentId === tank.id && p.role === 'gauge')).toHaveLength(1);
  await page.getByLabel('Liquid level %').fill('0');
  await expect.poll(async () => (await lathe(page))?.visible).toBe(false);
});

test('a valve dropped next to the side outlet snaps onto it', async ({ page }) => {
  await page.goto('/');
  await waitForCanvas(page);
  await startDrag(page, 'Conical Tank +', [0, 0, 0]);
  await page.mouse.up();
  const tank = (await sceneJson(page)).components[0];
  await startDrag(page, 'Ball Valve +', [tank.position.x + 1.7, 0, tank.position.z]);
  await expect(page.getByRole('status').first()).toContainText('Connects Ball Valve "in" to Conical Tank "outlet"');
  await page.mouse.up();
  expect((await sceneJson(page)).connections).toEqual([expect.objectContaining({ to: { instanceId: tank.id, portId: 'outlet' } })]);
});

test('the simulation drains a conical tank completely through its outlet', async ({ page }) => {
  await installThreeHook(page);
  await page.goto('/?simulate');
  await waitForCanvas(page);
  const I = { x: 0, y: 0, z: 0, w: 1 }, one = { x: 1, y: 1, z: 1 };
  const scene = {
    schemaVersion: 3, units: 'm',
    components: [
      { id: 'ct', type: 'conicalTank', position: { x: 0, y: 2.5, z: 0 }, rotation: I, scale: one, properties: { level: 40 } },
      { id: 'v', type: 'valve', position: { x: 1.7, y: 0.4, z: 0 }, rotation: I, scale: one, properties: { open: true } },
      { id: 'p', type: 'pipe', position: { x: 3.3, y: 0.4, z: 0 }, rotation: I, scale: one, properties: { length: 2 } },
    ],
    connections: [{ id: 'a', from: { instanceId: 'ct', portId: 'outlet' }, to: { instanceId: 'v', portId: 'in' } }, { id: 'b', from: { instanceId: 'v', portId: 'out' }, to: { instanceId: 'p', portId: 'in' } }],
  };
  await page.getByLabel('Import JSON text').fill(JSON.stringify(scene));
  await page.getByRole('button', { name: 'Load text' }).click();
  await page.getByLabel('Simulation speed').selectOption('60');
  await expect(page.getByLabel('Flow summary')).toContainText('2 forward');
  await expect.poll(async () => (await lathe(page))?.visible, { timeout: 20_000 }).toBe(false);
});
