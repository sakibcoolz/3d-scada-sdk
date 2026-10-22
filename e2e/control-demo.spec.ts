import { expect, test } from '@playwright/test';
import { installThreeHook, renderedParts, sceneJson, waitForCanvas } from './helpers';

// `?control` (ADR-0025, T-082): a PLC → VFD → Motor → pump line built from the opt-in control library.

test('the control demo renders the library parts, draws every wire and shows its tags', async ({ page }) => {
  await installThreeHook(page);
  await page.goto('/?control');
  await waitForCanvas(page);

  // The demo scene validated against the library registry and loaded whole.
  const scene = await sceneJson(page);
  expect(scene.components).toHaveLength(14);
  expect(scene.associations.map((a: { relationship: string }) => a.relationship)).toEqual(['controls', 'drives', 'measures', 'measures']);

  // Library parts render with their own geometry: the motor's body, fins, foot, terminal box and shaft.
  await expect.poll(async () => (await renderedParts(page)).filter((p) => p.componentId === 'M-101').length).toBe(9);
  for (const id of ['VFD-101', 'PLC-01', 'LT-101', 'PNL-01']) expect((await renderedParts(page)).some((p) => p.componentId === id)).toBe(true);

  // Every wired connection is drawn in its domain colour; the pipe is not a wire.
  const wires = () => page.evaluate(() => {
    const counts: Record<string, number> = {};
    type Node = { userData: Record<string, unknown>; traverse(f: (o: Node) => void): void };
    const seen = new Set<string>();
    for (const s of (window as unknown as { __scenes: Node[] }).__scenes)
      s.traverse((o) => {
        const id = o.userData?.wireConnectionId;
        if (typeof id === 'string' && !seen.has(id)) {
          seen.add(id);
          counts[String(o.userData.domain)] = (counts[String(o.userData.domain)] ?? 0) + 1;
        }
      });
    return counts;
  });
  await expect.poll(wires).toEqual({ power: 9, signal: 7, network: 2 });

  // Tags from the host data source: level and flow are good; the temperature link is down.
  await expect(page.getByLabel('Telemetry summary')).toHaveText('Tags: 1 good, 0 uncertain, 1 unknown (1 disconnected)');
  await expect.poll(async () => (await renderedParts(page)).find((p) => p.componentId === 'TK-101' && p.role === 'liquid')?.scaleY).toBeCloseTo(0.55, 9);
  // Wires carry no process flow: only the tank-to-pump pipe has a flow state.
  await expect(page.getByLabel('Flow summary')).toHaveText('Flow: 1 forward, 0 reverse, 0 stopped, 0 unknown');
  await page.getByLabel('Quality TT-101').selectOption('GOOD');
  await expect(page.getByLabel('Telemetry summary')).toHaveText('Tags: 2 good, 0 uncertain, 0 unknown');

  // The library is in the palette for adding more equipment.
  await expect(page.getByRole('button', { name: 'Variable-Frequency Drive +' })).toBeVisible();
});

test('the control demo saves and reloads unchanged', async ({ page }) => {
  await page.goto('/?control');
  await waitForCanvas(page);
  const saved = await page.getByLabel('Scene JSON').inputValue();
  await page.getByLabel('Import JSON text').fill(saved);
  await page.getByRole('button', { name: 'Load text' }).click();
  await expect(page.getByText('Loaded 14 components and 19 connections.')).toBeVisible();
  await expect(page.getByLabel('Scene JSON')).toHaveValue(saved);
});
