import { expect, test } from '@playwright/test';
import { installThreeHook, renderedParts, sceneJson, waitForCanvas } from './helpers';

// Host component types through the registry (ADR-0022), using the playground's `?custom` example.

test('a registered host type is in the palette, renders with its own parts, connects, and round-trips', async ({ page }) => {
  await installThreeHook(page);
  await page.goto('/?custom');
  await waitForCanvas(page);
  await page.getByRole('button', { name: 'Inline Filter (example) +' }).click();
  const filter = (await sceneJson(page)).components[0];
  expect(filter.type).toBe('com.example.filter');
  // Its own three parts, not the one-box placeholder: the registry reaches the 3D canvas.
  await expect.poll(async () => (await renderedParts(page)).filter((p) => p.componentId === filter.id).length).toBe(3);
  await expect(page.getByRole('heading', { name: 'Inline Filter (example)' })).toBeVisible();

  // Attach a built-in pipe to it (Shift+click in the scene list), as with any part.
  await page.getByRole('button', { name: 'Straight Pipe +' }).click();
  await page.getByRole('button', { name: 'Inline Filter (example) 1' }).click();
  await page.getByRole('button', { name: 'Straight Pipe 1' }).click({ modifiers: ['Shift'] });
  await expect.poll(async () => (await sceneJson(page)).connections.length).toBe(1);

  // Export and import the same text: identical scene.
  const saved = await page.getByLabel('Scene JSON').inputValue();
  await page.getByLabel('Import JSON text').fill(saved);
  await page.getByRole('button', { name: 'Load text' }).click();
  await expect(page.getByText('Loaded 2 components and 1 connection.')).toBeVisible();
  await expect(page.getByLabel('Scene JSON')).toHaveValue(saved);

  // The Walk parts menu offers it too.
  await page.getByRole('button', { name: 'Walk', exact: true }).click();
  await page.keyboard.press('KeyP');
  await expect(page.getByRole('dialog', { name: 'Place a part' }).getByRole('button', { name: 'Inline Filter (example)' })).toBeVisible();
});

test('an editor without the registration refuses a file that uses the host type', async ({ page }) => {
  await page.goto('/');
  await waitForCanvas(page);
  const doc = {
    schemaVersion: 4,
    documentType: 'industrial.scene',
    units: 'm',
    components: [{ id: 'f', type: 'com.example.filter', position: { x: 0, y: 0.35, z: 0 }, rotation: { x: 0, y: 0, z: 0, w: 1 }, scale: { x: 1, y: 1, z: 1 }, properties: {} }],
    connections: [],
  };
  await page.getByLabel('Import JSON text').fill(JSON.stringify(doc));
  await page.getByRole('button', { name: 'Load text' }).click();
  await expect(page.getByRole('alert')).toContainText('components[0].type');
  expect((await sceneJson(page)).components).toEqual([]);
});
