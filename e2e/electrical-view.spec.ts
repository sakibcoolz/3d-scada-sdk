import { expect, test, type Page } from '@playwright/test';
import { waitForCanvas } from './helpers';

// The 2D electrical view (ADR-0026, T-085) on `?control&view=process,electrical`.

const electrical = (page: Page) => page.getByRole('group', { name: 'Electrical view' });
const processView = (page: Page) => page.getByRole('group', { name: 'Process view' });
const symbol = (view: ReturnType<typeof electrical>, id: string) => view.locator(`[data-component-id="${id}"]`);

test.beforeEach(async ({ page }) => {
  await page.goto('/?control&view=process,electrical');
  await waitForCanvas(page);
});

test('shows the wired equipment with every wire in its domain, and no process vessels', async ({ page }) => {
  const view = electrical(page);
  await expect(view.getByRole('button')).toHaveCount(12);
  await expect(symbol(view, 'TK-101')).toHaveCount(0);
  await expect(symbol(view, 'P-101')).toHaveCount(0);
  await expect(view.locator('[data-edge-domain="power"]')).toHaveCount(9);
  await expect(view.locator('[data-edge-domain="signal"]')).toHaveCount(7);
  await expect(view.locator('[data-edge-domain="network"]')).toHaveCount(2);
  await expect(view.locator('[data-edge-kind="association"]')).toHaveCount(1);
  // Terminal blocks carry their terminal labels.
  await expect(symbol(view, 'VFD-101')).toContainText('DI1');
  await expect(symbol(view, 'DI-01')).toContainText('DI7');
});

test('instruments appear in both views and share one selection', async ({ page }) => {
  await symbol(processView(page), 'LT-101').click();
  await expect(symbol(electrical(page), 'LT-101')).toHaveAttribute('aria-pressed', 'true');
  await symbol(electrical(page), 'VFD-101').click({ modifiers: ['Shift'] });
  await expect(symbol(processView(page), 'LT-101')).toHaveAttribute('aria-pressed', 'true');
  await expect(symbol(electrical(page), 'VFD-101')).toHaveAttribute('aria-pressed', 'true');
});

test('placing a symbol in one view leaves the other view as it was', async ({ page }) => {
  const inElectrical = symbol(electrical(page), 'LT-101');
  const inProcess = symbol(processView(page), 'LT-101');
  const processBefore = [await inProcess.getAttribute('data-x'), await inProcess.getAttribute('data-y')];
  const b = (await inElectrical.boundingBox())!;
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
  await page.mouse.down();
  await page.mouse.move(b.x + b.width / 2 + 40, b.y + b.height / 2 + 30, { steps: 5 });
  await page.mouse.up();
  await expect(inElectrical).toHaveAttribute('data-placed', 'true');
  await expect(inProcess).toHaveAttribute('data-placed', 'false');
  expect([await inProcess.getAttribute('data-x'), await inProcess.getAttribute('data-y')]).toEqual(processBefore);
});
