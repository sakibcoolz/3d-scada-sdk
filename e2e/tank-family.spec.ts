import { expect, test } from '@playwright/test';
import { installThreeHook, renderedParts, sceneJson, waitForCanvas } from './helpers';

// Tank family 1 (T-053, ADR-0017): dimensions, dished head, capacity plate and palette presets.
test('the Large preset adds a 3 × 4.5 m dished tank whose plate shows its capacity', async ({ page }) => {
  await installThreeHook(page);
  await page.goto('/');
  await waitForCanvas(page);
  await page.getByRole('button', { name: 'Vertical Tank (Large) +' }).click();
  const [tank] = (await sceneJson(page)).components;
  expect(tank.type).toBe('tank');
  expect(tank.properties).toEqual({ level: 45, diameter: 3, height: 4.5, standHeight: 0.8, head: 'dished' });
  await expect(page.getByLabel('Diameter (m)')).toHaveValue('3');
  await expect(page.getByLabel('Shell height (m)')).toHaveValue('4.5');
  await expect(page.getByLabel('Top head')).toHaveValue('dished');
  // 3 m × 4.5 m cylinder plus a 2:1 head: 31.8 + 3.53 m³.
  await expect.poll(async () => (await renderedParts(page)).find((p) => p.role === 'plate')?.plateText).toBe('35.3 m³');
});

test('changing the diameter and the capacity unit redraws the plate and keeps the tank on the floor', async ({ page }) => {
  await installThreeHook(page);
  await page.goto('/');
  await waitForCanvas(page);
  await page.getByRole('button', { name: 'Vertical Tank +' }).click();
  const before = (await sceneJson(page)).components[0];
  await expect.poll(async () => (await renderedParts(page)).find((p) => p.role === 'plate')?.plateText).toBe('9.42 m³');
  await page.getByLabel('Diameter (m)').fill('4');
  await page.getByLabel('Capacity unit').selectOption('US gal');
  const after = (await sceneJson(page)).components[0];
  expect(after.properties).toMatchObject({ diameter: 4, capacityUnit: 'US gal' });
  expect(after.position.y).toBeCloseTo(before.position.y, 9);
  await expect.poll(async () => (await renderedParts(page)).find((p) => p.role === 'plate')?.plateText).toBe('9,960 US gal');
});

test('adding every tank preset in a row places them side by side without overlaps', async ({ page }) => {
  await page.goto('/');
  await waitForCanvas(page);
  for (const name of ['Vertical Tank +', 'Vertical Tank (Dished) +', 'Vertical Tank (Large) +', 'Vertical Tank (Short) +', 'Cylindrical Tank (Large) +', 'Cylindrical Tank (Small) +']) await page.getByRole('button', { name, exact: true }).click();
  expect((await sceneJson(page)).components).toHaveLength(6);
  await expect(page.getByLabel('Collisions')).toHaveCount(0);
});
