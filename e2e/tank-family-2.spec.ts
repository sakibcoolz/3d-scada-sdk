import { expect, test } from '@playwright/test';
import { installThreeHook, renderedParts, sceneJson, waitForCanvas } from './helpers';

// Tank family 2 (T-054 to T-056, ADR-0018): horizontal and spherical tanks, and a pool.
test('the horizontal tank, spherical tank and pool can be added, show their capacity and hold liquid', async ({ page }) => {
  await installThreeHook(page);
  await page.goto('/');
  await waitForCanvas(page);
  for (const name of ['Horizontal Tank +', 'Spherical Tank +', 'Pool +']) await page.getByRole('button', { name, exact: true }).click();
  const scene = await sceneJson(page);
  expect(scene.components.map((c: { type: string }) => c.type)).toEqual(['horizontalTank', 'sphericalTank', 'pool']);
  expect(scene.components.map((c: { properties: { level?: number } }) => c.properties.level)).toEqual([45, 45, 45]);
  await expect(page.getByLabel('Collisions')).toHaveCount(0);
  await expect.poll(async () => (await renderedParts(page)).filter((p) => p.role === 'plate').map((p) => p.plateText)).toEqual(['11.5 m³', '7.24 m³', '16.2 m³']);
  // Each body has a visible liquid (gauge columns are the thin ones on the tanks).
  await expect.poll(async () => (await renderedParts(page)).filter((p) => p.role === 'liquid' && p.visible).length).toBe(5);
});

test('changing the horizontal tank length keeps it standing on the floor', async ({ page }) => {
  await page.goto('/');
  await waitForCanvas(page);
  await page.getByRole('button', { name: 'Horizontal Tank +', exact: true }).click();
  const before = (await sceneJson(page)).components[0];
  expect(before.properties).toEqual({ level: 45, diameter: 2, length: 3, standHeight: 0.6 });
  expect(before.position.y).toBeCloseTo(1.6, 9);
  await page.getByLabel('Shell length (m)').fill('6');
  await page.getByLabel('Diameter (m)').fill('3');
  const after = (await sceneJson(page)).components[0];
  expect(after.properties).toMatchObject({ length: 6, diameter: 3 });
  expect(after.position.y).toBeCloseTo(2.1, 9);
});
