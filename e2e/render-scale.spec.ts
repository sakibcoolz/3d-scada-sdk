import { expect, test } from '@playwright/test';
import { installThreeHook, waitForCanvas } from './helpers';

// Rendering scale (T-029): large scenes share geometry and draw markers in a handful of calls.
// Equipment instancing (T-046) is turned off here: this checks the individual-mesh path, which
// selected, colliding and non-normal-view components still use.
test('a 200-valve chain shares geometry and draws markers in single instanced meshes', async ({ page }) => {
  await installThreeHook(page);
  await page.goto('/?generate=200&instancing=off');
  await waitForCanvas(page);
  await page.waitForTimeout(500);
  const counts = await page.evaluate(() => {
    const out = { instanced: {} as Record<string, number>, portMarkers: 0, jointMeshes: 0, geometries: new Set<unknown>() };
    for (const scene of (window as unknown as { __scenes: { traverse(f: (o: any) => void): void }[] }).__scenes) {
      scene.traverse((o) => {
        if (o.isInstancedMesh && o.userData?.joint) out.jointMeshes++;
        else if (o.isInstancedMesh) {
          out.instanced[o.userData.role] = (out.instanced[o.userData.role] ?? 0) + 1;
          if (o.userData.role === 'port-markers') out.portMarkers = o.count;
        }
        if (o.isMesh && o.userData?.componentId) out.geometries.add(o.geometry);
      });
    }
    return { instanced: out.instanced, portMarkers: out.portMarkers, jointMeshes: out.jointMeshes, equipmentGeometries: out.geometries.size };
  });
  // One bead mesh for every animated route (all share one colour), one mesh for all free ports.
  expect(counts.instanced).toEqual({ 'flow-markers': 1, 'port-markers': 1 });
  // Only the two ends of the chain are free.
  expect(counts.portMarkers).toBe(2);
  // Flanges, bolts and welds for ~1,200 joints are a few dozen instanced meshes, not thousands.
  expect(counts.jointMeshes).toBeGreaterThan(0);
  expect(counts.jointMeshes).toBeLessThan(60);
  // 200 identical valves, 4 parts each, share 4 geometries.
  expect(counts.equipmentGeometries).toBe(4);
});
