import { expect, test, type Page } from '@playwright/test';
import { sceneJson, startDrag, waitForCanvas } from './helpers';

type C = { id: string; type: string; parentId?: string; position: { x: number; y: number; z: number } };

/** Tank on the ground, a valve snapped to its outlet and a second valve snapped to the first one's outlet. */
async function buildChain(page: Page): Promise<{ tank: C; valve: C; pipe: C }> {
  await page.goto('/');
  await waitForCanvas(page);
  await startDrag(page, 'Vertical Tank +', [0, 0, 0]);
  await page.mouse.up();
  const t = (await sceneJson(page)).components[0] as C;
  await startDrag(page, 'Ball Valve +', [t.position.x + 1.8, 0, t.position.z]);
  await page.mouse.up();
  const v = (await sceneJson(page)).components[1] as C;
  // A ground-dropped pipe's ports sit too low to reach the valve outlet, so chain a second valve.
  await startDrag(page, 'Ball Valve +', [v.position.x + 1.2, 0, v.position.z]);
  await page.mouse.up();
  const scene = await sceneJson(page);
  expect(scene.connections).toHaveLength(2);
  const [tank, valve, pipe] = scene.components as C[];
  return { tank, valve, pipe };
}

const byId = async (page: Page, id: string) => ((await sceneJson(page)).components as C[]).find((c) => c.id === id)!;
const lockAsParent = (page: Page) => page.getByRole('button', { name: 'Lock connected as children' });

test('locking connected parts to a parent saves parentId and lists children under it', async ({ page }) => {
  const { tank, valve, pipe } = await buildChain(page);
  await page.getByRole('button', { name: /^Vertical Tank 1/ }).click();
  await lockAsParent(page).click();
  const scene = await sceneJson(page);
  expect((scene.components as C[]).map((c) => [c.id, c.parentId])).toEqual([
    [tank.id, undefined],
    [valve.id, tank.id],
    [pipe.id, tank.id],
  ]);
  await expect(page.getByText('Parent of 2 components', { exact: true })).toBeVisible();
  await expect(page.getByLabel('Scene JSON')).toHaveValue(new RegExp(`"parentId": "${tank.id}"`));
});

test('moving the parent moves the whole assembly and keeps it joined', async ({ page }) => {
  const { tank, valve, pipe } = await buildChain(page);
  await page.getByRole('button', { name: /^Vertical Tank 1/ }).click();
  await lockAsParent(page).click();

  await page.getByLabel('X', { exact: true }).fill(String(tank.position.x + 2));
  for (const c of [valve, pipe]) expect((await byId(page, c.id)).position.x).toBeCloseTo(c.position.x + 2, 9);
  await expect(page.getByLabel('Collisions')).toHaveCount(0);

  // A quarter turn of the parent swings the children around it.
  await page.getByRole('button', { name: 'Turn +90° about Y' }).click();
  const t = await byId(page, tank.id);
  const v = await byId(page, valve.id);
  expect(v.position.x).toBeCloseTo(t.position.x, 6);
  expect(v.position.z).toBeCloseTo(t.position.z - (valve.position.x - tank.position.x), 6);
  expect((await sceneJson(page)).connections).toHaveLength(2);
  await expect(page.getByLabel('Collisions')).toHaveCount(0);
});

test('moving a locked child moves the whole assembly; unlocking frees it', async ({ page }) => {
  const { tank, valve } = await buildChain(page);
  await page.getByRole('button', { name: /^Vertical Tank 1/ }).click();
  await lockAsParent(page).click();

  const entry = page.getByRole('button', { name: /^Ball Valve 1/ });
  await entry.click();
  await expect(page.getByText('Locked to Vertical Tank 1')).toBeVisible();
  await entry.focus();
  await page.keyboard.press('ArrowRight');
  // Keyboard nudges round to the micrometre, so compare at that precision.
  expect((await byId(page, tank.id)).position.x).toBeCloseTo(tank.position.x + 0.1, 5);

  await page.getByRole('button', { name: 'Unlock from parent' }).click();
  expect((await byId(page, valve.id)).parentId).toBeUndefined();
  await page.getByRole('button', { name: /^Vertical Tank 1/ }).click();
  const before = (await byId(page, valve.id)).position.x;
  await page.getByLabel('X', { exact: true }).fill(String(tank.position.x + 5));
  expect((await byId(page, valve.id)).position.x).toBe(before);
});

test('assemblies survive export and import', async ({ page }) => {
  const { tank } = await buildChain(page);
  await page.getByRole('button', { name: /^Vertical Tank 1/ }).click();
  await lockAsParent(page).click();
  const saved = await page.getByLabel('Scene JSON').inputValue();
  await page.reload();
  await waitForCanvas(page);
  await page.getByLabel('Import JSON text').fill(saved);
  await page.getByRole('button', { name: 'Load text' }).click();
  await expect(page.getByLabel('Scene JSON')).toHaveValue(saved);
  expect(((await sceneJson(page)).components as C[]).filter((c) => c.parentId === tank.id)).toHaveLength(2);
});
