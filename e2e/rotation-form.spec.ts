import { expect, test } from '@playwright/test';
import { sceneJson, waitForCanvas } from './helpers';

const field = (page: import('@playwright/test').Page, axis: string) => page.getByLabel(`Rotation ${axis} (degrees)`);

test('every component type has rotation fields', async ({ page }) => {
  await page.goto('/');
  await waitForCanvas(page);
  for (const label of ['Vertical Tank +', 'Straight Pipe +', '90° Elbow +', 'T-Junction +', 'Ball Valve +', 'Centrifugal Pump +', 'Sensor +', 'Motor +']) {
    await page.getByRole('button', { name: label, exact: true }).click();
    for (const axis of ['X', 'Y', 'Z']) await expect(field(page, axis)).toHaveValue('0');
  }
});

test('typing an angle rotates the component and is one undo step', async ({ page }) => {
  await page.goto('/');
  await waitForCanvas(page);
  await page.getByRole('button', { name: 'Ball Valve +' }).click();

  await field(page, 'Y').fill('90');
  let rotation = (await sceneJson(page)).components[0].rotation;
  expect(rotation.y).toBeCloseTo(Math.SQRT1_2, 9);
  expect(rotation.w).toBeCloseTo(Math.SQRT1_2, 9);
  await expect(field(page, 'Y')).toHaveValue('90');

  await page.getByRole('button', { name: 'Undo' }).click();
  rotation = (await sceneJson(page)).components[0].rotation;
  expect(rotation).toEqual({ x: 0, y: 0, z: 0, w: 1 });
  await expect(field(page, 'Y')).toHaveValue('0');
});

test('quick-turn buttons and reset', async ({ page }) => {
  await page.goto('/');
  await waitForCanvas(page);
  await page.getByRole('button', { name: 'Ball Valve +' }).click();

  await page.getByRole('button', { name: 'Turn +90° about Z' }).click();
  await expect(field(page, 'Z')).toHaveValue('90');
  await page.getByRole('button', { name: 'Turn +90° about Z' }).click();
  await expect(field(page, 'Z')).toHaveValue('180');
  await page.getByRole('button', { name: 'Turn −90° about Z' }).click();
  await expect(field(page, 'Z')).toHaveValue('90');

  await page.getByRole('button', { name: 'Reset rotation' }).click();
  expect((await sceneJson(page)).components[0].rotation).toEqual({ x: 0, y: 0, z: 0, w: 1 });
  for (const axis of ['X', 'Y', 'Z']) await expect(field(page, axis)).toHaveValue('0');
});
