import { expect, test, type Page } from '@playwright/test';
import { installThreeHook, project, renderedParts, sceneJson, startDrag, waitForCanvas } from './helpers';

const RED = '#e5484d';
const shellColours = async (page: Page, id: string) =>
  [...new Set((await renderedParts(page)).filter((p) => p.componentId === id && p.role === 'shell').map((p) => p.color))];

test.beforeEach(async ({ page }) => {
  await installThreeHook(page);
});

test('overlapping components turn red and are listed, without changing the saved scene', async ({ page }) => {
  await page.goto('/');
  await waitForCanvas(page);
  // Click-add places tanks 2.4 m apart: their boxes touch but do not overlap.
  await page.getByRole('button', { name: 'Vertical Tank +' }).click();
  await page.getByRole('button', { name: 'Vertical Tank +' }).click();
  const [first, second] = (await sceneJson(page)).components.map((c: { id: string }) => c.id);
  await expect(page.getByLabel('Collisions')).toHaveCount(0);
  await expect.poll(() => shellColours(page, first)).not.toContain(RED);

  // The second tank is selected; move it into the first.
  await page.getByLabel('X', { exact: true }).fill('1');
  await expect(page.getByLabel('Collisions')).toHaveText('Vertical Tank 1 and Vertical Tank 2 overlap');
  await expect.poll(() => shellColours(page, first)).toEqual([RED]);
  await expect.poll(() => shellColours(page, second)).toEqual([RED]);
  await expect(page.getByLabel('Scene JSON')).not.toHaveValue(/collid/i);

  // Moving it clear removes the warning.
  await page.getByLabel('X', { exact: true }).fill('2.4');
  await expect(page.getByLabel('Collisions')).toHaveCount(0);
  await expect.poll(() => shellColours(page, first)).not.toContain(RED);
});

test('the drop preview turns red and says what it would overlap', async ({ page }) => {
  await page.goto('/');
  await waitForCanvas(page);
  await startDrag(page, 'Vertical Tank +', [0, 0, 0]);
  await page.mouse.up();
  const [x, , z] = Object.values((await sceneJson(page)).components[0].position) as number[];

  // Drag a valve onto the middle of the tank.
  const box = (await page.locator('canvas').boundingBox())!;
  const target = project([x, 0, z + 0.3], box);
  await page.getByRole('button', { name: 'Ball Valve +' }).hover();
  await page.mouse.down();
  await page.mouse.move(target.x, target.y, { steps: 8 });
  await expect(page.getByRole('status')).toContainText('overlaps Vertical Tank 1');
  await expect.poll(() => shellColours(page, 'drop-preview')).toEqual([RED]);
  await page.mouse.up();
  // Placement is still allowed; the result is flagged.
  await expect(page.getByLabel('Collisions')).toHaveText('Vertical Tank 1 and Ball Valve 1 overlap');
});

test('collision display can be switched off by the host', async ({ page }) => {
  await page.goto('/?collisions=off');
  await waitForCanvas(page);
  await page.getByRole('button', { name: 'Vertical Tank +' }).click();
  await page.getByRole('button', { name: 'Vertical Tank +' }).click();
  await page.getByLabel('X', { exact: true }).fill('1');
  const first = (await sceneJson(page)).components[0].id;
  await page.waitForTimeout(300);
  await expect(page.getByLabel('Collisions')).toHaveCount(0);
  expect(await shellColours(page, first)).not.toContain(RED);
});

test('the demo and generated benchmark scenes are collision-free', async ({ page }) => {
  for (const url of ['/?demo', '/?generate=200']) {
    await page.goto(url);
    await waitForCanvas(page);
    await page.waitForTimeout(300);
    await expect(page.getByLabel('Collisions')).toHaveCount(0);
  }
});
