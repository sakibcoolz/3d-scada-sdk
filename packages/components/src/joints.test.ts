import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { findOpenJoints, parseScene, routeScene, seatOnConnection } from '@scada3d/core';
import { catalogResolvers } from './index.js';
import { demoScene } from '../../../apps/playground/src/demo.js';

// The owner's plant: valve B 15 mm above the tee branch, and the tee turned end for end so
// "left" and "right" point the wrong way.
const text = readFileSync(new URL('./fixtures/open-joints-plant.json', import.meta.url), 'utf8');

describe('open joints in a real plant', () => {
  const loaded = parseScene(text, catalogResolvers);
  if (!loaded.ok) throw new Error(JSON.stringify(loaded.errors));

  it('finds the three connections that look joined but are not', () => {
    const open = findOpenJoints(loaded.scene, catalogResolvers);
    expect(open.map((o) => [o.connectionId, o.problem])).toEqual([
      ['pipe-tee', 'unroutable'],
      ['tee-a', 'unroutable'],
      ['tee-b', 'unroutable'],
    ]);
    expect(open[2].distance).toBeCloseTo(0.015, 9);
  });

  it('is fixed by seating the tee on the pipe, then valve B on the tee', () => {
    const first = seatOnConnection(loaded.scene, 'pipe-tee', 'tee', catalogResolvers);
    if (!first.ok) throw new Error(first.error.message);
    expect(findOpenJoints(first.scene, catalogResolvers).map((o) => o.connectionId)).toEqual(['tee-b']);
    const second = seatOnConnection(first.scene, 'tee-b', 'valve-b', catalogResolvers);
    if (!second.ok) throw new Error(second.error.message);
    expect(second.moved).toBeCloseTo(0.015, 9);
    expect(findOpenJoints(second.scene, catalogResolvers)).toEqual([]);
    expect(routeScene(second.scene, catalogResolvers).map((r) => r.status === 'ok' && r.kind)).toEqual(['direct', 'direct', 'direct', 'direct', 'direct']);
  });

  it('does not flag the demo plant, whose gaps are deliberate routed pipe runs', () => {
    expect(findOpenJoints(demoScene, catalogResolvers)).toEqual([]);
  });
});
