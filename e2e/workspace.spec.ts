import { expect, test, type Page } from '@playwright/test';
import { sceneJson, waitForCanvas } from './helpers';

// <ScadaWorkspace> (ADR-0026, T-086): the 3D editor and the 2D diagrams over one scene, one selection
// and one undo history, on the playground's `?control&layout=split`.

const processView = (page: Page) => page.getByRole('group', { name: 'Process view' });
const symbol = (page: Page, id: string) => processView(page).locator(`[data-component-id="${id}"]`);

async function drag(page: Page, id: string, dx: number, dy: number) {
  const b = (await symbol(page, id).boundingBox())!;
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
  await page.mouse.down();
  await page.mouse.move(b.x + b.width / 2 + dx, b.y + b.height / 2 + dy, { steps: 5 });
  await page.mouse.up();
}

test.describe('split workspace', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/?control&layout=split');
    await waitForCanvas(page);
  });

  test('selecting in 2D selects in 3D, and the other way round', async ({ page }) => {
    await symbol(page, 'P-101').click();
    await expect(page.getByRole('heading', { name: 'Centrifugal Pump' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Centrifugal Pump 1' })).toHaveAttribute('aria-pressed', 'true');

    await page.getByRole('button', { name: 'Vertical Tank 1' }).click();
    await expect(symbol(page, 'TK-101')).toHaveAttribute('aria-pressed', 'true');
    await expect(symbol(page, 'P-101')).toHaveAttribute('aria-pressed', 'false');

    await page.keyboard.press('Escape');
    await expect(processView(page).locator('[aria-pressed="true"]')).toHaveCount(0);
  });

  test('a symbol dragged in 2D is saved in the scene, undoes and redoes in the editor, and round-trips', async ({ page }) => {
    expect((await sceneJson(page)).views).toBeUndefined();
    await drag(page, 'P-101', 0, 60);
    await expect(symbol(page, 'P-101')).toHaveAttribute('data-placed', 'true');
    const placed = (await sceneJson(page)).views.process.symbols['P-101'];
    expect(placed.y).toBe(Number(await symbol(page, 'P-101').getAttribute('data-y')));

    await page.getByRole('button', { name: 'Undo' }).click();
    await expect(symbol(page, 'P-101')).toHaveAttribute('data-placed', 'false');
    expect((await sceneJson(page)).views).toBeUndefined();
    await page.getByRole('button', { name: 'Redo' }).click();
    await expect(symbol(page, 'P-101')).toHaveAttribute('data-placed', 'true');

    // Export and import the same text: the layout comes back with the scene.
    const saved = await page.getByLabel('Scene JSON').inputValue();
    await page.getByLabel('Import JSON text').fill(saved);
    await page.getByRole('button', { name: 'Load text' }).click();
    await expect(page.getByText('Loaded 14 components and 19 connections.')).toBeVisible();
    await expect(page.getByLabel('Scene JSON')).toHaveValue(saved);
    await expect(symbol(page, 'P-101')).toHaveAttribute('data-y', String(placed.y));
  });

  test('deleting a component in 3D removes it from the diagram and its saved place', async ({ page }) => {
    await drag(page, 'LSH-101', 40, 0);
    expect((await sceneJson(page)).views.process.symbols['LSH-101']).toBeDefined();
    await symbol(page, 'LSH-101').click();
    await page.getByRole('button', { name: 'Digital Sensor (Switch) 1' }).press('Delete');
    await expect(symbol(page, 'LSH-101')).toHaveCount(0);
    expect((await sceneJson(page)).views).toBeUndefined();
  });

  test('locking the editor locks the diagrams too', async ({ page }) => {
    await page.getByRole('button', { name: 'Lock editing' }).click();
    const before = await symbol(page, 'P-101').getAttribute('data-y');
    await drag(page, 'P-101', 0, 60);
    await expect(symbol(page, 'P-101')).toHaveAttribute('data-placed', 'false');
    expect(await symbol(page, 'P-101').getAttribute('data-y')).toBe(before);
    expect((await sceneJson(page)).views).toBeUndefined();
  });

  test('switches layouts without losing the scene or its history', async ({ page }) => {
    await drag(page, 'P-101', 0, 60);
    await page.getByRole('button', { name: 'Electrical', exact: true }).click();
    await expect(page.getByRole('group', { name: 'Electrical view' })).toBeVisible();
    await expect(processView(page)).toHaveCount(0);
    await page.getByRole('button', { name: '3D', exact: true }).click();
    await expect(page.getByRole('group', { name: 'Electrical view' })).toHaveCount(0);
    await page.getByRole('button', { name: 'Undo' }).click();
    await page.getByRole('button', { name: 'Process', exact: true }).click();
    await expect(symbol(page, 'P-101')).toHaveAttribute('data-placed', 'false');
  });
});

test('names are drawn as text in the diagrams, never as markup', async ({ page }) => {
  await page.goto('/?layout=split');
  await waitForCanvas(page);
  const doc = {
    schemaVersion: 4,
    documentType: 'industrial.scene',
    units: 'm',
    components: [{ id: 'T1', name: '<img src=x onerror="window.__pwned=1">', type: 'tank', position: { x: 0, y: 1.535, z: 0 }, rotation: { x: 0, y: 0, z: 0, w: 1 }, scale: { x: 1, y: 1, z: 1 }, properties: {} }],
    connections: [],
  };
  await page.getByLabel('Import JSON text').fill(JSON.stringify(doc));
  await page.getByRole('button', { name: 'Load text' }).click();
  await expect(symbol(page, 'T1')).toContainText('<img src=x onerror="window.__pwned=1">');
  await expect(processView(page).locator('img')).toHaveCount(0);
  expect(await page.evaluate(() => (window as unknown as { __pwned?: number }).__pwned)).toBeUndefined();
});

test('a 1,000-component process view renders within the 500 ms budget', async ({ page }) => {
  await page.goto('/?generate=1000&layout=3d');
  // The 1,000-part 3D scene can take a while to settle under load; only the toolbar is needed here.
  await expect(page.getByRole('button', { name: 'Process', exact: true })).toBeVisible({ timeout: 30_000 });
  // From the click to all 1,000 symbols in the DOM (React commits after the handler returns).
  const ms = await page.evaluate(async () => {
    const button = Array.from(document.querySelectorAll('button')).find((b) => b.textContent === 'Process')!;
    const symbols = () => document.querySelectorAll('[aria-label="Process view"] [data-component-id]').length;
    const start = performance.now();
    button.click();
    while (symbols() < 1000 && performance.now() - start < 10_000) await new Promise((r) => setTimeout(r, 0));
    return { ms: performance.now() - start, count: symbols() };
  });
  console.log(`process view, 1000 components: ${ms.ms.toFixed(0)} ms`);
  expect(ms.count).toBe(1000);
  expect(ms.ms).toBeLessThan(500);
});
