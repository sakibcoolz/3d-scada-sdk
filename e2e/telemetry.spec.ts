import { expect, test, type Page } from '@playwright/test';
import { installThreeHook, project, renderedParts, sceneJson, waitForCanvas } from './helpers';

async function part(page: Page, componentId: string, role: string) {
  return (await renderedParts(page)).find((p) => p.componentId === componentId && p.role === role)!;
}

test.describe('demo telemetry', () => {
  test.beforeEach(async ({ page }) => {
    await installThreeHook(page);
    await page.goto('/?demo');
    await waitForCanvas(page);
  });

  test('bound values drive the view and untrusted ones are not shown as live', async ({ page }) => {
    await expect(page.getByLabel('Telemetry summary')).toHaveText('Tags: 3 good, 0 uncertain, 0 unknown');
    await expect.poll(async () => (await part(page, 'tank', 'liquid')).scaleY).toBeCloseTo(0.6, 9);

    const box = (await page.locator('canvas').boundingBox())!;
    const tank = project([0, 2.2, 1], box);
    await page.mouse.click(tank.x, tank.y);
    const live = page.getByLabel('Live values');
    await expect(live).toContainText('level: 60 % · GOOD');
    await expect(live).toContainText('temperature: 25 °C · GOOD');

    await page.getByLabel('Quality LT-101').selectOption('BAD');
    await expect.poll(async () => (await part(page, 'tank', 'liquid')).visible).toBe(false);
    await expect(live).toContainText('level: unknown (bad quality)');
    await expect(page.getByLabel('Telemetry summary')).toHaveText('Tags: 2 good, 0 uncertain, 1 unknown (1 bad quality)');

    // A lost source link (ADR-0024) is unknown too, and says so.
    await page.getByLabel('Quality LT-101').selectOption('DISCONNECTED');
    await expect(live).toContainText('level: unknown (disconnected)');
    await expect.poll(async () => (await part(page, 'tank', 'liquid')).visible).toBe(false);
    await expect(page.getByLabel('Telemetry summary')).toHaveText('Tags: 2 good, 0 uncertain, 1 unknown (1 disconnected)');
  });

  test('a valve shows open, closed, or unknown from its tag', async ({ page }) => {
    const ball = async () => (await part(page, 'valve', 'valve-ball')).color;
    await expect.poll(ball).toBe('#48b983');
    await page.getByLabel('Value XV-101').fill('false');
    await expect.poll(ball).toBe('#e76e75');
    await page.getByLabel('Quality XV-101').selectOption('STALE');
    await expect.poll(ball).toBe('#8a96a3');
  });
});

test('binding a property to a tag is saved with the scene and undoable', async ({ page }) => {
  await page.goto('/');
  await waitForCanvas(page);
  await page.getByRole('button', { name: 'Vertical Tank +' }).click();
  const tankId = (await sceneJson(page)).components[0].id;

  await page.getByLabel('Tag for level').fill('LT-7');
  await page.getByLabel('Tag for level').press('Enter');
  expect((await sceneJson(page)).tagBindings).toEqual([
    { id: expect.any(String), tagId: 'LT-7', kind: 'property', instanceId: tankId, property: 'level' },
  ]);

  await page.getByLabel('Tag for level').fill('');
  await page.getByLabel('Tag for level').press('Enter');
  expect((await sceneJson(page)).tagBindings).toBeUndefined();

  await page.getByRole('button', { name: 'Undo' }).click();
  expect((await sceneJson(page)).tagBindings?.[0]?.tagId).toBe('LT-7');
});
