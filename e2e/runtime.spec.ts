import { expect, test, type Page } from '@playwright/test';

// The locked runtime (ADR-0028, T-090) on the playground's `?runtime`.

const processView = (page: Page) => page.getByRole('group', { name: 'Process view' });
const symbol = (page: Page, id: string) => processView(page).locator(`[data-component-id="${id}"]`);
const info = (page: Page) => page.getByRole('complementary', { name: 'Information' });
/** The runtime has no editor layout for `waitForCanvas`; the 3D canvas being there is enough. */
const ready = async (page: Page) => {
  await expect(page.locator('canvas').first()).toBeVisible();
  await page.waitForTimeout(300);
};

test('shows the approved revision with live values, and offers no way to edit', async ({ page }) => {
  await page.goto('/?runtime&layout=split');
  await ready(page);
  await expect(page.getByLabel('Approved revision')).toHaveText('Demo line · revision 1 · digest verified · view only');

  // No editing controls at all.
  for (const name of ['Lock editing', 'Undo', 'Redo', 'Tags…', 'Vertical Tank +', 'Load text', 'Remove']) {
    await expect(page.getByRole('button', { name, exact: true })).toHaveCount(0);
  }
  await expect(page.getByLabel('Scene JSON')).toHaveCount(0);

  // Selecting shows values, ports and relations; keys and drags change nothing.
  await symbol(page, 'TK-101').click();
  await expect(info(page).getByRole('heading', { name: 'TK-101' })).toBeVisible();
  await expect(info(page).getByRole('list', { name: 'Live values' })).toContainText('level: 55 % · GOOD');
  await expect(info(page).getByRole('list', { name: 'Live values' })).toContainText('temperature: unknown (disconnected)');
  await page.keyboard.press('Delete');
  await page.keyboard.press('Control+z');
  await expect(symbol(page, 'TK-101')).toHaveCount(1);
  const b = (await symbol(page, 'P-101').boundingBox())!;
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
  await page.mouse.down();
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2 + 80, { steps: 5 });
  await page.mouse.up();
  await expect(symbol(page, 'P-101')).toHaveAttribute('data-placed', 'false');

  // Live values follow the feed. (Pressing the pump above selected it; back to the tank.)
  await symbol(page, 'TK-101').click();
  await page.getByLabel('Value LT-101.PV').fill('72');
  await expect(info(page).getByRole('list', { name: 'Live values' })).toContainText('level: 72 % · GOOD');

  // The panel's links move the selection.
  await info(page).getByRole('group', { name: 'Piped or coupled to' }).getByRole('button', { name: 'P-101' }).click();
  await expect(info(page).getByRole('heading', { name: 'P-101' })).toBeVisible();
  await expect(info(page).getByRole('group', { name: 'Control chain' }).getByRole('button')).toHaveText(['M-101', 'VFD-101', 'DO-01', 'AO-01', 'PLC-01', 'PSU-01']);
  await expect(symbol(page, 'P-101')).toHaveAttribute('aria-pressed', 'true');
});

test('switches between 3D and the 2D diagrams', async ({ page }) => {
  await page.goto('/?runtime');
  await ready(page);
  await expect(processView(page)).toHaveCount(0);
  await page.getByRole('button', { name: 'Electrical', exact: true }).click();
  await expect(page.getByRole('group', { name: 'Electrical view' })).toBeVisible();
  await expect(page.locator('canvas')).toHaveCount(0);
  await page.getByRole('button', { name: 'Split', exact: true }).click();
  await expect(processView(page)).toBeVisible();
  await expect(page.locator('canvas').first()).toBeVisible();
});

test('refuses a document that differs from the approved one, drawing nothing', async ({ page }) => {
  await page.goto('/?runtime=tampered');
  const refused = page.getByRole('alert', { name: 'Runtime refused' });
  await expect(refused).toContainText('its SHA-256 digest does not match');
  await expect(refused).toContainText('DIGEST_MISMATCH');
  await expect(page.locator('canvas')).toHaveCount(0);
});

test('refuses a revision other than the approved one', async ({ page }) => {
  await page.goto('/?runtime&revision=2');
  await expect(page.getByRole('alert', { name: 'Runtime refused' })).toContainText('Revision 2 was approved, but the document is revision 1.');
  await expect(page.locator('canvas')).toHaveCount(0);
});
