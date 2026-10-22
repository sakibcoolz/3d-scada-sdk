import { expect, test, type Page } from '@playwright/test';
import { sceneJson, waitForCanvas } from './helpers';

// The tag and variable editor (ADR-0027, T-089).

const dialog = (page: Page) => page.getByRole('dialog', { name: 'Tags' });

test('builds a Modbus source and a variable with field errors, binds it to the tank, and round-trips', async ({ page }) => {
  await page.goto('/');
  await waitForCanvas(page);
  await page.getByRole('button', { name: 'Vertical Tank +' }).click();
  const tankId = (await sceneJson(page)).components[0].id;
  await page.getByRole('button', { name: 'Tags…' }).click();
  const tags = dialog(page);

  // A data source: credentials in the endpoint are refused beside the field.
  await tags.getByRole('button', { name: 'Add data source' }).click();
  await tags.getByLabel('Source ID').fill('plc');
  await tags.getByLabel('Endpoint reference').fill('modbus://admin:secret@10.0.0.5');
  await tags.getByRole('button', { name: 'Save data source' }).click();
  await expect(tags.getByLabel('Endpoint reference')).toHaveAttribute('aria-invalid', 'true');
  await expect(tags.getByRole('alert')).toBeVisible();
  expect((await sceneJson(page)).dataSources).toBeUndefined();
  await tags.getByLabel('Endpoint reference').fill('host:gateway-1/plc-01');
  await tags.getByRole('button', { name: 'Save data source' }).click();
  await expect(tags.getByRole('listitem', { name: 'Data source plc' })).toContainText('modbus-tcp');

  // A variable: the Modbus form appears for this source; an out-of-range register is refused beside it.
  await tags.getByRole('button', { name: 'Add variable' }).click();
  await tags.getByLabel('Tag ID').fill('LT-101');
  await tags.getByLabel('Component').selectOption(tankId);
  await tags.getByLabel('Unit', { exact: true }).fill('%');
  await tags.getByLabel('Source', { exact: true }).selectOption('plc');
  await tags.getByLabel('Register address').fill('70000');
  await tags.getByRole('button', { name: 'Save variable' }).click();
  await expect(tags.getByLabel('Register address')).toHaveAttribute('aria-invalid', 'true');
  await tags.getByLabel('Register address').fill('40');
  await tags.getByRole('button', { name: 'Save variable' }).click();
  await expect(tags.getByRole('listitem', { name: 'Variable LT-101' })).toContainText('from plc');
  await tags.getByRole('button', { name: 'Close tags' }).click();

  // Bind it to the tank's level: the field offers the scene's variables.
  await page.getByRole('button', { name: 'Vertical Tank 1' }).click();
  await expect(page.locator('#s3-variable-ids option')).toHaveAttribute('value', 'LT-101');
  await page.getByLabel('Tag for level').fill('LT-101');
  await page.getByLabel('Tag for level').press('Enter');
  const saved = await sceneJson(page);
  expect(saved.dataSources).toEqual([{ id: 'plc', protocol: 'modbus-tcp', endpointRef: 'host:gateway-1/plc-01' }]);
  expect(saved.runtimeVariables).toEqual([{ id: 'LT-101', componentId: tankId, dataType: 'float32', unit: '%', access: 'read', source: { dataSourceId: 'plc', address: { address: 40, area: 'holding', unitId: 1 } } }]);
  expect(saved.tagBindings).toEqual([{ id: expect.any(String), tagId: 'LT-101', kind: 'property', instanceId: tankId, property: 'level' }]);

  // Save and reload the same text: identical.
  const text = await page.getByLabel('Scene JSON').inputValue();
  await page.getByLabel('Import JSON text').fill(text);
  await page.getByRole('button', { name: 'Load text' }).click();
  await expect(page.getByLabel('Scene JSON')).toHaveValue(text);

  // A data source that a variable uses cannot be removed.
  await page.getByRole('button', { name: 'Tags…' }).click();
  await dialog(page).getByRole('listitem', { name: 'Data source plc' }).getByRole('button', { name: 'Remove' }).click();
  await expect(dialog(page).getByRole('alert')).toContainText('Cannot remove it');
  expect((await sceneJson(page)).dataSources).toHaveLength(1);
});

test('applies suggested tags as one undo step, and review findings lead to their targets', async ({ page }) => {
  await page.goto('/?control');
  await waitForCanvas(page);
  const before = (await sceneJson(page)).runtimeVariables.length;
  await page.getByRole('button', { name: 'Tags…' }).click();
  const suggested = dialog(page).getByRole('group', { name: 'Suggested tags' });
  await expect(suggested.getByRole('checkbox', { name: /VFD-101\.FAULT/ })).toBeChecked();
  const offered = await suggested.getByRole('checkbox').count();
  await suggested.getByRole('checkbox', { name: /PLC-01\.RUN/ }).uncheck();
  await suggested.getByRole('button', { name: `Add ${offered - 1} selected` }).click();
  expect((await sceneJson(page)).runtimeVariables).toHaveLength(before + offered - 1);
  await expect(dialog(page).getByRole('group', { name: 'Suggested tags' }).getByRole('checkbox')).toHaveCount(1);

  // Review: an unused variable can be edited from its finding; a component finding selects it.
  const findings = dialog(page).getByRole('list', { name: 'Review findings' });
  await expect(findings).toContainText('UNUSED_VARIABLE');
  await findings.getByRole('button', { name: 'Edit variable' }).first().click();
  await expect(dialog(page).getByRole('form', { name: /^Edit variable / })).toBeVisible();
  await dialog(page).getByRole('button', { name: 'Cancel' }).click();

  await page.keyboard.press('Escape');
  await expect(dialog(page)).toHaveCount(0);
  await page.getByRole('button', { name: 'Undo' }).click();
  expect((await sceneJson(page)).runtimeVariables).toHaveLength(before);
});

test('locked editing shows the tags read only', async ({ page }) => {
  await page.goto('/?control&locked');
  await waitForCanvas(page);
  await page.getByRole('button', { name: 'Tags…' }).click();
  await expect(dialog(page)).toContainText('Editing is locked');
  await expect(dialog(page).getByRole('listitem', { name: 'Variable LT-101.PV' })).toBeVisible();
  await expect(dialog(page).getByRole('button', { name: /^Add / })).toHaveCount(0);
  await expect(dialog(page).getByRole('button', { name: 'Edit' })).toHaveCount(0);
});
