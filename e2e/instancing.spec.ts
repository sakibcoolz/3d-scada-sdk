import { expect, test, type Page } from '@playwright/test';
import { installThreeHook, rendererMemory, renderedParts, waitForCanvas } from './helpers';

// Equipment instancing (T-046): plain parts of large scenes are drawn as instanced meshes.
const I = { x: 0, y: 0, z: 0, w: 1 };
const one = { x: 1, y: 1, z: 1 };
const part = (id: string, type: string, x: number, y: number, z: number, properties: Record<string, unknown> = {}) => ({ id, type, position: { x, y, z }, rotation: I, scale: one, properties });

/** A still scene (no flow), so two renders can be compared pixel by pixel. */
const still = {
  schemaVersion: 3,
  units: 'm',
  components: [
    part('tank', 'tank', -3, 1.535, 0, { level: 70 }),
    part('v-open', 'valve', 0, 0.2, 1.5, { open: true }),
    part('v-shut', 'valve', 0, 0.2, -1.5, { open: false }),
    part('tee', 'tee', 3, 0.084, 0),
    part('pipe', 'pipe', 3, 0.084, 2.5, { length: 3, size: 'DN100' }),
  ],
  connections: [],
};

async function open(page: Page, query: string, scene: unknown = still) {
  await installThreeHook(page);
  await page.goto(`/${query}`);
  await waitForCanvas(page);
  await page.getByLabel('Import JSON text').fill(JSON.stringify(scene));
  await page.getByRole('button', { name: 'Load text' }).click();
  await page.mouse.move(1, 1);
  await page.waitForTimeout(400);
}

const instancedRoles = (page: Page) =>
  page.evaluate(() => {
    const roles: Record<string, number> = {};
    for (const s of (window as unknown as { __scenes: { traverse(f: (o: any) => void): void }[] }).__scenes)
      s.traverse((o) => { if (o.isInstancedMesh && Array.isArray(o.userData.componentIds)) roles[o.userData.role] = (roles[o.userData.role] ?? 0) + o.count; });
    return roles;
  });

/** Fraction of canvas pixels that differ by more than a small tolerance. */
async function pixelDifference(page: Page, a: Buffer, b: Buffer): Promise<number> {
  return page.evaluate(async ([x, y]) => {
    const load = (src: string) => new Promise<HTMLImageElement>((res) => { const img = new Image(); img.onload = () => res(img); img.src = src; });
    const [ia, ib] = await Promise.all([load(x), load(y)]);
    const data = (img: HTMLImageElement) => { const c = document.createElement('canvas'); c.width = img.width; c.height = img.height; const g = c.getContext('2d')!; g.drawImage(img, 0, 0); return g.getImageData(0, 0, c.width, c.height).data; };
    const [da, db] = [data(ia), data(ib)];
    let differ = 0;
    for (let i = 0; i < da.length; i += 4) if (Math.abs(da[i] - db[i]) + Math.abs(da[i + 1] - db[i + 1]) + Math.abs(da[i + 2] - db[i + 2]) > 24) differ++;
    return differ / (da.length / 4);
  }, [`data:image/png;base64,${a.toString('base64')}`, `data:image/png;base64,${b.toString('base64')}`] as const);
}

test('instanced equipment looks the same as individual meshes', async ({ page }) => {
  await open(page, '?instancing=off');
  expect(await instancedRoles(page)).toEqual({});
  const classic = await page.locator('canvas').screenshot();
  await open(page, '?instancing=always');
  expect(await instancedRoles(page)).toMatchObject({ shell: expect.any(Number), 'valve-ball': 2, 'valve-handle': 2, liquid: 1 });
  const instanced = await page.locator('canvas').screenshot();
  expect(await pixelDifference(page, classic, instanced)).toBeLessThan(0.002);
});

test('instanced parts keep their live colours and liquid level', async ({ page }) => {
  await open(page, '?instancing=always');
  expect(await instancedRoles(page)).toMatchObject({ 'valve-ball': 2, liquid: 1 });
  const parts = await renderedParts(page);
  const ball = (id: string) => parts.find((p) => p.componentId === id && p.role === 'valve-ball')!;
  expect(ball('v-open').color).toBe('#48b983');
  expect(ball('v-shut').color).toBe('#e76e75');
  const liquid = parts.find((p) => p.componentId === 'tank' && p.role === 'liquid')!;
  expect(liquid.scaleY).toBeCloseTo(0.7, 5);
});

test('clicking an instanced part selects it and gives it the gizmo', async ({ page }) => {
  await open(page, '?instancing=always');
  expect(await instancedRoles(page)).toMatchObject({ liquid: 1 });
  const box = (await page.locator('canvas').boundingBox())!;
  // Click the tank, which fills the left of the default view.
  await page.mouse.click(box.x + box.width * 0.36, box.y + box.height * 0.45);
  await expect(page.getByRole('heading', { name: 'Vertical Tank', level: 4 })).toBeVisible();
  // The selected tank leaves the instanced set and is drawn on its own, like before.
  await expect.poll(async () => (await instancedRoles(page)).liquid ?? 0).toBe(0);
  const own = (await renderedParts(page)).filter((p) => p.componentId === 'tank' && p.role === 'shell');
  expect(own.length).toBeGreaterThan(0);
  await expect(page.getByLabel('X', { exact: true })).toHaveValue('-3');
});

test('large scenes instance automatically; small ones and instancing=off do not', async ({ page }) => {
  await installThreeHook(page);
  await page.goto('/?generate=200');
  await waitForCanvas(page);
  expect(await instancedRoles(page)).toMatchObject({ shell: 400, 'valve-ball': 200, 'valve-handle': 200 });
  await page.goto('/?demo');
  await waitForCanvas(page);
  expect(await instancedRoles(page)).toEqual({});
  await page.goto('/?generate=200&instancing=off');
  await waitForCanvas(page);
  expect(await instancedRoles(page)).toEqual({});
});

test('instanced scenes do not leak GPU geometry across remounts or selection changes', async ({ page }) => {
  await installThreeHook(page);
  await page.goto('/?generate=200');
  await waitForCanvas(page);
  await page.waitForTimeout(500);
  const [first] = await rendererMemory(page);
  // Selecting moves a valve out of the instanced set and back: counts must come back down.
  for (const n of [1, 2, 3]) await page.getByRole('button', { name: `Ball Valve ${n}`, exact: true }).click();
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Ball Valve 4', exact: true }).click();
  const mount = page.getByLabel('Mount editor');
  for (let i = 0; i < 3; i++) {
    await mount.uncheck();
    await mount.check();
    await waitForCanvas(page);
    await page.waitForTimeout(400);
  }
  expect(await rendererMemory(page)).toEqual([first]);
});
