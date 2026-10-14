import { expect, test } from '@playwright/test';
import { project, sceneJson, waitForCanvas, type Vec3 } from './helpers';

async function dragWorld(page: import('@playwright/test').Page, from: Vec3, to: Vec3): Promise<void> {
  const box = (await page.locator('canvas').boundingBox())!;
  const a = project(from, box);
  const b = project(to, box);
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  await page.mouse.move(b.x, b.y, { steps: 12 });
  await page.mouse.up();
}

test('move gizmo drags a component along X and undoes as one step', async ({ page }) => {
  await page.goto('/');
  await waitForCanvas(page);
  await page.getByRole('button', { name: 'Ball Valve +' }).click();
  const start = (await sceneJson(page)).components[0].position;
  await page.waitForTimeout(300);
  // The X arrow points along +X from the selected component's origin.
  await dragWorld(page, [start.x + 1.5, start.y, start.z], [start.x + 3.5, start.y, start.z]);
  const moved = (await sceneJson(page)).components[0].position;
  expect(moved.x).toBeGreaterThan(start.x + 1);
  expect(moved.y).toBeCloseTo(start.y, 9);
  expect(moved.z).toBeCloseTo(start.z, 9);

  await page.getByRole('button', { name: 'Undo' }).click();
  expect((await sceneJson(page)).components[0].position).toEqual(start);
  await page.getByRole('button', { name: 'Undo' }).click();
  expect((await sceneJson(page)).components).toEqual([]);
});

test('rotate gizmo turns a component in quarter turns about Y', async ({ page }) => {
  await page.goto('/');
  await waitForCanvas(page);
  await page.getByRole('button', { name: 'Ball Valve +' }).click();
  await page.getByRole('button', { name: 'Rotate' }).click();
  await expect(page.getByRole('button', { name: 'Rotate' })).toHaveAttribute('aria-pressed', 'true');
  const { x, y, z } = (await sceneJson(page)).components[0].position;
  await page.waitForTimeout(300);
  // A point at 45° on the Y ring (horizontal), which the X and Z rings do not pass through.
  await dragWorld(page, [x + 1, y, z + 1], [x + 1.4, y, z - 0.6]);
  const { x: qx, y: qy, z: qz, w: qw } = (await sceneJson(page)).components[0].rotation;
  expect(qx).toBeCloseTo(0, 9);
  expect(qz).toBeCloseTo(0, 9);
  // A whole number of quarter turns about Y, and not the identity.
  const angle = 2 * Math.atan2(qy, qw);
  expect(Math.abs(angle)).toBeGreaterThan(0.1);
  expect(Math.abs(angle / (Math.PI / 2) - Math.round(angle / (Math.PI / 2)))).toBeLessThan(1e-6);
  expect((await sceneJson(page)).components[0].position).toEqual({ x, y, z });
});
