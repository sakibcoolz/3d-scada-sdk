import { expect, test } from '@playwright/test';
import { sceneJson, startDrag, waitForCanvas } from './helpers';

test('drops components at the pointer and snaps a valve onto the tank outlet', async ({ page }) => {
  await page.goto('/');
  await waitForCanvas(page);
  const status = page.getByRole('status');

  await startDrag(page, 'Vertical Tank +', [0, 0, 0]);
  await expect(status).toHaveText(/^Place Vertical Tank at/);
  await page.mouse.up();
  await expect(status).toHaveText('');

  let scene = await sceneJson(page);
  expect(scene.components).toHaveLength(1);
  const { x, y, z } = scene.components[0].position;
  expect(Math.abs(x)).toBeLessThan(0.05);
  // New tanks stand on a 0.8 m stand (ADR-0013): the body is 0.8 m higher than a bare tank.
  expect(y).toBeCloseTo(1.535 + 0.8, 9);
  expect(Math.abs(z)).toBeLessThan(0.05);
  const tankId = scene.components[0].id;

  // The tank outlet sits at (x + 1.2, 1.435, z). The valve is dropped on the ground right below it
  // and is lifted onto the outlet (snap in plan view).
  await startDrag(page, 'Ball Valve +', [x + 1.8, 0, z]);
  await expect(status).toHaveText('Connects Ball Valve "in" to Vertical Tank "outlet"');
  await page.mouse.up();

  scene = await sceneJson(page);
  expect(scene.components).toHaveLength(2);
  const valve = scene.components[1];
  expect(valve.type).toBe('valve');
  expect(valve.position.x).toBeCloseTo(x + 1.8, 9);
  expect(valve.position.y).toBeCloseTo(0.635 + 0.8, 9);
  expect(valve.position.z).toBeCloseTo(z, 9);
  expect(scene.connections).toEqual([
    { id: expect.any(String), from: { instanceId: valve.id, portId: 'in' }, to: { instanceId: tankId, portId: 'outlet' } },
  ]);
});

test('Escape cancels a drag without changing the scene', async ({ page }) => {
  await page.goto('/');
  await waitForCanvas(page);
  await startDrag(page, 'Straight Pipe +', [1, 0, 1]);
  await expect(page.getByRole('status')).toHaveText(/^Place Straight Pipe at/);
  await page.keyboard.press('Escape');
  await page.mouse.up();
  await expect(page.getByRole('status')).toHaveText('');
  expect((await sceneJson(page)).components).toEqual([]);
});
