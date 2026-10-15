import { expect, test } from '@playwright/test';
import { waitForCanvas } from './helpers';

test('a long properties panel scrolls on its own instead of stretching the 3D view', async ({ page }) => {
  await page.goto('/?demo');
  await waitForCanvas(page);
  // The tank has the longest panel: position, rotation, level, temperature, bindings, assembly, view.
  await page.getByRole('button', { name: /^Vertical Tank 1/ }).click();
  const viewport = page.viewportSize()!;
  const canvas = (await page.locator('canvas').boundingBox())!;
  expect(canvas.y + canvas.height).toBeLessThanOrEqual(viewport.height + 1);
  expect(await page.evaluate(() => document.documentElement.scrollHeight)).toBeLessThanOrEqual(viewport.height + 1);
  const panel = page.locator('aside').nth(1);
  expect(await panel.evaluate((el) => el.scrollHeight > el.clientHeight)).toBe(true);
});
