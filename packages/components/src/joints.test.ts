import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { findOpenJoints, parseScene, routeScene, seatOnConnection, upgradeDimensions } from '@sakibcoolz/core';
import { catalogResolvers, legacyCatalogResolvers } from './index.js';
import { demoScene } from '../../../apps/playground/src/demo.js';

// The owner's plant: valve B 15 mm above the tee branch, and the tee turned end for end so
// "left" and "right" point the wrong way.
const text = readFileSync(new URL('./fixtures/open-joints-plant.json', import.meta.url), 'utf8');

/** How far valve B's inlet is from the tee branch. */
const open3Distance = (scene: Parameters<typeof findOpenJoints>[0]) => findOpenJoints(scene, catalogResolvers).find((o) => o.connectionId === 'tee-b')!.distance;

describe('open joints in a real plant', () => {
  const parsed = parseScene(text, catalogResolvers);
  if (!parsed.ok) throw new Error(JSON.stringify(parsed.errors));
  // Written before ASME fittings (ADR-0014): upgrade as on load.
  const loaded = { ...parsed, scene: upgradeDimensions(parsed.scene, { ...catalogResolvers, ...legacyCatalogResolvers }).scene };

  it('finds the three connections that look joined but are not', () => {
    const open = findOpenJoints(loaded.scene, catalogResolvers);
    expect(open.map((o) => [o.connectionId, o.problem])).toEqual([
      ['pipe-tee', 'unroutable'],
      ['tee-a', 'unroutable'],
      ['tee-b', 'unroutable'],
    ]);
    // Valve B was 15 mm off the old 1 m branch; it never touched, so the upgrade leaves it where it
    // was, and the shorter ASME tee branch puts it further away.
    expect(open[2].distance).toBeGreaterThan(0.015);
  });

  it('is fixed by seating the tee on the pipe, then valve B on the tee', () => {
    const first = seatOnConnection(loaded.scene, 'pipe-tee', 'tee', catalogResolvers);
    if (!first.ok) throw new Error(first.error.message);
    expect(findOpenJoints(first.scene, catalogResolvers).map((o) => o.connectionId)).toEqual(['tee-b']);
    const second = seatOnConnection(first.scene, 'tee-b', 'valve-b', catalogResolvers);
    if (!second.ok) throw new Error(second.error.message);
    expect(second.moved).toBeCloseTo(open3Distance(first.scene), 9);
    expect(findOpenJoints(second.scene, catalogResolvers)).toEqual([]);
    // The ASME tee is shorter than the old one, so valve A is reached by a straight pipe run.
    expect(routeScene(second.scene, catalogResolvers).map((r) => r.status === 'ok' && r.kind)).toEqual(['direct', 'direct', 'direct', 'straight', 'direct']);
  });

  it('does not flag the demo plant, whose gaps are deliberate routed pipe runs', () => {
    expect(findOpenJoints(demoScene, catalogResolvers)).toEqual([]);
  });
});
