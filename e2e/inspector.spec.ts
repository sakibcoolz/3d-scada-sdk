import { expect, test } from '@playwright/test';
import { waitForCanvas } from './helpers';

// Port inspector and relationship explorer (ADR-0027, T-087) on the `?control` demo.

test.beforeEach(async ({ page }) => {
  await page.goto('/?control');
  await waitForCanvas(page);
});

test('the drive’s ports show terminals, ratings, usage and what they join, and lead to the motor', async ({ page }) => {
  await page.getByRole('button', { name: 'Variable-Frequency Drive 1' }).click();
  const ports = page.getByRole('list', { name: 'Ports' });
  const out = ports.getByRole('listitem', { name: 'Port U-V-W' });
  await expect(out).toContainText('Motor out');
  await expect(out).toContainText('U V W');
  await expect(out).toContainText('AC 400 V 3-phase out');
  await expect(out.getByLabel('Usage of U-V-W')).toHaveText('1/1');
  await expect(ports.getByRole('listitem', { name: 'Port L1-L3' }).getByLabel('Usage of L1-L3')).toHaveText('0/1');
  await expect(ports.getByRole('listitem', { name: 'Port speedRef' })).toContainText('AI 4–20 mA');

  await out.getByRole('button', { name: 'M-101 · terminals (U V W)' }).click();
  await expect(page.getByRole('heading', { name: 'AC Induction Motor' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'AC Induction Motor 1' })).toHaveAttribute('aria-pressed', 'true');
});

test('the pump’s relations and control chain come from explicit edges, and stay readable while locked', async ({ page }) => {
  await page.getByRole('button', { name: 'Lock editing' }).click();
  await page.getByRole('button', { name: 'Centrifugal Pump 1' }).click();
  await expect(page.getByRole('group', { name: 'Piped or coupled to' })).toContainText('TK-101');
  await expect(page.getByRole('group', { name: 'Driven by' })).toContainText('M-101');
  const chain = page.getByRole('group', { name: 'Control chain' }).getByRole('button');
  await expect(chain).toHaveText(['M-101', 'VFD-101', 'DO-01', 'AO-01', 'PLC-01', 'PSU-01']);

  await page.getByRole('group', { name: 'Control chain' }).getByRole('button', { name: 'PLC-01' }).click();
  await expect(page.getByRole('heading', { name: 'PLC Controller' })).toBeVisible();
  await expect(page.getByRole('group', { name: 'Controls' })).toContainText('VFD-101');
  await expect(page.getByRole('group', { name: 'Network' })).toContainText('SW-01');
});
