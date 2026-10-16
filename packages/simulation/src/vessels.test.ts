import { describe, expect, it } from 'vitest';
import type { ComponentInstance, ScadaScene } from '@scada3d/core';
import { createSimulation, vesselOf } from './index.js';

describe('vesselOf with tank dimensions (T-053)', () => {
  it('follows diameter and height', () => {
    const v = vesselOf('tank', { diameter: 3, height: 4 })!;
    expect(v.height).toBeCloseTo(4, 9);
    expect(v.maxVolume).toBeCloseTo(Math.PI * 1.5 ** 2 * 4, 9);
    expect(v.portHeight('outlet')).toBeCloseTo(0.6, 9);
    expect(v.portHeight('inlet')).toBeCloseTo(4 - 0.7, 9);
    expect(vesselOf('tank')).toBe(vesselOf('tank', { diameter: 2, height: 3 }));
  });

  it('holds the dished head as well, with the level measured over the full liquid height', () => {
    const v = vesselOf('tank', { head: 'dished' })!;
    expect(v.height).toBeCloseTo(3.5, 9);
    expect(v.maxVolume / (Math.PI * 3 + (2 / 3) * Math.PI * 0.5)).toBeCloseTo(1, 2);
    expect(v.volumeAtPercent(100)).toBeCloseTo(v.maxVolume, 9);
  });

  it('drains a bigger tank more slowly in the simulation', () => {
    const tank = (properties: ComponentInstance['properties']): ScadaScene => ({
      schemaVersion: 3, units: 'm', connections: [],
      components: [{ id: 't', type: 'tank', position: { x: 0, y: 2, z: 0 }, rotation: { x: 0, y: 0, z: 0, w: 1 }, scale: { x: 1, y: 1, z: 1 }, properties: { level: 50, ...properties } }],
    });
    const fill = (properties: ComponentInstance['properties']) => {
      const sim = createSimulation(tank(properties), { feeds: [{ at: { instanceId: 't', portId: 'inlet' }, rate: 0.01 }] });
      sim.step(60);
      return sim.state().levels.t - 50;
    };
    expect(fill({ diameter: 2 })).toBeCloseTo(4 * fill({ diameter: 4 }), 6);
  });
});
