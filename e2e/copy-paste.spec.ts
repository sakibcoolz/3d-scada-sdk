import { expect, test, type Page } from '@playwright/test';
import { sceneJson, startDrag, VALVE_FACE, waitForCanvas } from './helpers';

type C = { id: string; type: string; parentId?: string; position: { x: number; y: number; z: number }; properties: Record<string, unknown> };
const components = async (page: Page) => (await sceneJson(page)).components as C[];

test('copy and paste a single component beside the original, undoably', async ({ page }) => {
  await page.goto('/');
  await waitForCanvas(page);
  await page.getByRole('button', { name: 'Ball Valve +' }).click();
  const [original] = await components(page);

  await page.getByRole('button', { name: 'Copy component' }).click();
  await page.getByRole('button', { name: 'Paste (1)' }).click();
  await expect(page.getByText('Pasted 1 component.')).toBeVisible();
  let all = await components(page);
  expect(all).toHaveLength(2);
  const copy = all[1];
  expect(copy.id).not.toBe(original.id);
  expect(copy.type).toBe('valve');
  expect(copy.properties).toEqual(original.properties);
  expect(copy.position.x).toBeCloseTo(original.position.x + VALVE_FACE + 0.5, 9); // width F + 0.5 m gap
  await expect(page.getByRole('button', { name: /^Ball Valve 2/ })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByLabel('Collisions')).toHaveCount(0);

  await page.getByRole('button', { name: 'Undo' }).click();
  expect(await components(page)).toHaveLength(1);

  // Keyboard: Ctrl+C on the selected component, Ctrl+V twice pastes two copies further along.
  const entry = page.getByRole('button', { name: /^Ball Valve 1/ });
  await entry.click();
  await entry.focus();
  await page.keyboard.press('Control+c');
  await page.keyboard.press('Control+v');
  await page.keyboard.press('Control+v');
  all = await components(page);
  all.map((c) => c.position.x - original.position.x).forEach((dx, i) => expect(dx).toBeCloseTo(i * (VALVE_FACE + 0.5), 9));
});

test('copy and paste a whole assembly with its connections and parent links', async ({ page }) => {
  await page.goto('/');
  await waitForCanvas(page);
  await startDrag(page, 'Vertical Tank +', [0, 0, 0]);
  await page.mouse.up();
  const t = (await components(page))[0];
  await startDrag(page, 'Ball Valve +', [t.position.x + 1.2 + VALVE_FACE / 2, 0, t.position.z]);
  await page.mouse.up();
  await page.getByRole('button', { name: /^Vertical Tank 1/ }).click();
  await page.getByRole('button', { name: 'Lock connected as children' }).click();

  // Copy from a child: "Copy assembly" takes the whole build.
  await page.getByRole('button', { name: /^Ball Valve 1/ }).click();
  await page.getByRole('button', { name: 'Copy assembly' }).click();
  await page.getByRole('button', { name: 'Paste (2)' }).click();
  await expect(page.getByText('Pasted 2 components.')).toBeVisible();

  const scene = await sceneJson(page);
  const [, , newTank, newValve] = scene.components as C[];
  expect(scene.connections).toHaveLength(2);
  expect(newTank.type).toBe('tank');
  expect(newTank.parentId).toBeUndefined();
  expect(newValve.parentId).toBe(newTank.id);
  expect(scene.connections[1]).toEqual(
    expect.objectContaining({ from: expect.objectContaining({ instanceId: newValve.id }), to: expect.objectContaining({ instanceId: newTank.id }) }),
  );
  await expect(page.getByLabel('Collisions')).toHaveCount(0);
});

test('tag bindings are not copied', async ({ page }) => {
  await page.goto('/?demo');
  await waitForCanvas(page);
  const before = (await sceneJson(page)).tagBindings.length;
  await page.getByRole('button', { name: /^Vertical Tank 1/ }).click();
  await page.getByRole('button', { name: 'Copy component' }).click();
  await page.getByRole('button', { name: 'Paste (1)' }).click();
  expect((await sceneJson(page)).tagBindings).toHaveLength(before);
  await expect(page.getByText('Pasted 1 component. Tag bindings are not copied.')).toBeVisible();
});

test('copy works while locked but paste does not', async ({ page }) => {
  await page.goto('/');
  await waitForCanvas(page);
  await page.getByRole('button', { name: 'Ball Valve +' }).click();
  await page.getByRole('button', { name: 'Lock editing' }).click();
  await page.getByRole('button', { name: 'Copy component' }).click();
  await expect(page.getByRole('button', { name: 'Paste (1)' })).toBeDisabled();
  await page.getByRole('button', { name: 'Unlock editing' }).click();
  await expect(page.getByRole('button', { name: 'Paste (1)' })).toBeEnabled();
});
