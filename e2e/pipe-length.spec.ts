import { expect, test } from '@playwright/test';
import { installThreeHook, renderedParts, sceneJson, startDrag, waitForCanvas } from './helpers';

const length = (page: import('@playwright/test').Page) => page.getByLabel('Length (m)');

test('a new pipe has an editable length that keeps its inlet end in place', async ({ page }) => {
  await installThreeHook(page);
  await page.goto('/');
  await waitForCanvas(page);
  await page.getByRole('button', { name: 'Straight Pipe +' }).click();
  await expect(length(page)).toHaveValue('2');
  let pipe = (await sceneJson(page)).components[0];
  expect(pipe.properties.length).toBe(2);
  const inletX = pipe.position.x - 1;

  await length(page).fill('5');
  pipe = (await sceneJson(page)).components[0];
  expect(pipe.properties.length).toBe(5);
  expect(pipe.position.x - 2.5).toBeCloseTo(inletX, 9);
  await expect.poll(async () => (await renderedParts(page)).filter((p) => p.componentId === pipe.id && p.role === 'shell').length).toBe(1);

  await page.getByRole('button', { name: 'Undo' }).click();
  pipe = (await sceneJson(page)).components[0];
  expect(pipe.properties.length).toBe(2);
  expect(pipe.position.x - 1).toBeCloseTo(inletX, 9);
});

test('an out-of-range length is explained and not applied', async ({ page }) => {
  await page.goto('/');
  await waitForCanvas(page);
  await page.getByRole('button', { name: 'Straight Pipe +' }).click();
  const before = await page.getByLabel('Scene JSON').inputValue();
  await length(page).fill('50');
  await expect(page.getByRole('alert')).toHaveText('Length must be between 0.2 and 20 m.');
  await expect(page.getByLabel('Scene JSON')).toHaveValue(before);
  await length(page).fill('0.05');
  await expect(page.getByLabel('Scene JSON')).toHaveValue(before);
});

test('lengthening a pipe keeps its connected end in place, so a joined valve stays joined', async ({ page }) => {
  await page.goto('/');
  await waitForCanvas(page);
  await startDrag(page, 'Straight Pipe +', [0, 0, 0]);
  await page.mouse.up();
  const first = (await sceneJson(page)).components[0];
  // Snap a valve onto the pipe outlet (at x + 1); the inlet stays free.
  await startDrag(page, 'Ball Valve +', [first.position.x + 1.6, 0, first.position.z]);
  await page.mouse.up();
  expect((await sceneJson(page)).connections).toHaveLength(1);
  const outletX = first.position.x + 1;

  await page.getByRole('button', { name: /^Straight Pipe 1/ }).click();
  await length(page).fill('4');
  const scene = await sceneJson(page);
  const pipe = scene.components.find((c: { id: string }) => c.id === first.id);
  expect(pipe.properties.length).toBe(4);
  expect(pipe.position.x + 2).toBeCloseTo(outletX, 9);
  expect(scene.connections).toHaveLength(1);
  await expect(page.getByLabel('Collisions')).toHaveCount(0);
});

test('a scene file with an out-of-range length is rejected on import', async ({ page }) => {
  await page.goto('/');
  await waitForCanvas(page);
  const scene = {
    schemaVersion: 3,
    units: 'm',
    components: [{ id: 'p', type: 'pipe', position: { x: 0, y: 0.084, z: 0 }, rotation: { x: 0, y: 0, z: 0, w: 1 }, scale: { x: 1, y: 1, z: 1 }, properties: { length: 30 } }],
    connections: [],
  };
  await page.getByLabel('Import JSON text').fill(JSON.stringify(scene));
  await page.getByRole('button', { name: 'Load text' }).click();
  await expect(page.getByRole('alert')).toHaveText('components[0].properties.length: must be between 0.2 and 20 m');
});
