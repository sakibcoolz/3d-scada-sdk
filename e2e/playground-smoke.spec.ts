import { expect, test } from '@playwright/test';

test('playground loads offline and can add and remove a tank', async ({ page }) => {
  const sockets: string[] = [];
  page.on('websocket', (socket) => sockets.push(socket.url()));

  await page.goto('/');
  await expect(page).toHaveTitle('3D SCADA SDK Playground');
  await expect(page.getByText('3D SCADA SDK')).toBeVisible();

  await page.getByRole('button', { name: 'Vertical Tank +' }).click();
  await expect(page.getByLabel('Scene JSON')).toHaveValue(/"type": "tank"/);

  await page.getByRole('button', { name: 'Remove' }).click();
  await expect(page.getByLabel('Scene JSON')).not.toHaveValue(/"type": "tank"/);
  await expect(page.getByText('Select equipment in the canvas.')).toBeVisible();

  expect(sockets).toEqual([]);
});

test('demo scene loads a validated, routed network without errors', async ({ page }) => {
  const errors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  page.on('pageerror', (error) => errors.push(String(error)));

  await page.goto('/?demo');
  const json = page.getByLabel('Scene JSON');
  await expect(json).toHaveValue(/"id": "tee-b"/);
  await expect(page.locator('canvas')).toBeVisible();
  await page.waitForTimeout(500);
  expect(errors).toEqual([]);
});
