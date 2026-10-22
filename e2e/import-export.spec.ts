import { readFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';
import { project, sceneJson, startDrag, waitForCanvas, VALVE_FACE } from './helpers';

test('exports a connected rotated scene and re-imports it byte-identically in a fresh editor', async ({ page }) => {
  await page.goto('/');
  await waitForCanvas(page);

  // Tank, a valve snapped to its outlet, and a separate pipe turned a quarter turn with the gizmo.
  await startDrag(page, 'Vertical Tank +', [0, 0, 0]);
  await page.mouse.up();
  const { x, z } = (await sceneJson(page)).components[0].position;
  await startDrag(page, 'Ball Valve +', [x + 1.2 + VALVE_FACE / 2, 0, z]);
  await page.mouse.up();
  await startDrag(page, 'Straight Pipe +', [-3, 0, 2]);
  await page.mouse.up();
  await page.getByRole('button', { name: 'Rotate' }).click();
  const pipe = (await sceneJson(page)).components[2].position;
  const box = (await page.locator('canvas').boundingBox())!;
  const a = project([pipe.x + 1, pipe.y, pipe.z + 1], box);
  const b = project([pipe.x + 1.4, pipe.y, pipe.z - 0.6], box);
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  await page.mouse.move(b.x, b.y, { steps: 12 });
  await page.mouse.up();

  const saved = await page.getByLabel('Scene JSON').inputValue();
  const scene = JSON.parse(saved);
  expect(scene.connections).toHaveLength(1);
  expect(scene.components[2].rotation).not.toEqual({ x: 0, y: 0, z: 0, w: 1 });

  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export JSON' }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe('scene.json');
  const file = await download.path();
  expect(await readFile(file, 'utf8')).toBe(saved);

  await page.reload();
  await waitForCanvas(page);
  expect((await sceneJson(page)).components).toEqual([]);
  await page.getByLabel('Import scene file').setInputFiles(file);
  await expect(page.getByLabel('Scene JSON')).toHaveValue(saved);
  await expect(page.getByText('Loaded 3 components and 1 connection.')).toBeVisible();

  // The import is one undo step back to the empty scene.
  await page.getByRole('button', { name: 'Undo' }).click();
  expect((await sceneJson(page)).components).toEqual([]);
});

test('rejects malformed text with readable errors and keeps the current scene', async ({ page }) => {
  await page.goto('/');
  await waitForCanvas(page);
  await page.getByRole('button', { name: 'Vertical Tank +' }).click();
  const before = await page.getByLabel('Scene JSON').inputValue();

  await page.getByLabel('Import JSON text').fill('{"schemaVersion": 3, "units": "m", "components": [{"id": "x"}], "connections": []}');
  await page.getByRole('button', { name: 'Load text' }).click();
  const alert = page.getByRole('alert');
  await expect(alert).toContainText('components[0].type: Unknown component type undefined.');
  await expect(alert).toContainText('components[0].rotation: Expected an object with finite x, y, z, w');
  await expect(page.getByLabel('Scene JSON')).toHaveValue(before);

  await page.getByLabel('Import JSON text').fill('not json');
  await page.getByRole('button', { name: 'Load text' }).click();
  await expect(alert).toContainText('Not valid JSON');
  await expect(page.getByLabel('Scene JSON')).toHaveValue(before);
});

test('migrates a pasted version 1 scene and reports it', async ({ page }) => {
  await page.goto('/');
  await waitForCanvas(page);
  const v1 = JSON.stringify({
    version: 1,
    components: [{ id: 'old-tank', kind: 'tank', position: [0, 1.535, 0], rotation: [0, Math.PI / 2, 0], properties: { level: 30 } }],
    connections: [],
  });
  await page.getByLabel('Import JSON text').fill(v1);
  await page.getByRole('button', { name: 'Load text' }).click();
  await expect(page.getByText('Loaded 1 component and 0 connections (migrated from version 1).')).toBeVisible();
  const scene = await sceneJson(page);
  expect(scene.schemaVersion).toBe(4);
  expect(scene.documentType).toBe('industrial.scene');
  expect(scene.components[0]).toEqual(expect.objectContaining({ id: 'old-tank', type: 'tank', scale: { x: 1, y: 1, z: 1 } }));
  expect(scene.components[0].rotation.y).toBeCloseTo(Math.SQRT1_2, 12);
  await expect(page.getByRole('alert')).toHaveCount(0);
});
