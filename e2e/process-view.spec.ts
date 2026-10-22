import { expect, test, type Page } from '@playwright/test';
import { waitForCanvas } from './helpers';

// The 2D process view (ADR-0026, T-084) on the playground's `?control&view=process`.

const view = (page: Page) => page.getByRole('group', { name: 'Process view' });
const symbol = (page: Page, id: string) => view(page).locator(`[data-component-id="${id}"]`);

test.beforeEach(async ({ page }) => {
  await page.goto('/?control&view=process');
  await waitForCanvas(page);
});

test('shows the process equipment and lines, not the control panel', async ({ page }) => {
  await expect(view(page).getByRole('button')).toHaveCount(5);
  for (const name of ['TK-101 (unplaced)', 'P-101 (unplaced)', 'M-101 (unplaced)', 'LT-101 (unplaced)', 'LSH-101 (unplaced)']) {
    await expect(view(page).getByRole('button', { name })).toBeVisible();
  }
  await expect(symbol(page, 'PLC-01')).toHaveCount(0);
  await expect(view(page).locator('[data-edge-kind="connection"]')).toHaveCount(1);
  await expect(view(page).locator('[data-edge-kind="association"]')).toHaveCount(3);
});

test('shows live values, with the disconnected tag as unknown', async ({ page }) => {
  await expect(symbol(page, 'TK-101')).toContainText('level: 55 % · GOOD');
  await expect(symbol(page, 'TK-101')).toContainText('temperature: unknown (disconnected)');
  await page.getByLabel('Value LT-101.PV').fill('70');
  await expect(symbol(page, 'TK-101')).toContainText('level: 70 % · GOOD');
});

test('selects by click, Shift-click and keyboard, and clears on the background', async ({ page }) => {
  await symbol(page, 'TK-101').click();
  await expect(symbol(page, 'TK-101')).toHaveAttribute('aria-pressed', 'true');
  await symbol(page, 'P-101').click({ modifiers: ['Shift'] });
  await expect(symbol(page, 'TK-101')).toHaveAttribute('aria-pressed', 'true');
  await expect(symbol(page, 'P-101')).toHaveAttribute('aria-pressed', 'true');
  await symbol(page, 'M-101').focus();
  await page.keyboard.press('Enter');
  await expect(symbol(page, 'M-101')).toHaveAttribute('aria-pressed', 'true');
  await expect(symbol(page, 'TK-101')).toHaveAttribute('aria-pressed', 'false');
  const box = (await view(page).boundingBox())!;
  await page.mouse.click(box.x + 10, box.y + box.height - 10);
  await expect(view(page).locator('[aria-pressed="true"]')).toHaveCount(0);
});

test('dragging a symbol places it on the grid and its line follows', async ({ page }) => {
  const pump = symbol(page, 'P-101');
  const before = Number(await pump.getAttribute('data-y'));
  const pipe = view(page).locator('[data-edge-id="tank-pump"]');
  const pipeBefore = await pipe.getAttribute('points');
  const b = (await pump.boundingBox())!;
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
  await page.mouse.down();
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2 + 60, { steps: 5 });
  await page.mouse.up();
  await expect(pump).toHaveAttribute('data-placed', 'true');
  await expect(view(page).getByRole('button', { name: 'P-101', exact: true })).toBeVisible();
  const after = Number(await pump.getAttribute('data-y'));
  expect(after).toBeGreaterThan(before);
  expect(after % 10).toBe(0);
  expect(await pipe.getAttribute('points')).not.toBe(pipeBefore);
  // A drag is not a click: the selection did not change.
  await expect(pump).toHaveAttribute('aria-pressed', 'false');
});

test('zooms with the buttons and the wheel, pans by dragging the background, and fits again', async ({ page }) => {
  const svg = view(page);
  const fitted = await svg.getAttribute('viewBox');
  await page.getByRole('button', { name: 'Zoom in Process view' }).click();
  const zoomed = (await svg.getAttribute('viewBox'))!.split(' ').map(Number);
  expect(zoomed[2]).toBeLessThan(Number(fitted!.split(' ')[2]));
  const box = (await svg.boundingBox())!;
  await page.mouse.move(box.x + 20, box.y + box.height - 20);
  await page.mouse.wheel(0, 200);
  expect((await svg.getAttribute('viewBox'))!.split(' ').map(Number)[2]).toBeGreaterThan(zoomed[2]);
  await page.mouse.down();
  await page.mouse.move(box.x + 120, box.y + box.height - 20, { steps: 4 });
  await page.mouse.up();
  expect((await svg.getAttribute('viewBox'))!.split(' ').map(Number)[0]).not.toBe(zoomed[0]);
  await page.getByRole('button', { name: 'Fit Process view' }).click();
  await expect(svg).toHaveAttribute('viewBox', fitted!);
});
