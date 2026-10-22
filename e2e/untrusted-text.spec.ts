import { expect, test } from '@playwright/test';
import { sceneJson, waitForCanvas } from './helpers';

// Scene files and host tags are untrusted. Markup in ids, labels or tag names must be shown as text.
const payload = '<img src=x onerror="window.__xss=1">';

test('markup in imported ids, properties and tags is displayed as text, never executed', async ({ page }) => {
  const dialogs: string[] = [];
  page.on('dialog', (dialog) => {
    dialogs.push(dialog.message());
    void dialog.dismiss();
  });
  await page.goto('/');
  await waitForCanvas(page);

  // An invalid reference puts the hostile id into the error list.
  const broken = {
    schemaVersion: 4,
    documentType: 'industrial.scene',
    units: 'm',
    components: [{ id: payload, type: 'tank', position: { x: 0, y: 1.535, z: 0 }, rotation: { x: 0, y: 0, z: 0, w: 1 }, scale: { x: 1, y: 1, z: 1 }, properties: { label: '<script>window.__xss=2</script>' } }],
    connections: [{ id: 'e', from: { instanceId: payload, portId: 'outlet' }, to: { instanceId: '<b>ghost</b>', portId: 'in' } }],
  };
  await page.getByLabel('Import JSON text').fill(JSON.stringify(broken));
  await page.getByRole('button', { name: 'Load text' }).click();
  const alert = page.getByRole('alert');
  await expect(alert).toContainText('No component "<b>ghost</b>"');
  expect(await alert.locator('img, script, b').count()).toBe(0);

  // A valid scene with hostile ids and a hostile tag binding loads and shows them literally.
  const valid = {
    ...broken,
    connections: [],
    tagBindings: [{ id: '<i>b</i>', tagId: '<svg onload="window.__xss=3">', kind: 'property', instanceId: payload, property: 'level' }],
  };
  await page.getByLabel('Import JSON text').fill(JSON.stringify(valid));
  await page.getByRole('button', { name: 'Load text' }).click();
  await expect(page.getByText('Loaded 1 component and 0 connections.')).toBeVisible();
  expect((await sceneJson(page)).components[0].id).toBe(payload);
  await expect(page.getByLabel('Scene JSON')).toHaveValue(/onerror/);

  await page.waitForTimeout(300);
  expect(await page.evaluate(() => (window as unknown as { __xss?: number }).__xss)).toBeUndefined();
  expect(await page.locator('body img, body svg[onload]').count()).toBe(0);
  expect(dialogs).toEqual([]);
});
