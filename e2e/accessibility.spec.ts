import { expect, test } from '@playwright/test';
import { sceneJson, waitForCanvas } from './helpers';

test('every control has an accessible name', async ({ page }) => {
  await page.goto('/?demo');
  await waitForCanvas(page);
  // Select a component so the properties panel is populated.
  await page.getByRole('button', { name: /^Vertical Tank 1/ }).click();
  const controls = page.locator('button, input, select, textarea');
  const count = await controls.count();
  expect(count).toBeGreaterThan(20);
  for (let i = 0; i < count; i++) await expect(controls.nth(i)).toHaveAccessibleName(/\S/);
});

test('the 3D view is a labelled region with a text description', async ({ page }) => {
  await page.goto('/?demo');
  await waitForCanvas(page);
  const region = page.getByRole('region', { name: '3D scene view' });
  await expect(region).toBeVisible();
  await expect(region).toHaveAccessibleDescription('6 components, 5 connections.');
});

test('a component can be added, selected, moved, turned, undone and removed with the keyboard only', async ({ page }) => {
  await page.goto('/');
  await waitForCanvas(page);

  // Tab to the palette button and activate it with Enter.
  for (let i = 0; i < 30 && !(await page.getByRole('button', { name: 'Ball Valve +' }).evaluate((el) => el === document.activeElement)); i++) {
    await page.keyboard.press('Tab');
  }
  await expect(page.getByRole('button', { name: 'Ball Valve +' })).toBeFocused();
  await page.keyboard.press('Enter');
  const start = (await sceneJson(page)).components[0];

  // The new component is selected and listed; focus the list entry to operate on it.
  const entry = page.getByRole('button', { name: /^Ball Valve 1/ });
  await expect(entry).toHaveAttribute('aria-pressed', 'true');
  await entry.focus();

  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('PageUp');
  let valve = (await sceneJson(page)).components[0];
  [start.position[0] + 0.2, start.position[1] + 0.1, start.position[2]].forEach((n, i) => expect(valve.position[i]).toBeCloseTo(n, 9));

  await page.keyboard.press('r');
  valve = (await sceneJson(page)).components[0];
  expect(valve.rotation[1]).toBeCloseTo(Math.SQRT1_2, 12);

  // Repeated presses of one key are one undo step: undo the turn, then PageUp; both arrow presses remain.
  await page.keyboard.press('Control+z');
  await page.keyboard.press('Control+z');
  const afterUndo = (await sceneJson(page)).components[0].position;
  [start.position[0] + 0.2, start.position[1], start.position[2]].forEach((n, i) => expect(afterUndo[i]).toBeCloseTo(n, 9));

  await page.keyboard.press('Escape');
  await expect(entry).toHaveAttribute('aria-pressed', 'false');
  await entry.press('Enter');
  await expect(entry).toHaveAttribute('aria-pressed', 'true');
  await page.keyboard.press('Delete');
  expect((await sceneJson(page)).components).toEqual([]);
  await page.keyboard.press('Control+z');
  expect((await sceneJson(page)).components).toHaveLength(1);
});
