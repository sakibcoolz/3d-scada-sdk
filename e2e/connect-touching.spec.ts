import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import { sceneJson, waitForCanvas } from './helpers';

const plant = readFileSync(join(__dirname, '../packages/components/src/fixtures/unconnected-plant.json'), 'utf8');

test('connects every exactly touching port pair in one undoable step', async ({ page }) => {
  await page.goto('/');
  await waitForCanvas(page);
  await page.getByLabel('Import JSON text').fill(plant);
  await page.getByRole('button', { name: 'Load text' }).click();
  expect((await sceneJson(page)).connections).toEqual([]);

  const button = page.getByRole('button', { name: /^Connect touching ports/ });
  await expect(button).toHaveText('Connect touching ports (11)');
  await button.click();
  await expect(page.getByText('Connected 11 touching port pairs.')).toBeVisible();
  const scene = await sceneJson(page);
  expect(scene.connections).toHaveLength(11);
  await expect(button).toHaveText('Connect touching ports (0)');
  await expect(button).toBeDisabled();

  await page.getByRole('button', { name: 'Undo' }).click();
  expect((await sceneJson(page)).connections).toEqual([]);
  await expect(button).toHaveText('Connect touching ports (11)');
});

test('is unavailable while editing is locked', async ({ page }) => {
  await page.goto('/');
  await waitForCanvas(page);
  await page.getByLabel('Import JSON text').fill(plant);
  await page.getByRole('button', { name: 'Load text' }).click();
  await page.getByRole('button', { name: 'Lock editing' }).click();
  await expect(page.getByRole('button', { name: /^Connect touching ports/ })).toBeDisabled();
});

test('already joined pairs are not reported as problems', async ({ page }) => {
  // The same plant with 10 of its 11 joints already connected.
  const mostly = readFileSync(join(__dirname, '../packages/components/src/fixtures/mostly-connected-plant.json'), 'utf8');
  await page.goto('/');
  await waitForCanvas(page);
  await page.getByLabel('Import JSON text').fill(mostly);
  await page.getByRole('button', { name: 'Load text' }).click();
  const button = page.getByRole('button', { name: /^Connect touching ports/ });
  await expect(button).toHaveText('Connect touching ports (1)');
  await button.click();
  await expect(page.getByText('Connected 1 touching port pair.', { exact: true })).toBeVisible();
  await expect(page.getByText(/Not joined/)).toHaveCount(0);
  expect((await sceneJson(page)).connections).toHaveLength(11);
});
