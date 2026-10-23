import { expect, test, type Page } from '@playwright/test';

// Command requests in the locked runtime (ADR-0029, T-093), on `?runtime` with the playground's
// host-side request log. VFD-101 has a speed setpoint (0–1500 rpm, step 10) and a run command.

const vfd = (page: Page) => page.getByRole('group', { name: 'Electrical view' }).locator('[data-component-id="VFD-101"]');
const info = (page: Page) => page.getByRole('complementary', { name: 'Information' });
const requestButton = (page: Page, name: string) => info(page).getByRole('button', { name: `Request change to ${name}` });
const received = (page: Page) => page.getByRole('list', { name: 'Received requests' }).getByRole('listitem');
async function open(page: Page, query = '') {
  await page.goto(`/?runtime&layout=electrical${query}`);
  await vfd(page).click();
  await expect(info(page).getByRole('heading', { name: 'VFD-101' })).toBeVisible();
}

test('no command control without the host callback or without a digest pin', async ({ page }) => {
  await open(page, '&commands=off');
  await expect(info(page).getByRole('region', { name: 'Commands' })).toHaveCount(0);
  await expect(info(page).getByRole('button', { name: /Request change/ })).toHaveCount(0);
  await open(page, '&pin=revision');
  await expect(page.getByLabel('Approved revision')).toHaveText('Demo line · revision 1 · view only');
  await expect(info(page).getByRole('button', { name: /Request change/ })).toHaveCount(0);
});

test('out-of-range and off-step values are refused, and cancel sends nothing', async ({ page }) => {
  await open(page);
  await expect(info(page).getByRole('list', { name: 'Writable variables' })).toContainText('Speed setpoint: 1200 rpm · GOOD');
  await requestButton(page, 'Speed setpoint').click();
  const dialog = page.getByRole('dialog', { name: 'Request change' });
  await expect(dialog).toContainText('0 to 1500 rpm, in steps of 10');
  await dialog.getByLabel('New value').fill('1600');
  await dialog.getByRole('button', { name: 'Review' }).click();
  await expect(dialog.getByRole('alert')).toHaveText('Enter a value from 0 to 1500.');
  await dialog.getByLabel('New value').fill('1305');
  await dialog.getByRole('button', { name: 'Review' }).click();
  await expect(dialog.getByRole('alert')).toHaveText('Enter a value in steps of 10 from 0.');
  await dialog.getByRole('button', { name: 'Cancel' }).click();
  await expect(dialog).toHaveCount(0);

  // Cancel at confirmation, and Escape, also send nothing.
  await requestButton(page, 'Speed setpoint').click();
  await page.getByLabel('New value').fill('1300');
  await page.getByRole('button', { name: 'Review' }).click();
  const confirm = page.getByRole('dialog', { name: 'Confirm request' });
  await expect(confirm.getByRole('button', { name: 'Cancel' })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(confirm).toHaveCount(0);
  await expect(received(page)).toHaveCount(0);
});

test('confirm sends exactly one request with the revision and digest; the value waits for telemetry', async ({ page }) => {
  await open(page);
  await requestButton(page, 'Speed setpoint').click();
  await page.getByLabel('New value').fill('1300');
  await page.keyboard.press('Enter');
  const confirm = page.getByRole('dialog', { name: 'Confirm request' });
  await expect(confirm.getByLabel('Requested value')).toHaveText('1300 rpm');
  await expect(confirm).toContainText('Current1200 rpm · GOOD');
  await expect(confirm).toContainText('The drive ramps to the new speed, and the pump flow follows.');
  await expect(confirm.getByRole('note')).toHaveText(/It does not change the plant by itself: the host’s authorization and the controller’s interlocks decide/);
  // Enter lands on Cancel, which has focus: a stray key press never sends.
  await page.keyboard.press('Enter');
  await expect(confirm).toHaveCount(0);
  await expect(received(page)).toHaveCount(0);

  await requestButton(page, 'Speed setpoint').click();
  await page.getByLabel('New value').fill('1300');
  await page.getByRole('button', { name: 'Review' }).click();
  await page.getByRole('button', { name: 'Send request' }).click();
  await expect(received(page)).toHaveCount(1);
  await expect(received(page).first()).toContainText(/^cmd-[0-9a-z]{8}-1: VFD-101\.SPEED_SP → 1300 rpm \(revision 1, digest [0-9a-f]{8}…\)/);
  // The button rests briefly, so a double click cannot send twice.
  await expect(requestButton(page, 'Speed setpoint')).toBeDisabled();
  await expect(requestButton(page, 'Speed setpoint')).toHaveText('Sent');

  // No optimistic display: still 1200 until the plant (the feed) reports otherwise.
  const writable = info(page).getByRole('list', { name: 'Writable variables' });
  await expect(writable).toContainText('Speed setpoint: 1200 rpm · GOOD');
  await expect(writable).toContainText('sent, no answer from the host yet');
  await page.getByLabel('Answer cmd-', { exact: false }).selectOption('accepted');
  await expect(writable).toContainText(/Last request cmd-[0-9a-z]{8}-1: accepted/);
  await expect(writable).toContainText('Speed setpoint: 1200 rpm · GOOD');
  await page.getByLabel('Value VFD-101.SPEED_SP').fill('1300');
  await expect(writable).toContainText('Speed setpoint: 1300 rpm · GOOD');
  await expect(requestButton(page, 'Speed setpoint')).toBeEnabled();
  await expect(received(page)).toHaveCount(1);
});

test('an on/off command, and a rejection shown as the host gave it', async ({ page }) => {
  await open(page);
  await requestButton(page, 'Run command').click();
  await page.getByRole('button', { name: 'Review' }).click();
  await expect(page.getByRole('dialog').getByRole('alert')).toHaveText('Choose on or off.');
  await page.getByLabel('Off').check();
  await page.getByRole('button', { name: 'Review' }).click();
  await expect(page.getByLabel('Requested value')).toHaveText('off');
  await page.getByRole('button', { name: 'Send request' }).click();
  await expect(received(page).first()).toContainText('VFD-101.RUN_CMD → false');
  await page.getByLabel('Answer cmd-', { exact: false }).selectOption('rejected');
  await expect(info(page).getByLabel('Last request for VFD-101.RUN_CMD')).toHaveText(/rejected, not authorized for this operator$/);
});

test('refused while the reading is unknown or values are simulated', async ({ page }) => {
  await open(page);
  await page.getByLabel('Quality VFD-101.SPEED_SP').selectOption('DISCONNECTED');
  await expect(requestButton(page, 'Speed setpoint')).toBeDisabled();
  await expect(info(page)).toContainText('Not available: the current reading is disconnected.');
  await page.getByLabel('Quality VFD-101.SPEED_SP').selectOption('GOOD');
  await expect(requestButton(page, 'Speed setpoint')).toBeEnabled();

  // A reading that goes bad while the confirmation is open: nothing is sent.
  await requestButton(page, 'Speed setpoint').click();
  await page.getByLabel('New value').fill('1000');
  await page.getByRole('button', { name: 'Review' }).click();
  await page.getByLabel('Quality VFD-101.SPEED_SP').selectOption('BAD', { force: true });
  await page.getByRole('button', { name: 'Send request' }).click();
  await expect(page.getByRole('dialog').getByRole('alert')).toHaveText('Not available: the current reading is bad quality.');
  await expect(received(page)).toHaveCount(0);
  await page.keyboard.press('Escape');

  await page.getByLabel('Quality VFD-101.SPEED_SP').selectOption('GOOD');
  await page.getByLabel('Flow source').selectOption('SIMULATED');
  await expect(requestButton(page, 'Run command')).toBeDisabled();
  await expect(info(page)).toContainText('Not available while values are simulated');
});
