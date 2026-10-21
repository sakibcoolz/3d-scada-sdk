import { expect, test, type Page } from '@playwright/test';
import { installThreeHook, renderedParts, sceneJson, waitForCanvas } from './helpers';

async function partsOf(page: Page, componentId: string, role: string) {
  return (await renderedParts(page)).filter((p) => p.componentId === componentId && p.role === role);
}

test.beforeEach(async ({ page }) => {
  await installThreeHook(page);
  await page.goto('/');
  await waitForCanvas(page);
});

test('view modes change shell drawing but never the saved scene', async ({ page }) => {
  await page.getByRole('button', { name: 'Vertical Tank +' }).click();
  const tank = (await sceneJson(page)).components[0].id;
  const saved = await page.getByLabel('Scene JSON').inputValue();
  const viewMode = page.getByLabel('View mode', { exact: true });

  const shells = async () => partsOf(page, tank, 'shell');
  // Five body parts plus the stand's four legs, four feet and eight cross braces.
  await expect.poll(async () => (await shells()).map((p) => p.opacity)).toEqual(Array(21).fill(1));

  await viewMode.selectOption('glass');
  await expect.poll(async () => (await shells()).every((p) => p.transparent && p.opacity === 0.21)).toBe(true);

  await viewMode.selectOption('xray');
  await expect.poll(async () => (await shells()).every((p) => p.opacity === 0.06)).toBe(true);
  await expect.poll(async () => (await partsOf(page, tank, 'edges')).length).toBe(21);

  await viewMode.selectOption('cutaway');
  await expect.poll(async () => (await shells()).every((p) => p.clippingPlanes === 1 && p.opacity === 1)).toBe(true);
  // The liquid (and the gauge's liquid column) stays whole inside the cut shell.
  await expect.poll(async () => (await partsOf(page, tank, 'liquid')).map((p) => p.clippingPlanes)).toEqual([0, 0]);

  await expect(page.getByLabel('Scene JSON')).toHaveValue(saved);
});

test('a per-component view applies only to that component and is not saved', async ({ page }) => {
  await page.getByRole('button', { name: 'Vertical Tank +' }).click();
  await page.getByRole('button', { name: 'Vertical Tank +' }).click();
  const [first, second] = (await sceneJson(page)).components.map((c: { id: string }) => c.id);
  const saved = await page.getByLabel('Scene JSON').inputValue();

  // The second tank is selected after adding it.
  await page.getByLabel('Component view').selectOption('glass');
  await expect.poll(async () => (await partsOf(page, second, 'shell')).every((p) => p.opacity === 0.21)).toBe(true);
  await expect.poll(async () => (await partsOf(page, first, 'shell')).every((p) => p.opacity === 1)).toBe(true);
  await expect(page.getByLabel('Scene JSON')).toHaveValue(saved);

  await page.getByLabel('Component view').selectOption('');
  await expect.poll(async () => (await partsOf(page, second, 'shell')).every((p) => p.opacity === 1)).toBe(true);
});

test('liquid follows level, hides at zero, and clamps an imported out-of-range level', async ({ page }) => {
  await page.getByRole('button', { name: 'Vertical Tank +' }).click();
  const tank = (await sceneJson(page)).components[0].id;
  const liquid = async () => (await partsOf(page, tank, 'liquid'))[0];

  await page.getByLabel('Liquid level %').fill('100');
  await expect.poll(async () => (await liquid()).scaleY).toBe(1);
  await page.getByLabel('Liquid level %').fill('0');
  await expect.poll(async () => (await liquid()).visible).toBe(false);

  const scene = await sceneJson(page);
  scene.components[0].properties.level = 130;
  await page.getByLabel('Import JSON text').fill(JSON.stringify(scene));
  await page.getByRole('button', { name: 'Load text' }).click();
  await expect.poll(async () => (await liquid()).scaleY).toBe(1);
  await expect(page.getByText('Loaded 1 component and 0 connections.')).toBeVisible();
});

test('temperature tints the liquid with a display-only legend', async ({ page }) => {
  await page.getByRole('button', { name: 'Vertical Tank +' }).click();
  const tank = (await sceneJson(page)).components[0].id;
  const liquidColor = async () => (await partsOf(page, tank, 'liquid'))[0].color;
  const defaultColor = await liquidColor();
  await expect(page.getByText(/Temperature tint/)).toHaveCount(0);

  await page.getByLabel('Temperature °C').fill('100');
  await expect.poll(liquidColor).toBe('#ff3333');
  await expect(page.getByText('Temperature tint 0–100 °C (display only, not simulated)')).toBeVisible();
  expect((await sceneJson(page)).components[0].properties.temperature).toBe(100);

  await page.getByLabel('Temperature °C').fill('');
  await expect.poll(liquidColor).toBe(defaultColor);
  expect((await sceneJson(page)).components[0].properties.temperature).toBeUndefined();
  await expect(page.getByText(/Temperature tint/)).toHaveCount(0);
});
