import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { installThreeHook, renderedParts, sceneJson, waitForCanvas } from './helpers';

// The owner's plant, written before ASME fittings (ADR-0014): the tee is turned end for end and valve B
// (Ball Valve 3) sat 15 mm off the old 1 m branch; after the upgrade the shorter tee leaves it 857 mm off.
const plant = readFileSync(join(__dirname, '../packages/components/src/fixtures/open-joints-plant.json'), 'utf8');
const list = (page: Page) => page.getByLabel('Open joints');

async function load(page: Page) {
  await installThreeHook(page);
  await page.goto('/');
  await waitForCanvas(page);
  await page.getByLabel('Import JSON text').fill(plant);
  await page.getByRole('button', { name: 'Load text' }).click();
}

test('lists connections whose ports do not meet and marks both ends', async ({ page }) => {
  await load(page);
  await expect(list(page)).toHaveText(
    [
      'Straight Pipe 1 "out" → T-Junction 1 "left": ports face the wrong way (1.14 m apart)',
      'T-Junction 1 "right" → Ball Valve 2 "in": ports face the wrong way (1.14 m apart)',
      'T-Junction 1 "branch" → Ball Valve 3 "in": 857 mm apart, no pipe can be drawn',
    ].join('\n'),
  );
  await expect.poll(async () => (await renderedParts(page)).filter((p) => p.role === 'open-joint').length).toBe(6);
});

test('seating the tee and then valve B closes every open joint, one undo step each', async ({ page }) => {
  await load(page);
  await page.getByRole('button', { name: /^T-Junction 1/ }).click();
  await page.getByRole('button', { name: 'Seat on Straight Pipe 1 "out"' }).click();
  await expect(page.getByRole('status', { name: 'Connection message' })).toHaveText(/Seated T-Junction 1 "left" on Straight Pipe 1 "out" \(moved 1\.14 m\)\./);
  await expect(list(page)).toHaveText(/^T-Junction 1 "branch" → Ball Valve 3 "in": .+ apart, no pipe can be drawn$/);

  await page.getByRole('button', { name: /^Ball Valve 3/ }).click();
  await page.getByRole('button', { name: 'Seat on T-Junction 1 "branch"' }).click();
  await expect(list(page)).toHaveCount(0);
  const valveB = (await sceneJson(page)).components.find((c: { id: string }) => c.id === 'valve-b');
  expect(valveB.position.y).toBeCloseTo(0.635, 9);
  await expect.poll(async () => (await renderedParts(page)).filter((p) => p.role === 'open-joint').length).toBe(0);

  await page.getByRole('button', { name: 'Undo' }).click();
  await expect(list(page)).toHaveText(/^T-Junction 1 "branch" → Ball Valve 3 "in": .+ apart, no pipe can be drawn$/);
});

test('only open joints of the selected part get a seat button', async ({ page }) => {
  await load(page);
  await page.getByRole('button', { name: /^Vertical Tank 1/ }).click();
  await expect(page.getByRole('button', { name: /^Seat on/ })).toHaveCount(0);
  await page.getByRole('button', { name: /^Ball Valve 2/ }).click();
  await expect(page.getByRole('button', { name: /^Seat on/ })).toHaveText(['Seat on T-Junction 1 "right"']);
});

test('seating is unavailable while editing is locked', async ({ page }) => {
  await load(page);
  await page.getByRole('button', { name: /^Ball Valve 3/ }).click();
  await page.getByRole('button', { name: 'Lock editing' }).click();
  await expect(page.getByRole('button', { name: 'Seat on T-Junction 1 "branch"' })).toBeDisabled();
});

test('the demo plant, joined by routed pipe runs, shows no open joints', async ({ page }) => {
  await page.goto('/?demo');
  await waitForCanvas(page);
  await expect(page.getByLabel('Collisions')).toHaveCount(0);
  await expect(list(page)).toHaveCount(0);
});
