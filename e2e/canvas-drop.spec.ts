import { expect, test, type Page } from '@playwright/test';

type Vec3 = [number, number, number];

// Mirrors the viewer camera: position (7, 6, 9), 50° vertical fov, orbit target at the origin.
function project(world: Vec3, box: { x: number; y: number; width: number; height: number }): { x: number; y: number } {
  const eye: Vec3 = [7, 6, 9];
  const norm = (v: Vec3): Vec3 => {
    const l = Math.hypot(...v);
    return [v[0] / l, v[1] / l, v[2] / l];
  };
  const cross = (a: Vec3, b: Vec3): Vec3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const forward = norm([-eye[0], -eye[1], -eye[2]]);
  const right = norm(cross(forward, [0, 1, 0]));
  const up = cross(right, forward);
  const p: Vec3 = [world[0] - eye[0], world[1] - eye[1], world[2] - eye[2]];
  const depth = dot(p, forward);
  const t = Math.tan((50 * Math.PI) / 360);
  const ndcX = dot(p, right) / (depth * t * (box.width / box.height));
  const ndcY = dot(p, up) / (depth * t);
  return { x: box.x + ((ndcX + 1) / 2) * box.width, y: box.y + ((1 - ndcY) / 2) * box.height };
}

/** R3F sizes the canvas and aims the camera after mount; wait until it fills the editor viewport. */
async function waitForCanvas(page: Page): Promise<void> {
  await expect
    .poll(async () => {
      const [canvas, main] = await Promise.all([page.locator('canvas').boundingBox(), page.locator('main').boundingBox()]);
      return canvas && main ? Math.abs(canvas.width - main.width) + Math.abs(canvas.height - main.height) : Infinity;
    })
    .toBeLessThan(1);
  await page.waitForTimeout(200);
}

async function startDrag(page: Page, label: string, world: Vec3): Promise<void> {
  const box = (await page.locator('canvas').boundingBox())!;
  const target = project(world, box);
  await page.getByRole('button', { name: label }).hover();
  await page.mouse.down();
  await page.mouse.move(target.x, target.y, { steps: 8 });
}

async function sceneJson(page: Page) {
  return JSON.parse(await page.getByLabel('Scene JSON').inputValue());
}

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
  const [x, y, z] = scene.components[0].position;
  expect(Math.abs(x)).toBeLessThan(0.05);
  expect(y).toBeCloseTo(1.535, 9);
  expect(Math.abs(z)).toBeLessThan(0.05);
  const tankId = scene.components[0].id;

  // The tank outlet sits at (x + 1.2, 0.635, z); drop the valve so its inlet lands just below it.
  await startDrag(page, 'Ball Valve +', [x + 1.8, 0, z]);
  await expect(status).toHaveText('Connects Ball Valve "in" to Vertical Tank "outlet"');
  await page.mouse.up();

  scene = await sceneJson(page);
  expect(scene.components).toHaveLength(2);
  const valve = scene.components[1];
  expect(valve.type).toBe('valve');
  [x + 1.8, 0.635, z].forEach((n, i) => expect(valve.position[i]).toBeCloseTo(n, 9));
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
