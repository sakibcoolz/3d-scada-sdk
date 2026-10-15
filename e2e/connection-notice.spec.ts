import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { sceneJson, startDrag, waitForCanvas } from './helpers';

const notice = (page: Page) => page.getByRole('status', { name: 'Connection message' });

async function tankWithValve(page: Page) {
  await page.goto('/');
  await waitForCanvas(page);
  await startDrag(page, 'Vertical Tank +', [0, 0, 0]);
  await page.mouse.up();
  await expect(notice(page)).toHaveCount(0);
  const tank = (await sceneJson(page)).components[0];
  await startDrag(page, 'Ball Valve +', [tank.position.x + 1.8, 0, tank.position.z]);
  await page.mouse.up();
  expect((await sceneJson(page)).connections).toHaveLength(1);
  return tank;
}

test('dropping a component onto a port shows which ports were connected', async ({ page }) => {
  await tankWithValve(page);
  await expect(notice(page)).toHaveText(/Ball Valve 1 "in" connected to Vertical Tank 1 "outlet"\./);
  await page.getByRole('button', { name: 'Dismiss connection message' }).click();
  await expect(notice(page)).toHaveCount(0);
});

test('the message goes away by itself after a few seconds', async ({ page }) => {
  await tankWithValve(page);
  await expect(notice(page)).toBeVisible();
  await expect(notice(page)).toHaveCount(0, { timeout: 10_000 });
});

test('locking an assembly and then connecting a loose part to it explains both', async ({ page }) => {
  await tankWithValve(page);
  await page.getByRole('button', { name: /^Vertical Tank 1/ }).click();
  await page.getByRole('button', { name: 'Lock connected as children' }).click();
  await expect(notice(page)).toHaveText(/Vertical Tank 1 is now the parent of 1 component; moving any of them moves the whole assembly\./);

  const valve = (await sceneJson(page)).components[1];
  await startDrag(page, 'Ball Valve +', [valve.position.x + 1.2, 0, valve.position.z]);
  await page.mouse.up();
  expect((await sceneJson(page)).connections).toHaveLength(2);
  await expect(notice(page)).toHaveText(/Ball Valve 2 "in" connected to Ball Valve 1 "out"\. Ball Valve 2 is not locked to the Vertical Tank 1 assembly yet/);
});

test('connect touching ports reports the new connections on the canvas', async ({ page }) => {
  const plant = readFileSync(join(__dirname, '../packages/components/src/fixtures/unconnected-plant.json'), 'utf8');
  await page.goto('/');
  await waitForCanvas(page);
  await page.getByLabel('Import JSON text').fill(plant);
  await page.getByRole('button', { name: 'Load text' }).click();
  await expect(notice(page)).toHaveCount(0);
  await page.getByRole('button', { name: /^Connect touching ports/ }).click();
  await expect(notice(page)).toContainText('…and 6 more connections.');
});

test('undo does not announce a connection', async ({ page }) => {
  await tankWithValve(page);
  await page.getByRole('button', { name: 'Dismiss connection message' }).click();
  await page.getByRole('button', { name: 'Undo' }).click();
  await page.getByRole('button', { name: 'Redo' }).click();
  expect((await sceneJson(page)).connections).toHaveLength(1);
  await expect(notice(page)).toHaveCount(0);
});
