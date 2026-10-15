import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { installThreeHook, rendererMemory, sceneJson, waitForCanvas } from './helpers';

// SVG underlay (ADR-0012): a sanitized drawing on the ground plane as a tracing reference.
const plan = readFileSync(join(__dirname, '../packages/asset-import/src/fixtures/plant-plan.svg'), 'utf8');
const file = (name: string, text: string) => ({ name, mimeType: 'image/svg+xml', buffer: Buffer.from(text) });

interface UnderlayMesh { width: number; height: number; opacity: number; textured: boolean }

/** The drawn underlay plane, once its texture has been painted. */
const underlayMesh = (page: Page): Promise<UnderlayMesh | null> =>
  page.evaluate(() => {
    let found = null as { width: number; height: number; opacity: number; textured: boolean } | null;
    for (const s of (window as unknown as { __scenes: { traverse(f: (o: any) => void): void }[] }).__scenes)
      s.traverse((o) => {
        if (o.userData?.role !== 'underlay') return;
        const p = o.geometry.parameters;
        found = { width: p.width, height: p.height, opacity: o.material.opacity, textured: !!o.material.map?.image };
      });
    return found;
  });

async function open(page: Page) {
  await installThreeHook(page);
  await page.goto('/');
  await waitForCanvas(page);
}

test('an SVG drawing becomes a sanitized underlay on the ground, with a summary of what was dropped', async ({ page }) => {
  await open(page);
  await page.getByLabel('Import SVG underlay').setInputFiles(file('plant-plan.svg', plan));
  await expect(page.getByRole('status').filter({ hasText: 'Underlay loaded' })).toHaveText('Underlay loaded: 6 shapes. Not shown: 1 namedview, 1 metadata, 1 title, 2 text.');
  const { underlay } = await sceneJson(page);
  expect(underlay).toMatchObject({ position: { x: 0, z: 0 }, width: 20, rotation: 0, opacity: 0.6 });
  expect(underlay.svg).not.toMatch(/text|metadata|inkscape|sodipodi|TK-101/);
  // 400 × 200 drawing at 20 m wide → 10 m deep.
  await expect.poll(() => underlayMesh(page)).toEqual({ width: 20, height: 10, opacity: 0.6, textured: true });
});

test('placing the underlay is undoable, and it survives export and import', async ({ page }) => {
  await open(page);
  await page.getByLabel('Import SVG underlay').setInputFiles(file('plant-plan.svg', plan));
  await page.getByLabel('Underlay width (m)').fill('40');
  await page.getByLabel('Underlay X (m)').fill('5');
  await expect.poll(async () => (await underlayMesh(page))?.width).toBe(40);
  expect((await sceneJson(page)).underlay).toMatchObject({ width: 40, position: { x: 5, z: 0 } });
  await page.getByRole('button', { name: 'Undo' }).click();
  expect((await sceneJson(page)).underlay.position.x).toBe(0);

  const saved = await page.getByLabel('Scene JSON').inputValue();
  await page.getByRole('button', { name: 'Remove underlay' }).click();
  expect((await sceneJson(page)).underlay).toBeUndefined();
  await expect.poll(() => underlayMesh(page)).toBeNull();
  await page.getByLabel('Import JSON text').fill(saved);
  await page.getByRole('button', { name: 'Load text' }).click();
  await expect.poll(async () => (await underlayMesh(page))?.width).toBe(40);
});

test('an SVG with a script is refused and nothing is drawn', async ({ page }) => {
  await open(page);
  const evil = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10" onload="window.__pwned=1"><path d="M0 0L5 5"/></svg>';
  await page.getByLabel('Import SVG underlay').setInputFiles(file('evil.svg', evil));
  await expect(page.getByRole('alert')).toHaveText('Could not use this SVG: Event handler "onload" is not allowed.');
  expect((await sceneJson(page)).underlay).toBeUndefined();
  expect(await page.evaluate(() => (window as unknown as { __pwned?: number }).__pwned)).toBeUndefined();
});

test('a scene file carrying an unsafe underlay is rejected on import', async ({ page }) => {
  await open(page);
  const bad = { schemaVersion: 3, units: 'm', components: [], connections: [], underlay: { svg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1 1"><image href="http://x/a.png"/></svg>', position: { x: 0, z: 0 }, width: 10, rotation: 0, opacity: 1 } };
  await page.getByLabel('Import JSON text').fill(JSON.stringify(bad));
  await page.getByRole('button', { name: 'Load text' }).click();
  await expect(page.getByLabel('Import errors')).toHaveText('underlay.svg: Unsafe or unreadable SVG: <image> is not allowed.');
});

test('removing the underlay releases its texture, and locking disables the controls', async ({ page }) => {
  await open(page);
  await page.waitForTimeout(300);
  const [before] = await rendererMemory(page);
  await page.getByLabel('Import SVG underlay').setInputFiles(file('plant-plan.svg', plan));
  await expect.poll(async () => (await underlayMesh(page))?.textured).toBe(true);
  await page.getByRole('button', { name: 'Lock editing' }).click();
  await expect(page.getByLabel('Import SVG underlay')).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Remove underlay' })).toBeDisabled();
  await page.getByRole('button', { name: 'Unlock editing' }).click();
  await page.getByRole('button', { name: 'Remove underlay' }).click();
  await expect.poll(async () => (await rendererMemory(page))[0].textures).toBe(before.textures);
});
