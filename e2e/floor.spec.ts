import { expect, test, type Page } from '@playwright/test';
import { installThreeHook, sceneJson, waitForCanvas } from './helpers';

/** Floor slabs drawn by the editor's viewer: plan size and the y of their top face. */
async function floors(page: Page) {
  return page.evaluate(() => {
    type Node = { userData: Record<string, unknown>; position: { x: number; y: number; z: number }; geometry?: { parameters?: { width: number; height: number; depth: number } }; traverse: (f: (o: Node) => void) => void };
    const found: { width: number; depth: number; top: number }[] = [];
    for (const scene of (window as unknown as { __scenes: Node[] }).__scenes) {
      scene.traverse((o) => {
        const g = o.geometry?.parameters;
        if (o.userData?.role === 'floor' && g) found.push({ width: g.width, depth: g.depth, top: o.position.y + g.height / 2 });
      });
    }
    return found;
  });
}

test('the playground stands the plant on a floor that grows with it and is never saved', async ({ page }) => {
  await installThreeHook(page);
  await page.goto('/');
  await waitForCanvas(page);
  await expect.poll(async () => (await floors(page)).map((f) => [f.width, f.depth])).toEqual([[20, 20]]);
  const [slab] = await floors(page);
  expect(slab.top).toBeLessThan(0);

  // A long row of tanks widens the slab past the minimum.
  for (let i = 0; i < 8; i++) await page.getByRole('button', { name: 'Vertical Tank +' }).click();
  await expect.poll(async () => (await floors(page))[0]?.width ?? 0).toBeGreaterThan(20);
  expect(JSON.stringify(await sceneJson(page))).not.toContain('floor');

  await page.getByLabel('Floor', { exact: true }).uncheck();
  await expect.poll(async () => (await floors(page)).length).toBe(0);
});

test('?floor=off starts without the floor', async ({ page }) => {
  await installThreeHook(page);
  await page.goto('/?floor=off');
  await waitForCanvas(page);
  await expect(page.getByLabel('Floor', { exact: true })).not.toBeChecked();
  expect(await floors(page)).toEqual([]);
});
