import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import { sceneJson, waitForCanvas } from './helpers';

// Files written before ASME fittings are re-seated on load (ADR-0014).
const plant = readFileSync(join(__dirname, '../packages/components/src/fixtures/unconnected-plant.json'), 'utf8');

test('loading an older plant re-seats it to ASME fitting sizes and says so', async ({ page }) => {
  await page.goto('/');
  await waitForCanvas(page);
  await page.getByLabel('Import JSON text').fill(plant);
  await page.getByRole('button', { name: 'Load text' }).click();
  // The committed plant is a version 3 file, so loading it also reports the migration (ADR-0021).
  await expect(page.getByText(/^Loaded 12 components and 0 connections \(migrated from version 3\)\. Updated \d+ parts? to ASME dimensions\.$/)).toBeVisible();
  await expect(page.getByRole('button', { name: /^Connect touching ports/ })).toHaveText('Connect touching ports (11)');
  // Loading the upgraded file again changes nothing more.
  const upgraded = await page.getByLabel('Scene JSON').inputValue();
  await page.getByLabel('Import JSON text').fill(upgraded);
  await page.getByRole('button', { name: 'Load text' }).click();
  await expect(page.getByText('Loaded 12 components and 0 connections.', { exact: true })).toBeVisible();
  expect(JSON.stringify(await sceneJson(page))).toBe(JSON.stringify(JSON.parse(upgraded)));
});
