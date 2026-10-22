import { expect, test, type Page } from '@playwright/test';
import { sceneJson, waitForCanvas } from './helpers';

// Wiring and relationships in the editor (ADR-0027, T-088), from an empty workspace.

const ports = (page: Page) => page.getByRole('list', { name: 'Ports' });
const port = (page: Page, id: string) => ports(page).getByRole('listitem', { name: `Port ${id}` });

async function build(page: Page) {
  await page.goto('/?layout=split');
  await waitForCanvas(page);
  for (const part of ['Variable-Frequency Drive +', 'AC Induction Motor +', 'PLC Digital Output Module +']) await page.getByRole('button', { name: part }).click();
  return Object.fromEntries((await sceneJson(page)).components.map((c: { id: string; type: string }) => [c.type, c.id]));
}

test('the picker refuses a 230 V motor with its reason, wires a matching one, and undoes', async ({ page }) => {
  const ids = await build(page);
  await page.getByRole('button', { name: 'AC Induction Motor 1' }).click();
  await page.getByLabel('Voltage').selectOption('230');

  await page.getByRole('button', { name: 'Variable-Frequency Drive 1' }).click();
  await page.getByRole('button', { name: 'Wire U-V-W' }).click();
  const picker = page.getByRole('group', { name: 'Wire U-V-W to' });
  const terminals = picker.getByRole('button', { name: `${ids['sdk.motor']} · terminals` });
  await expect(terminals).toBeDisabled();
  await expect(picker).toContainText('400 V cannot connect to 230 V');
  await expect(picker).toContainText('protective earth connects only to protective earth');

  // Match the voltage and wire it.
  await page.getByRole('button', { name: 'AC Induction Motor 1' }).click();
  await page.getByLabel('Voltage').selectOption('400');
  await page.getByRole('button', { name: 'Variable-Frequency Drive 1' }).click();
  await page.getByRole('button', { name: 'Wire U-V-W' }).click();
  await page.getByRole('group', { name: 'Wire U-V-W to' }).getByRole('button', { name: `${ids['sdk.motor']} · terminals` }).click();
  await expect(port(page, 'U-V-W').getByLabel('Usage of U-V-W')).toHaveText('1/1');
  await expect(page.getByRole('button', { name: 'Wire U-V-W' })).toHaveCount(0);
  expect((await sceneJson(page)).connections).toEqual([
    { id: expect.any(String), from: { instanceId: ids['sdk.vfd'], portId: 'U-V-W' }, to: { instanceId: ids['sdk.motor'], portId: 'terminals' } },
  ]);

  // The electrical diagram redraws with the new wire.
  await page.getByRole('button', { name: 'Electrical diagram' }).click();
  await expect(page.getByRole('group', { name: 'Electrical view' }).locator('[data-edge-domain="power"]')).toHaveCount(1);

  await page.getByRole('button', { name: 'Undo' }).click();
  expect((await sceneJson(page)).connections).toEqual([]);
  await page.getByRole('button', { name: 'Redo' }).click();
  expect((await sceneJson(page)).connections).toHaveLength(1);
});

test('a wire takes a relationship and cable details, refuses credential-like names, and disconnects', async ({ page }) => {
  const ids = await build(page);
  // From the output module this time: DO0 to the drive's run input.
  await page.getByRole('button', { name: 'PLC Digital Output Module 1' }).click();
  await page.getByRole('button', { name: 'Wire DO0' }).click();
  const picker = page.getByRole('group', { name: 'Wire DO0 to' });
  await expect(picker).toContainText('a digital signal cannot connect to an analog one');
  await expect(picker).toContainText('an output cannot connect to an output');
  await picker.getByRole('button', { name: `${ids['sdk.vfd']} · run (DI1)` }).click();

  const row = port(page, 'DO0');
  await row.getByRole('button', { name: 'Details' }).click();
  await row.getByLabel('Relationship').selectOption('controls');
  await row.getByLabel('Property name').fill('cable');
  await row.getByLabel('Property value').fill('LiYCY 2x0.75');
  await row.getByRole('button', { name: 'Add' }).click();
  await row.getByLabel('Property name').fill('lengthM');
  await row.getByLabel('Property value').fill('12');
  await row.getByRole('button', { name: 'Add' }).click();
  expect((await sceneJson(page)).connections[0]).toMatchObject({ relationship: 'controls', properties: { cable: 'LiYCY 2x0.75', lengthM: 12 } });

  // The document's own rule: no credential-like property names.
  await row.getByLabel('Property name').fill('password');
  await row.getByLabel('Property value').fill('x');
  await row.getByRole('button', { name: 'Add' }).click();
  await expect(page.getByRole('status', { name: 'Connection message' })).toContainText('Cannot change the connection');
  expect((await sceneJson(page)).connections[0].properties).toEqual({ cable: 'LiYCY 2x0.75', lengthM: 12 });

  await row.getByRole('button', { name: `Disconnect ${ids['sdk.vfd']} · run` }).click();
  expect((await sceneJson(page)).connections).toEqual([]);
});

test('relationships are added and removed from the Related section, and editing is offered only while unlocked', async ({ page }) => {
  const ids = await build(page);
  await page.getByRole('button', { name: 'AC Induction Motor 1' }).click();
  await page.getByLabel('Relationship to add').selectOption('drives');
  await page.getByLabel('Related component').selectOption(ids['sdk.vfd']);
  await page.getByRole('button', { name: 'Add relationship' }).click();
  expect((await sceneJson(page)).associations).toEqual([{ id: expect.any(String), relationship: 'drives', from: ids['sdk.motor'], to: ids['sdk.vfd'] }]);
  await expect(page.getByRole('group', { name: 'Drives' })).toContainText(ids['sdk.vfd']);

  // The same fact twice is refused by core, with its reason.
  await page.getByRole('button', { name: 'Add relationship' }).click();
  await expect(page.getByRole('status', { name: 'Connection message' })).toContainText('Cannot add the relationship');
  expect((await sceneJson(page)).associations).toHaveLength(1);

  await page.getByRole('button', { name: `Remove relationship with ${ids['sdk.vfd']}` }).click();
  expect((await sceneJson(page)).associations).toBeUndefined();

  await page.getByRole('button', { name: 'Lock editing' }).click();
  await expect(page.getByRole('button', { name: 'Wire terminals' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Add relationship' })).toHaveCount(0);
  await expect(ports(page)).toBeVisible();
});
