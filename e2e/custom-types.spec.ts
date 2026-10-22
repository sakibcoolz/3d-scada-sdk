import { expect, test } from '@playwright/test';
import { installThreeHook, renderedParts, sceneJson, waitForCanvas } from './helpers';

// Host component types through the registry (ADR-0022), using the playground's `?custom` example.

test('a registered host type is in the palette, renders with its own parts, connects, and round-trips', async ({ page }) => {
  await installThreeHook(page);
  await page.goto('/?custom');
  await waitForCanvas(page);
  await page.getByRole('button', { name: 'Inline Filter (example) +' }).click();
  const filter = (await sceneJson(page)).components[0];
  expect(filter.type).toBe('com.example.filter');
  // Its own three parts, not the one-box placeholder: the registry reaches the 3D canvas.
  await expect.poll(async () => (await renderedParts(page)).filter((p) => p.componentId === filter.id).length).toBe(3);
  await expect(page.getByRole('heading', { name: 'Inline Filter (example)' })).toBeVisible();

  // Attach a built-in pipe to it (Shift+click in the scene list), as with any part.
  await page.getByRole('button', { name: 'Straight Pipe +' }).click();
  await page.getByRole('button', { name: 'Inline Filter (example) 1' }).click();
  await page.getByRole('button', { name: 'Straight Pipe 1' }).click({ modifiers: ['Shift'] });
  await expect.poll(async () => (await sceneJson(page)).connections.length).toBe(1);

  // Export and import the same text: identical scene.
  const saved = await page.getByLabel('Scene JSON').inputValue();
  await page.getByLabel('Import JSON text').fill(saved);
  await page.getByRole('button', { name: 'Load text' }).click();
  await expect(page.getByText('Loaded 2 components and 1 connection.')).toBeVisible();
  await expect(page.getByLabel('Scene JSON')).toHaveValue(saved);

  // The Walk parts menu offers it too.
  await page.getByRole('button', { name: 'Walk', exact: true }).click();
  await page.keyboard.press('KeyP');
  await expect(page.getByRole('dialog', { name: 'Place a part' }).getByRole('button', { name: 'Inline Filter (example)' })).toBeVisible();
});

test('an editor without the registration refuses a file that uses the host type', async ({ page }) => {
  await page.goto('/');
  await waitForCanvas(page);
  const doc = {
    schemaVersion: 4,
    documentType: 'industrial.scene',
    units: 'm',
    components: [{ id: 'f', type: 'com.example.filter', position: { x: 0, y: 0.35, z: 0 }, rotation: { x: 0, y: 0, z: 0, w: 1 }, scale: { x: 1, y: 1, z: 1 }, properties: {} }],
    connections: [],
  };
  await page.getByLabel('Import JSON text').fill(JSON.stringify(doc));
  await page.getByRole('button', { name: 'Load text' }).click();
  await expect(page.getByRole('alert')).toContainText('components[0].type');
  expect((await sceneJson(page)).components).toEqual([]);
});

test('a wired connection between host types is drawn as a coloured line and keeps its fields (ADR-0023)', async ({ page }) => {
  await installThreeHook(page);
  await page.goto('/?custom');
  await waitForCanvas(page);
  const at = (id: string, type: string, x: number) => ({ id, type, position: { x, y: 0, z: 0 }, rotation: { x: 0, y: 0, z: 0, w: 1 }, scale: { x: 1, y: 1, z: 1 }, properties: {} });
  const doc = {
    schemaVersion: 4,
    documentType: 'industrial.scene',
    units: 'm',
    components: [at('PLC-01', 'com.example.controller', 0), at('VFD-101', 'com.example.drive', 3)],
    connections: [
      { id: 'w1', domain: 'signal', relationship: 'controls', from: { instanceId: 'PLC-01', portId: 'do0' }, to: { instanceId: 'VFD-101', portId: 'run' }, properties: { cable: 'LiYCY 2x0.75', lengthM: 4 } },
      { id: 'n1', relationship: 'communicates', from: { instanceId: 'PLC-01', portId: 'eth' }, to: { instanceId: 'VFD-101', portId: 'eth' } },
    ],
  };
  await page.getByLabel('Import JSON text').fill(JSON.stringify(doc));
  await page.getByRole('button', { name: 'Load text' }).click();
  await expect(page.getByText('Loaded 2 components and 2 connections.')).toBeVisible();

  const wires = () => page.evaluate(() => {
    const found: { id: string; domain: string; color: string }[] = [];
    type Node = { userData: Record<string, unknown>; material?: { color?: { getHexString(): string } }; traverse(f: (o: Node) => void): void };
    for (const scene of (window as unknown as { __scenes: Node[] }).__scenes)
      scene.traverse((o) => {
        if (typeof o.userData?.wireConnectionId === 'string') found.push({ id: o.userData.wireConnectionId, domain: String(o.userData.domain), color: `#${o.material?.color?.getHexString()}` });
      });
    return found.sort((a, b) => a.id.localeCompare(b.id));
  });
  await expect.poll(wires).toEqual([
    { id: 'n1', domain: 'network', color: '#2fb36d' },
    { id: 'w1', domain: 'signal', color: '#3d8bfd' },
  ]);

  // Saved exactly as authored: fields kept, nothing derived into the file.
  const saved = JSON.parse(await page.getByLabel('Scene JSON').inputValue());
  expect(saved.connections).toEqual([
    { id: 'w1', domain: 'signal', relationship: 'controls', from: doc.connections[0].from, to: doc.connections[0].to, properties: { cable: 'LiYCY 2x0.75', lengthM: 4 } },
    { id: 'n1', relationship: 'communicates', from: doc.connections[1].from, to: doc.connections[1].to },
  ]);
});

test('associations load, save as written, go with a deleted component and come back on undo (ADR-0023)', async ({ page }) => {
  await page.goto('/?custom');
  await waitForCanvas(page);
  const at = (id: string, type: string, x: number) => ({ id, type, position: { x, y: 0, z: 0 }, rotation: { x: 0, y: 0, z: 0, w: 1 }, scale: { x: 1, y: 1, z: 1 }, properties: {} });
  const controls = { id: 'a1', relationship: 'controls', from: 'PLC-01', to: 'VFD-101' };
  const doc = {
    schemaVersion: 4,
    documentType: 'industrial.scene',
    units: 'm',
    components: [at('PLC-01', 'com.example.controller', 0), at('VFD-101', 'com.example.drive', 3)],
    connections: [],
    associations: [controls],
  };
  await page.getByLabel('Import JSON text').fill(JSON.stringify(doc));
  await page.getByRole('button', { name: 'Load text' }).click();
  await expect(page.getByText('Loaded 2 components and 0 connections.')).toBeVisible();
  expect((await sceneJson(page)).associations).toEqual([controls]);

  const drive = page.getByRole('button', { name: 'Drive (example) 1' });
  await drive.press('Enter');
  await expect(drive).toHaveAttribute('aria-pressed', 'true');
  await page.keyboard.press('Delete');
  await expect.poll(async () => (await sceneJson(page)).components.length).toBe(1);
  expect((await sceneJson(page)).associations).toBeUndefined();
  await page.keyboard.press('Control+z');
  await expect.poll(async () => (await sceneJson(page)).associations).toEqual([controls]);
});
