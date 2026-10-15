import { expect, test } from '@playwright/test';

// The consumer app installs the packed tarballs only: no workspace aliases, no playground code.
test('the packed viewer and editor render and edit in a stand-alone app', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto('/');

  const view = page.getByRole('region', { name: '3D scene view' });
  await expect(view).toBeVisible();
  await expect(view.locator('canvas')).toBeVisible();
  await expect(page.getByText('4 components, 3 connections.')).toBeAttached();
  await expect(page.getByLabel('Open joints')).toHaveCount(0);

  await page.getByRole('button', { name: 'Editor' }).click();
  await expect(page.getByRole('button', { name: 'Reducer +' })).toBeVisible();
  await page.getByRole('button', { name: 'Ball Valve +' }).click();
  await expect(page.getByLabel('Component count')).toHaveText('5 components');
  await page.getByRole('button', { name: 'Undo' }).click();
  await expect(page.getByLabel('Component count')).toHaveText('4 components');

  expect(errors).toEqual([]);
});
