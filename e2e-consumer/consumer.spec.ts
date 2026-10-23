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

  // The 2D process view from @sakibcoolz/views-2d (ADR-0026): one symbol per component, three pipes.
  await page.getByRole('button', { name: 'Process' }).click();
  const process = page.getByRole('group', { name: 'Process view' });
  await expect(process.getByRole('button')).toHaveCount(4);
  await expect(process.locator('[data-edge-kind="connection"]')).toHaveCount(3);

  expect(errors).toEqual([]);
});

// The locked runtime from the packed packages (ADR-0028, ADR-0029): pinned by revision and digest,
// host alarms, the 2D views, and one confirmed command request handed to the host.
test('the packed runtime shows an approved revision and raises a confirmed request', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto('/');
  await page.getByRole('button', { name: 'Runtime' }).click();

  await expect(page.getByLabel('Approved revision')).toHaveText('Consumer line · revision 1 · digest verified · view only');
  const info = page.getByRole('complementary', { name: 'Information' });
  await expect(info.getByRole('region', { name: 'Attention' })).toContainText('Level high');

  const toolbar = page.getByRole('toolbar', { name: 'Runtime layout' });
  await toolbar.getByRole('button', { name: 'Electrical' }).click();
  await expect(page.getByRole('group', { name: 'Electrical view' })).toBeVisible();
  await toolbar.getByRole('button', { name: 'Process' }).click();
  await page.getByRole('group', { name: 'Process view' }).locator('[data-component-id="valve"]').click();
  await expect(info.getByRole('heading', { name: 'valve' })).toBeVisible();

  await info.getByRole('button', { name: 'Request change to Valve command' }).click();
  await page.getByRole('dialog', { name: 'Request change' }).getByLabel('Off').check();
  await page.getByRole('button', { name: 'Review' }).click();
  const confirm = page.getByRole('dialog', { name: 'Confirm request' });
  await expect(confirm).toContainText('Opens or closes the outlet valve.');
  await confirm.getByRole('button', { name: 'Send request' }).click();

  const received = page.getByRole('list', { name: 'Requests received by the host' }).getByRole('listitem');
  await expect(received).toHaveCount(1);
  await expect(received.first()).toHaveText(/^XV-1\.CMD = false \(revision 1, digest [0-9a-f]{12}\)$/);
  await expect(info.getByLabel('Last request for XV-1.CMD')).toContainText('accepted, recorded by the example host');
  expect(errors).toEqual([]);
});
