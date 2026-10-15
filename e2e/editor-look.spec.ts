import { expect, test, type Locator, type Page } from '@playwright/test';
import { sceneJson, waitForCanvas } from './helpers';

/** WCAG contrast ratio between an element's text colour and the first opaque background behind it. */
async function contrast(locator: Locator): Promise<number> {
  return locator.evaluate((el) => {
    const rgb = (c: string) => (c.match(/[\d.]+/g) ?? []).map(Number);
    const luminance = ([r, g, b]: number[]) => {
      const f = (v: number) => ((v /= 255) <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
      return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
    };
    let node: Element | null = el;
    let background = [255, 255, 255];
    while (node) {
      const c = rgb(getComputedStyle(node).backgroundColor);
      if (c.length === 3 || (c.length === 4 && c[3] === 1)) { background = c.slice(0, 3); break; }
      node = node.parentElement;
    }
    const [a, b] = [luminance(rgb(getComputedStyle(el).color)), luminance(background)];
    return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
  });
}

const background = (l: Locator) => l.evaluate((el) => getComputedStyle(el).backgroundColor);

async function demo(page: Page) {
  await page.goto('/?demo');
  await waitForCanvas(page);
}

test('positions are shown to the millimetre and can still be typed', async ({ page }) => {
  await demo(page);
  await page.getByRole('button', { name: /^Ball Valve 1/ }).click();
  await expect(page.getByLabel('Y', { exact: true })).toHaveValue('0.635');
  expect((await sceneJson(page)).components.find((c: { id: string }) => c.id === 'valve').position.y).not.toBe(0.635);
  await page.getByLabel('X', { exact: true }).fill('2.5');
  expect((await sceneJson(page)).components.find((c: { id: string }) => c.id === 'valve').position.x).toBe(2.5);
});

test('disabled buttons stay readable', async ({ page }) => {
  await page.goto('/');
  await waitForCanvas(page);
  for (const name of ['Undo', 'Redo', 'Paste (0)', 'Load text']) {
    const button = page.getByRole('button', { name, exact: true });
    await expect(button).toBeDisabled();
    expect(await contrast(button), name).toBeGreaterThanOrEqual(4.5);
  }
  expect(await contrast(page.getByRole('button', { name: /^Connect touching ports/ }))).toBeGreaterThanOrEqual(4.5);
});

test('the active tool and the destructive action look different', async ({ page }) => {
  await demo(page);
  const [move, rotate] = [page.getByRole('button', { name: 'Move' }), page.getByRole('button', { name: 'Rotate' })];
  await expect(move).toHaveAttribute('aria-pressed', 'true');
  expect(await background(move)).not.toBe(await background(rotate));
  await rotate.click();
  expect(await background(rotate)).not.toBe(await background(move));

  await page.getByRole('button', { name: /^Ball Valve 1/ }).click();
  const remove = page.getByRole('button', { name: 'Remove' });
  const copy = page.getByRole('button', { name: 'Copy component' });
  const color = (l: Locator) => l.evaluate((el) => getComputedStyle(el).color);
  expect(await color(remove)).not.toBe(await color(copy));
  const [r, g, b] = ((await color(remove)).match(/\d+/g) ?? []).map(Number);
  expect(r).toBeGreaterThan(g);
  expect(r).toBeGreaterThan(b);
});

test('properties are grouped in sections that fold away', async ({ page }) => {
  await demo(page);
  await page.getByRole('button', { name: /^Ball Valve 1/ }).click();
  const panel = page.locator('aside').nth(1);
  await expect(panel.locator('summary')).toHaveText(['Transform', 'Settings', 'Connections', 'Tag bindings', 'View', 'Actions']);
  await panel.locator('summary', { hasText: 'Transform' }).click();
  await expect(page.getByLabel('X', { exact: true })).toBeHidden();
  await panel.locator('summary', { hasText: 'Transform' }).click();
  await expect(page.getByLabel('X', { exact: true })).toBeVisible();
  // Folding is remembered while moving between components.
  await panel.locator('summary', { hasText: 'Tag bindings' }).click();
  await page.getByRole('button', { name: /^Vertical Tank 1/ }).click();
  await expect(page.getByLabel('Tag for level')).toBeHidden();
});

test('the scene file lives in the left panel, not under the properties', async ({ page }) => {
  await demo(page);
  const left = page.locator('aside').first();
  const right = page.locator('aside').nth(1);
  await expect(left.getByLabel('Scene JSON')).toBeVisible();
  await expect(left.getByRole('button', { name: 'Export JSON' })).toBeVisible();
  await expect(right.getByLabel('Scene JSON')).toHaveCount(0);
});
