import { expect, test } from '@playwright/test';
import { installThreeHook, rendererMemory, sceneJson, waitForCanvas } from './helpers';

test('GPU geometry and texture counts return to the same level across remounts', async ({ page }) => {
  await installThreeHook(page);
  await page.goto('/?demo');
  await waitForCanvas(page);
  await page.waitForTimeout(500);
  const [first] = await rendererMemory(page);
  expect(first.geometries).toBeGreaterThan(10);

  const mount = page.getByLabel('Mount editor');
  for (let i = 0; i < 5; i++) {
    await mount.uncheck();
    await mount.check();
    await waitForCanvas(page);
    await page.waitForTimeout(400);
  }
  expect(await rendererMemory(page)).toEqual([first]);
});

test('editing churn does not accumulate geometry', async ({ page }) => {
  await installThreeHook(page);
  await page.goto('/?demo');
  await waitForCanvas(page);
  await page.waitForTimeout(500);
  const [before] = await rendererMemory(page);

  // Add and remove a component ten times, switch every view mode, and toggle flow states.
  for (let i = 0; i < 10; i++) {
    await page.getByRole('button', { name: 'Ball Valve +' }).click();
    await page.getByRole('button', { name: 'Remove' }).click();
  }
  for (const mode of ['glass', 'xray', 'cutaway', 'normal']) await page.getByLabel('View mode', { exact: true }).selectOption(mode);
  for (const quality of ['BAD', 'GOOD', 'STALE', 'GOOD']) await page.getByLabel('Quality FT-101').selectOption(quality);
  await page.waitForTimeout(500);

  expect((await sceneJson(page)).components).toHaveLength(6);
  expect(await rendererMemory(page)).toEqual([before]);
});
