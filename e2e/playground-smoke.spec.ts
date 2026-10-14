import { expect, test } from '@playwright/test';

test('playground loads offline and can add and remove a tank', async ({ page }) => {
  const sockets: string[] = [];
  page.on('websocket', (socket) => sockets.push(socket.url()));

  await page.goto('/');
  await expect(page).toHaveTitle('3D SCADA SDK Playground');
  await expect(page.getByText('3D SCADA SDK')).toBeVisible();

  await page.getByRole('button', { name: 'Vertical Tank +' }).click();
  await expect(page.getByLabel('Scene JSON')).toHaveValue(/"kind": "tank"/);

  await page.getByRole('button', { name: 'Remove' }).click();
  await expect(page.getByLabel('Scene JSON')).not.toHaveValue(/"kind": "tank"/);
  await expect(page.getByText('Select equipment in the canvas.')).toBeVisible();

  expect(sockets).toEqual([]);
});
