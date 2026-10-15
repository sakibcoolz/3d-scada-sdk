import { expect, test, type Page } from '@playwright/test';
import { project, sceneJson, startDrag, waitForCanvas } from './helpers';

const lockButton = (page: Page) => page.getByRole('button', { name: /^(Lock|Unlock) editing$/ });

async function addTankAndLock(page: Page) {
  await page.goto('/');
  await waitForCanvas(page);
  await page.getByRole('button', { name: 'Vertical Tank +' }).click();
  await page.getByRole('button', { name: 'Lock editing' }).click();
  await expect(lockButton(page)).toHaveText('Unlock editing');
  await expect(lockButton(page)).toHaveAttribute('aria-pressed', 'true');
}

test('locking disables every editing control but keeps viewing tools', async ({ page }) => {
  await addTankAndLock(page);
  await expect(page.getByText('🔒 Editing locked', { exact: true })).toBeVisible();

  for (const name of ['Vertical Tank +', 'Ball Valve +', 'Remove', 'Undo', 'Move', 'Rotate', 'Load text', 'Reset rotation', 'Turn +90° about Y']) {
    await expect(page.getByRole('button', { name, exact: true })).toBeDisabled();
  }
  for (const label of ['X', 'Rotation Y (degrees)', 'Liquid level %', 'Temperature °C', 'Tag for level', 'Import scene file', 'Import JSON text']) {
    await expect(page.getByLabel(label, { exact: true })).toBeDisabled();
  }
  // Viewing and export stay available.
  await expect(page.getByLabel('View mode', { exact: true })).toBeEnabled();
  await expect(page.getByLabel('Component view')).toBeEnabled();
  await expect(page.getByRole('button', { name: 'Export JSON' })).toBeEnabled();
  await page.getByLabel('View mode', { exact: true }).selectOption('glass');
});

test('keyboard edits and palette drops do nothing while locked; selection still works', async ({ page }) => {
  await addTankAndLock(page);
  const before = await page.getByLabel('Scene JSON').inputValue();

  const entry = page.getByRole('button', { name: /^Vertical Tank 1/ });
  await entry.focus();
  for (const key of ['ArrowRight', 'PageUp', 'r', 'Delete', 'Control+z']) await page.keyboard.press(key);
  await expect(page.getByLabel('Scene JSON')).toHaveValue(before);

  await page.keyboard.press('Escape');
  await expect(entry).toHaveAttribute('aria-pressed', 'false');
  await entry.click();
  await expect(entry).toHaveAttribute('aria-pressed', 'true');

  await startDrag(page, 'Straight Pipe +', [3, 0, 3]);
  await expect(page.getByRole('status')).toHaveText('');
  await page.mouse.up();
  await expect(page.getByLabel('Scene JSON')).toHaveValue(before);
});

test('the move gizmo is not available while locked', async ({ page }) => {
  await addTankAndLock(page);
  const before = (await sceneJson(page)).components[0].position;
  const box = (await page.locator('canvas').boundingBox())!;
  const a = project([before.x + 1.5, before.y, before.z], box);
  const b = project([before.x + 3.5, before.y, before.z], box);
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  await page.mouse.move(b.x, b.y, { steps: 10 });
  await page.mouse.up();
  expect((await sceneJson(page)).components[0].position).toEqual(before);
});

test('unlocking restores editing', async ({ page }) => {
  await addTankAndLock(page);
  await lockButton(page).click();
  await expect(lockButton(page)).toHaveText('Lock editing');
  await expect(page.getByText('🔒 Editing locked', { exact: true })).toHaveCount(0);
  await page.getByLabel('X', { exact: true }).fill('4');
  expect((await sceneJson(page)).components[0].position.x).toBe(4);
});

test('a host can start the editor locked', async ({ page }) => {
  await page.goto('/?demo&locked');
  await waitForCanvas(page);
  await expect(page.getByText('🔒 Editing locked', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Vertical Tank +' })).toBeDisabled();
  // Live data still flows while locked.
  await expect(page.getByLabel('Telemetry summary')).toHaveText('Tags: 3 good, 0 uncertain, 0 unknown');
});
