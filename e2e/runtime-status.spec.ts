import { expect, test, type Page } from '@playwright/test';
import { installThreeHook } from './helpers';

// Alarms and status per component in the locked runtime (ADR-0028 §3–4, T-091), on `?runtime` with
// the playground's demo host alarms: LAH-101 (high, on tag LT-101.PV), VIB-101 (P-101, inactive) and
// ZS-999 (on XV-999, which is not in the scene). TT-101 arrives DISCONNECTED.

const processView = (page: Page) => page.getByRole('group', { name: 'Process view' });
const symbol = (page: Page, id: string) => processView(page).locator(`[data-component-id="${id}"]`);
const attention = (page: Page) => page.getByRole('list', { name: 'Needs attention' });
const ready = async (page: Page) => {
  await expect(page.locator('canvas').first()).toBeVisible();
  await page.waitForTimeout(300);
};

type Marker = { componentId: string; severity?: string; status: string; blinking: boolean; color: string };
/** The 3D status rings, from the userData the viewer tags them with. */
async function markers(page: Page): Promise<Marker[]> {
  return page.evaluate(() => {
    const found: Marker[] = [];
    type Node = { userData: Record<string, any>; material?: { color: { getHexString(): string } }; traverse(f: (o: Node) => void): void };
    for (const scene of (window as unknown as { __scenes: Node[] }).__scenes)
      scene.traverse((o) => {
        if (o.userData?.role === 'status-marker') found.push({ componentId: o.userData.componentId, severity: o.userData.severity, status: o.userData.status, blinking: o.userData.blinking, color: `#${o.material!.color.getHexString()}` });
      });
    return found.sort((a, b) => a.componentId.localeCompare(b.componentId));
  });
}

test.beforeEach(async ({ page }) => {
  await installThreeHook(page);
});

test('an alarm marks its components in 3D and 2D and leads the Attention list; an unlinked alarm is still listed', async ({ page }) => {
  await page.goto('/?runtime&layout=split');
  await ready(page);
  // The tag alarm reaches the tank (bound level) and the transmitter (the variable's component).
  for (const id of ['TK-101', 'LT-101']) {
    await expect(symbol(page, id)).toHaveAttribute('data-status', 'alarm');
    await expect(symbol(page, id).locator('[data-role="alarm-badge"]')).toHaveAttribute('data-severity', 'high');
    await expect(symbol(page, id).locator('[data-role="alarm-badge"]')).toContainText('!H');
  }
  await expect(symbol(page, 'TK-101')).toHaveAttribute('aria-label', /high alarm, unacknowledged/);
  await expect(symbol(page, 'P-101')).not.toHaveAttribute('data-status', 'alarm');
  await expect.poll(async () => (await markers(page)).filter((m) => m.status === 'alarm')).toEqual([
    { componentId: 'LT-101', severity: 'high', status: 'alarm', blinking: true, color: '#f76b15' },
    { componentId: 'TK-101', severity: 'high', status: 'alarm', blinking: true, color: '#f76b15' },
  ]);

  await expect(attention(page).getByRole('button').first()).toHaveText(/^(TK|LT)-101: HIGH alarm, Tank level high · unacknowledged$/);
  await expect(page.getByRole('list', { name: 'Alarms not linked to equipment' })).toContainText('ZS-999: LOW · Spare valve position mismatch · acknowledged (component XV-999)');
  await expect(page.getByLabel('Status summary')).toHaveText('Alarms: 2 high (2 unacknowledged) · 1 not linked to equipment');

  // The list selects; the panel shows the alarm as the host gave it.
  await attention(page).getByRole('button', { name: /^TK-101/ }).click();
  await expect(symbol(page, 'TK-101')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByRole('list', { name: 'Active alarms' })).toHaveText('HIGH · Tank level high · since 2026-10-23T08:00:00Z · unacknowledged');

  // Raising another alarm on the pump adds it; the host's severity change is followed.
  await page.getByLabel('Alarm VIB-101 active').check();
  await page.getByLabel('Alarm VIB-101 severity').selectOption('critical');
  await expect(symbol(page, 'P-101').locator('[data-role="alarm-badge"]')).toHaveAttribute('data-severity', 'critical');
  await expect(attention(page).getByRole('button').first()).toHaveText('P-101: CRITICAL alarm, Pump vibration · unacknowledged');
});

test('a disconnected tag gives unknown once no alarm outranks it', async ({ page }) => {
  await page.goto('/?runtime&layout=split');
  await ready(page);
  await page.getByLabel('Alarm LAH-101 active').uncheck();
  await expect(symbol(page, 'TK-101')).toHaveAttribute('data-status', 'unknown');
  await expect(symbol(page, 'TK-101').locator('[data-role="unknown-outline"]')).toHaveCount(1);
  await expect(symbol(page, 'TK-101')).toHaveAttribute('aria-label', /unknown value/);
  await expect(attention(page).getByRole('button')).toHaveText(['TK-101: unknown temperature (disconnected)']);
  await expect(page.getByLabel('Status summary')).toHaveText('No alarms · 1 unknown · 1 not linked to equipment');
  await expect.poll(async () => (await markers(page)).map((m) => [m.componentId, m.status, m.blinking, m.color])).toEqual([['TK-101', 'unknown', false, '#8a96a3']]);

  // A good reading clears it.
  await page.getByLabel('Quality TT-101').selectOption('GOOD');
  await expect(symbol(page, 'TK-101')).toHaveAttribute('data-status', 'ok');
  await expect(attention(page).getByRole('button')).toHaveCount(0);
  await expect(page.getByLabel('Status summary')).toHaveText('No alarms · 1 not linked to equipment');
  // Once the host clears the unlinked alarm too, nothing is left.
  await page.getByLabel('Alarm ZS-999 active').uncheck();
  await expect(page.getByText('Nothing needs attention.')).toBeVisible();
  await expect(page.getByLabel('Status summary')).toHaveText('No alarms');
});

test('acknowledging stops the blink, and reduced motion never blinks', async ({ page }) => {
  await page.goto('/?runtime&layout=split');
  await ready(page);
  await expect.poll(async () => (await markers(page)).find((m) => m.componentId === 'TK-101')?.blinking).toBe(true);
  await page.getByLabel('Alarm LAH-101 acknowledged').check();
  await expect.poll(async () => (await markers(page)).find((m) => m.componentId === 'TK-101')?.blinking).toBe(false);
  await expect(symbol(page, 'TK-101').locator('[data-role="alarm-badge"]')).toHaveAttribute('data-unacknowledged', 'false');
  await expect(page.getByLabel('Status summary')).toHaveText('Alarms: 2 high · 1 not linked to equipment');

  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.getByLabel('Alarm LAH-101 acknowledged').uncheck();
  await expect(page.getByLabel('Status summary')).toHaveText('Alarms: 2 high (2 unacknowledged) · 1 not linked to equipment');
  await expect.poll(async () => (await markers(page)).filter((m) => m.status === 'alarm').map((m) => m.blinking)).toEqual([false, false]);
});

test('simulated values are labelled and never clear an unknown status', async ({ page }) => {
  await page.goto('/?runtime&layout=split');
  await ready(page);
  await page.getByLabel('Flow source').selectOption('SIMULATED');
  await expect(page.getByLabel('Simulated values')).toHaveText('SIMULATED values, not plant data');
  await page.getByLabel('Alarm LAH-101 active').uncheck();
  await symbol(page, 'TK-101').click();
  await expect(page.getByRole('list', { name: 'Live values' })).toContainText('level: 55 % · GOOD · SIMULATED');
  await expect(attention(page).getByRole('button')).toHaveText(['TK-101: unknown temperature (disconnected) · SIMULATED values']);
});
