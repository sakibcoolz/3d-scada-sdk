import { expect, test, type Page } from '@playwright/test';
import { project, sceneJson, waitForCanvas } from './helpers';

// Shift+click attaches the clicked part to the selected one at their closest free ports.
const notice = (page: Page) => page.getByRole('status', { name: 'Connection message' });

async function tankAndValve(page: Page) {
  await page.goto('/');
  await waitForCanvas(page);
  await page.getByRole('button', { name: 'Vertical Tank +' }).click();
  await page.getByRole('button', { name: 'Ball Valve +' }).click();
  const [tank, valve] = (await sceneJson(page)).components;
  expect((await sceneJson(page)).connections).toEqual([]);
  return { tank, valve };
}

test('Shift+click in the scene list attaches the part to the selected one, as one undo step', async ({ page }) => {
  const { tank, valve } = await tankAndValve(page);
  await page.getByRole('button', { name: 'Vertical Tank 1', exact: true }).click();
  await page.getByRole('button', { name: 'Ball Valve 1', exact: true }).click({ modifiers: ['Shift'] });
  await expect(notice(page)).toHaveText(/^Attached Ball Valve 1 "in" to Vertical Tank 1 "outlet" \(moved [\d.]+ (m|mm)\)\./);
  const scene = await sceneJson(page);
  expect(scene.connections).toEqual([{ id: expect.any(String), from: { instanceId: valve.id, portId: 'in' }, to: { instanceId: tank.id, portId: 'outlet' } }]);
  // The valve now sits on the tank outlet: 0.6 m beyond it, at the outlet's height.
  const moved = scene.components[1];
  expect(moved.position.x).toBeCloseTo(tank.position.x + 1.2 + 0.6, 9);
  expect(moved.position.y).toBeCloseTo(tank.position.y - 0.9, 9);
  expect(scene.components[0]).toEqual(tank);
  await expect(page.getByLabel('Open joints')).toHaveCount(0);
  // The attached part becomes the selection.
  await expect(page.getByRole('heading', { name: 'Ball Valve', level: 4 })).toBeVisible();

  await page.getByRole('button', { name: 'Undo' }).click();
  const undone = await sceneJson(page);
  expect(undone.connections).toEqual([]);
  expect(undone.components[1]).toEqual(valve);
});

test('Shift+click on the part in the 3D view attaches it too', async ({ page }) => {
  const { tank, valve } = await tankAndValve(page);
  await page.getByRole('button', { name: 'Vertical Tank 1', exact: true }).click();
  const box = (await page.locator('canvas').boundingBox())!;
  const at = project([valve.position.x, valve.position.y, valve.position.z], box);
  await page.keyboard.down('Shift');
  await page.mouse.click(at.x, at.y);
  await page.keyboard.up('Shift');
  await expect(notice(page)).toContainText('Attached Ball Valve 1 "in" to Vertical Tank 1 "outlet"');
  expect((await sceneJson(page)).connections).toHaveLength(1);
  expect(tank.id).toBeTruthy();
});

test('a part with no matching ports is not attached, and the reason is shown', async ({ page }) => {
  await page.goto('/');
  await waitForCanvas(page);
  await page.getByRole('button', { name: 'Vertical Tank +' }).click();
  await page.getByRole('button', { name: 'Sensor +' }).click();
  await page.getByRole('button', { name: 'Vertical Tank 1', exact: true }).click();
  const before = await page.getByLabel('Scene JSON').inputValue();
  await page.getByRole('button', { name: 'Sensor 1', exact: true }).click({ modifiers: ['Shift'] });
  await expect(notice(page)).toHaveText(/Cannot attach Sensor 1 to Vertical Tank 1: These parts have no free ports of the same type and size\./);
  await expect(page.getByLabel('Scene JSON')).toHaveValue(before);
});

test('nothing is attached while editing is locked', async ({ page }) => {
  await tankAndValve(page);
  await page.getByRole('button', { name: 'Vertical Tank 1', exact: true }).click();
  await page.getByRole('button', { name: 'Lock editing' }).click();
  await page.getByRole('button', { name: 'Ball Valve 1', exact: true }).click({ modifiers: ['Shift'] });
  await expect(notice(page)).toHaveText(/Editing is locked: Ball Valve 1 was not attached\./);
  expect((await sceneJson(page)).connections).toEqual([]);
});
