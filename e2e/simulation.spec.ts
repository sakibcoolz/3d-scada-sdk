import { expect, test, type Page } from '@playwright/test';
import { installThreeHook, renderedParts, waitForCanvas } from './helpers';

// Playground `?simulate`: the demo plant driven by @scada3d/simulation through the `simulation` prop (ADR-0010).
const liquid = async (page: Page) => (await renderedParts(page)).find((p) => p.componentId === 'tank' && p.role === 'liquid')!.scaleY;
const flowSummary = (page: Page) => page.getByLabel('Flow summary');

async function open(page: Page) {
  await installThreeHook(page);
  await page.goto('/?simulate');
  await waitForCanvas(page);
}

test('the demo plant drains through its open valves, labelled SIMULATED with the model', async ({ page }) => {
  await open(page);
  await expect(page.getByLabel('Simulation badge')).toHaveText('SIMULATED · mass-balance v1');
  await expect(page.getByLabel('Simulation', { exact: true })).toContainText('SIMULATED, not plant data');
  // No demo tag feed: the level and flow come from the simulator only.
  await expect(page.getByLabel('Telemetry summary')).toHaveCount(0);
  await expect(flowSummary(page)).toHaveText('Flow: 5 forward, 0 reverse, 0 stopped, 0 unknown');
  const start = await liquid(page);
  await expect.poll(() => liquid(page), { timeout: 10_000 }).toBeLessThan(start - 0.02);
  await expect(page.getByLabel('Simulation totals')).toContainText(/spilled [1-9]/);
});

test('closing the tank valve stops the drain and the flow', async ({ page }) => {
  await open(page);
  await page.getByRole('button', { name: /^Ball Valve 1/ }).click();
  await page.getByLabel('Valve open').uncheck();
  await expect(flowSummary(page)).toHaveText('Flow: 0 forward, 0 reverse, 5 stopped, 0 unknown');
  const held = await liquid(page);
  await page.waitForTimeout(1500);
  expect(await liquid(page)).toBeCloseTo(held, 6);
});

test('a feed larger than the drain fills the tank; reset restores the authored level', async ({ page }) => {
  await open(page);
  await page.getByRole('button', { name: /^Ball Valve 1/ }).click();
  await page.getByLabel('Valve open').uncheck();
  await page.getByLabel('Feed rate').fill('0.2');
  await page.getByLabel('Simulation speed').selectOption('60');
  const before = await liquid(page);
  await expect.poll(() => liquid(page), { timeout: 10_000 }).toBeGreaterThan(before + 0.05);
  await page.getByRole('button', { name: 'Pause' }).click();
  await page.getByRole('button', { name: 'Reset', exact: true }).click();
  await expect(page.getByLabel('Simulation time')).toHaveText('t = 0 s');
  await expect.poll(() => liquid(page)).toBeCloseTo(0.6, 1);
});

test('without ?simulate there is no simulation badge or panel', async ({ page }) => {
  await page.goto('/?demo');
  await waitForCanvas(page);
  await expect(page.getByLabel('Simulation badge')).toHaveCount(0);
  await expect(page.getByLabel('Simulation', { exact: true })).toHaveCount(0);
});
