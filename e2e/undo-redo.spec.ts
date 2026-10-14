import { expect, test } from '@playwright/test';
import { sceneJson, startDrag, waitForCanvas } from './helpers';

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await waitForCanvas(page);
});

test('undo and redo add steps with buttons and keyboard', async ({ page }) => {
  const undo = page.getByRole('button', { name: 'Undo' });
  const redo = page.getByRole('button', { name: 'Redo' });
  await expect(undo).toBeDisabled();

  await page.getByRole('button', { name: 'Vertical Tank +' }).click();
  await page.getByRole('button', { name: 'Ball Valve +' }).click();
  expect((await sceneJson(page)).components).toHaveLength(2);

  await undo.click();
  expect((await sceneJson(page)).components.map((c: { type: string }) => c.type)).toEqual(['tank']);
  await redo.click();
  expect((await sceneJson(page)).components).toHaveLength(2);
  await expect(redo).toBeDisabled();

  await page.locator('canvas').click({ position: { x: 5, y: 5 } });
  await page.keyboard.press('Control+z');
  await page.keyboard.press('Control+z');
  expect((await sceneJson(page)).components).toEqual([]);
  await page.keyboard.press('Control+Shift+z');
  expect((await sceneJson(page)).components).toHaveLength(1);
  await page.keyboard.press('Control+y');
  expect((await sceneJson(page)).components).toHaveLength(2);
});

test('a snapped drop undoes and redoes as one step with its connection', async ({ page }) => {
  await startDrag(page, 'Vertical Tank +', [0, 0, 0]);
  await page.mouse.up();
  const [x, , z] = (await sceneJson(page)).components[0].position;
  await startDrag(page, 'Ball Valve +', [x + 1.8, 0, z]);
  await page.mouse.up();
  let scene = await sceneJson(page);
  expect(scene.components).toHaveLength(2);
  expect(scene.connections).toHaveLength(1);

  await page.getByRole('button', { name: 'Undo' }).click();
  scene = await sceneJson(page);
  expect(scene.components).toHaveLength(1);
  expect(scene.connections).toEqual([]);

  await page.getByRole('button', { name: 'Redo' }).click();
  scene = await sceneJson(page);
  expect(scene.components).toHaveLength(2);
  expect(scene.connections).toHaveLength(1);
});

test('removing a connected component undoes back to the exact earlier scene', async ({ page }) => {
  await startDrag(page, 'Vertical Tank +', [0, 0, 0]);
  await page.mouse.up();
  const [x, , z] = (await sceneJson(page)).components[0].position;
  await startDrag(page, 'Ball Valve +', [x + 1.8, 0, z]);
  await page.mouse.up();
  const before = await page.getByLabel('Scene JSON').inputValue();

  await page.getByRole('button', { name: 'Remove' }).click();
  expect((await sceneJson(page)).connections).toEqual([]);
  await page.getByRole('button', { name: 'Undo' }).click();
  await expect(page.getByLabel('Scene JSON')).toHaveValue(before);
});

test('typing in a property field does not trigger editor undo', async ({ page }) => {
  await page.getByRole('button', { name: 'Vertical Tank +' }).click();
  const x = page.getByLabel('X', { exact: true });
  await x.fill('3');
  await x.press('Control+z');
  expect((await sceneJson(page)).components).toHaveLength(1);
});
