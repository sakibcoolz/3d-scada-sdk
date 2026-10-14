import { expect, type Page } from '@playwright/test';

export type Vec3 = [number, number, number];

// Mirrors the viewer camera: position (7, 6, 9), 50° vertical fov, orbit target at the origin.
export function project(world: Vec3, box: { x: number; y: number; width: number; height: number }): { x: number; y: number } {
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
export async function waitForCanvas(page: Page): Promise<void> {
  await expect
    .poll(async () => {
      const [canvas, main] = await Promise.all([page.locator('canvas').boundingBox(), page.locator('main').boundingBox()]);
      return canvas && main ? Math.abs(canvas.width - main.width) + Math.abs(canvas.height - main.height) : Infinity;
    })
    .toBeLessThan(1);
  await page.waitForTimeout(200);
}

export async function startDrag(page: Page, label: string, world: Vec3): Promise<void> {
  const box = (await page.locator('canvas').boundingBox())!;
  const target = project(world, box);
  await page.getByRole('button', { name: label }).hover();
  await page.mouse.down();
  await page.mouse.move(target.x, target.y, { steps: 8 });
}

export async function sceneJson(page: Page) {
  return JSON.parse(await page.getByLabel('Scene JSON').inputValue());
}
