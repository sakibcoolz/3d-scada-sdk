import { expect, test, type Page } from '@playwright/test';
import { installThreeHook, renderedParts, sceneJson, waitForCanvas } from './helpers';

// Vertical tank stand (ADR-0013): adjustable, 0.8 m for new tanks, none for tanks in older files.
const shells = async (page: Page, id: string) => (await renderedParts(page)).filter((p) => p.componentId === id && p.role === 'shell').length;

test('a new vertical tank comes on a 0.8 m stand with four legs', async ({ page }) => {
  await installThreeHook(page);
  await page.goto('/');
  await waitForCanvas(page);
  await page.getByRole('button', { name: 'Vertical Tank +' }).click();
  const tank = (await sceneJson(page)).components[0];
  expect(tank.properties).toEqual({ level: 45, diameter: 2, height: 3, standHeight: 0.8 });
  await expect(page.getByLabel('Stand height (m)')).toHaveValue('0.8');
  await expect.poll(() => shells(page, tank.id)).toBe(13);
});

test('a tank from an older file has no stand, and giving it one lifts it so the feet stay on the floor', async ({ page }) => {
  await installThreeHook(page);
  await page.goto('/?demo');
  await waitForCanvas(page);
  const before = (await sceneJson(page)).components.find((c: { id: string }) => c.id === 'tank');
  expect(before.properties.standHeight).toBeUndefined();
  expect(before.position.y).toBe(1.535);
  await expect.poll(() => shells(page, 'tank')).toBe(5);

  await page.getByRole('button', { name: /^Vertical Tank 1/ }).click();
  await expect(page.getByLabel('Stand height (m)')).toHaveValue('0');
  await page.getByLabel('Stand height (m)').fill('1');
  const after = (await sceneJson(page)).components.find((c: { id: string }) => c.id === 'tank');
  expect(after.properties.standHeight).toBe(1);
  expect(after.position.y).toBeCloseTo(2.535, 9);
  await expect.poll(() => shells(page, 'tank')).toBe(13);
  await page.getByRole('button', { name: 'Undo' }).click();
  expect((await sceneJson(page)).components.find((c: { id: string }) => c.id === 'tank').position.y).toBe(1.535);
});
