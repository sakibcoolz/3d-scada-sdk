import { expect, test, type Page } from '@playwright/test';
import { sceneJson, startDrag, waitForCanvas } from './helpers';

const size = (page: Page) => page.getByLabel('Size', { exact: true });

async function importScene(page: Page, scene: unknown) {
  await page.getByLabel('Import JSON text').fill(JSON.stringify(scene));
  await page.getByRole('button', { name: 'Load text' }).click();
}

const part = (id: string, type: string, position: { x: number; y: number; z: number }, properties: Record<string, unknown> = {}) => ({
  id,
  type,
  position,
  rotation: { x: 0, y: 0, z: 0, w: 1 },
  scale: { x: 1, y: 1, z: 1 },
  properties,
});

test('the palette offers a reducer and a coupler', async ({ page }) => {
  await page.goto('/');
  await waitForCanvas(page);
  await page.getByRole('button', { name: 'Reducer +' }).click();
  await expect(size(page)).toHaveValue('DN150');
  await expect(page.getByLabel('Outlet size')).toHaveValue('DN100');
  await page.getByRole('button', { name: 'Coupler +' }).click();
  await expect(page.getByLabel('Length (m)')).toHaveValue('0.1');
  const [reducer, coupler] = (await sceneJson(page)).components;
  expect(reducer.properties).toEqual({});
  expect(coupler.properties).toEqual({ length: 0.1 });
});

test('a pipe size is chosen from a list, saved only when not DN150, and undoable', async ({ page }) => {
  await page.goto('/');
  await waitForCanvas(page);
  await page.getByRole('button', { name: 'Straight Pipe +' }).click();
  await expect(size(page)).toHaveValue('DN150');
  await size(page).selectOption('DN80');
  expect((await sceneJson(page)).components[0].properties).toEqual({ length: 2, size: 'DN80' });
  await size(page).selectOption('DN150');
  expect((await sceneJson(page)).components[0].properties).toEqual({ length: 2 });
  await page.getByRole('button', { name: 'Undo' }).click();
  expect((await sceneJson(page)).components[0].properties.size).toBe('DN80');
});

test('changing the size of a connected part is refused with the reason', async ({ page }) => {
  await page.goto('/');
  await waitForCanvas(page);
  await startDrag(page, 'Vertical Tank +', [0, 0, 0]);
  await page.mouse.up();
  const tank = (await sceneJson(page)).components[0];
  await startDrag(page, 'Ball Valve +', [tank.position.x + 1.8, 0, tank.position.z]);
  await page.mouse.up();
  const before = await page.getByLabel('Scene JSON').inputValue();
  await size(page).selectOption('DN100');
  await expect(page.getByRole('alert')).toHaveText('"in" is connected to Vertical Tank 1 "outlet" (DN150). Disconnect it or put a reducer between them.');
  await expect(page.getByLabel('Scene JSON')).toHaveValue(before);
  await expect(size(page)).toHaveValue('DN150');
});

test('a reducer outlet may not be the same size as its inlet', async ({ page }) => {
  await page.goto('/');
  await waitForCanvas(page);
  await page.getByRole('button', { name: 'Reducer +' }).click();
  await page.getByLabel('Outlet size').selectOption('DN150');
  await expect(page.getByRole('alert')).toHaveText('Outlet size must differ from the inlet size.');
  expect((await sceneJson(page)).components[0].properties).toEqual({});
});

test('a pipe dropped on a DN100 reducer outlet becomes DN100 and connects', async ({ page }) => {
  await page.goto('/');
  await waitForCanvas(page);
  await importScene(page, { schemaVersion: 3, units: 'm', components: [part('r', 'reducer', { x: 0, y: 0.084, z: 0 })], connections: [] });
  await startDrag(page, 'Straight Pipe +', [1.2, 0, 0]);
  await expect(page.getByRole('status').first()).toContainText('Connects Straight Pipe "in" to Reducer "out"');
  await page.mouse.up();
  const scene = await sceneJson(page);
  expect(scene.components[1].properties).toEqual({ length: 2, size: 'DN100' });
  expect(scene.connections).toEqual([expect.objectContaining({ from: { instanceId: scene.components[1].id, portId: 'in' }, to: { instanceId: 'r', portId: 'out' } })]);
  await expect(page.getByLabel('Open joints')).toHaveCount(0);
});

test('a scene with an unknown size is rejected on import', async ({ page }) => {
  await page.goto('/');
  await waitForCanvas(page);
  await importScene(page, { schemaVersion: 3, units: 'm', components: [part('p', 'pipe', { x: 0, y: 0.084, z: 0 }, { size: 'DN125' })], connections: [] });
  await expect(page.getByRole('alert')).toHaveText('components[0].properties.size: must be one of DN50, DN80, DN100, DN150, DN200');
});
