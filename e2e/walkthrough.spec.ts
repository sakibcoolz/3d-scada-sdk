import { expect, test } from '@playwright/test';
import { sceneJson, waitForCanvas } from './helpers';

// A real immersive session needs a headset; these cover the button's states and the start request.

test('without a headset the VR button is disabled and says why', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'xr', { configurable: true, value: { isSessionSupported: async () => false } });
  });
  await page.goto('/');
  await waitForCanvas(page);
  const button = page.getByRole('button', { name: 'Enter VR' });
  await expect(button).toBeDisabled();
  await expect(button).toHaveText('VR unavailable');
  await expect(button).toHaveAttribute('title', /HTTPS/);
});

test('with a headset the button asks for an immersive session standing on the floor', async ({ page }) => {
  await page.addInitScript(() => {
    const calls: unknown[] = [];
    (window as unknown as { __xrCalls: unknown[] }).__xrCalls = calls;
    Object.defineProperty(navigator, 'xr', {
      configurable: true,
      value: {
        isSessionSupported: async (mode: string) => mode === 'immersive-vr',
        requestSession: async (mode: string, init: unknown) => { calls.push({ mode, init }); throw new Error('headset asleep'); },
      },
    });
  });
  await page.goto('/');
  await waitForCanvas(page);
  const button = page.getByRole('button', { name: 'Enter VR' });
  await expect(button).toBeEnabled();
  await button.click();
  await expect(page.getByRole('alert')).toHaveText('Could not start VR: headset asleep');
  const calls = await page.evaluate(() => (window as unknown as { __xrCalls: unknown[] }).__xrCalls);
  expect(calls).toEqual([{ mode: 'immersive-vr', init: { optionalFeatures: ['local-floor', 'bounded-floor'] } }]);
});

test('Walk puts a first-person walker on the floor; keys walk it, not the parts, and Esc leaves', async ({ page }) => {
  await page.goto('/');
  await waitForCanvas(page);
  await page.getByRole('button', { name: 'Vertical Tank +' }).click();
  const saved = await page.getByLabel('Scene JSON').inputValue();

  await page.getByRole('button', { name: 'Walk', exact: true }).click();
  const status = page.getByRole('status', { name: 'Walk status' });
  await expect(status).toContainText('Walking · x');
  await expect(page.getByRole('button', { name: 'Enter VR' })).toHaveCount(0);
  const position = async () => (await status.textContent())!.match(/x (-?[\d.]+) m, z (-?[\d.]+) m/)!.slice(1).map(Number);
  const before = await position();

  await page.keyboard.down('KeyW');
  await page.waitForTimeout(800);
  await page.keyboard.up('KeyW');
  // A quick tap still takes a short step.
  const held = await position();
  await page.keyboard.press('ArrowUp');
  await expect.poll(async () => Math.hypot(...(await position()).map((v, i) => v - held[i]))).toBeGreaterThan(0.1);
  await expect.poll(async () => Math.hypot(...(await position()).map((v, i) => v - before[i]))).toBeGreaterThan(0.5);
  // Walking keys never reach the editor: the selected tank did not move.
  await expect(page.getByLabel('Scene JSON')).toHaveValue(saved);

  // Space rises and Alt sinks back; neither reaches the editor.
  const eye = async () => Number((await status.textContent())!.match(/eye (-?[\d.]+) m/)![1]);
  expect(await eye()).toBe(1.7);
  await page.keyboard.down('Space');
  await page.waitForTimeout(800);
  await page.keyboard.up('Space');
  await expect.poll(eye).toBeGreaterThan(2.3);
  const high = await eye();
  await page.keyboard.down('AltLeft');
  await page.waitForTimeout(500);
  await page.keyboard.up('AltLeft');
  await expect.poll(eye).toBeLessThan(high - 0.3);
  await expect(page.getByLabel('Scene JSON')).toHaveValue(saved);

  await page.keyboard.press('Escape');
  await expect(status).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Walk', exact: true })).toBeVisible();
});

test('in Walk the crosshair picks parts and C connects the aimed part to the selected one', async ({ page }) => {
  await page.goto('/');
  await waitForCanvas(page);
  await page.getByRole('button', { name: 'Vertical Tank +' }).click();
  await page.getByRole('button', { name: 'Ball Valve +' }).click();
  expect((await sceneJson(page)).connections).toHaveLength(0);

  // The valve is selected; the walker starts facing the plant, with the tank under the crosshair.
  await page.getByRole('button', { name: 'Walk', exact: true }).click();
  const aim = page.getByRole('status', { name: 'Aim' });
  await expect(aim).toContainText('Vertical Tank 1');
  await expect(aim).toContainText('C connects to Ball Valve 1');

  await page.keyboard.press('KeyC');
  await expect.poll(async () => (await sceneJson(page)).connections.length).toBe(1);
  await expect(page.getByRole('status', { name: 'Connection message' })).toContainText('Vertical Tank 1');

  // A click selects the aimed part instead.
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Ball Valve 1' }).click();
  await page.getByRole('button', { name: 'Walk', exact: true }).click();
  await expect(aim).toContainText('Vertical Tank 1');
  const box = (await page.locator('canvas').first().boundingBox())!;
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  await expect(page.getByRole('button', { name: 'Vertical Tank 1' })).toHaveAttribute('aria-pressed', 'true');
});
