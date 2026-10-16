import { describe, expect, it } from 'vitest';
import { componentCatalog, liquidProfile, pipeOuterRadius, type GeometryPart } from './index.js';

const tank = componentCatalog.conicalTank;
const liquid = tank.parts.find((p): p is Extract<GeometryPart, { shape: 'lathe' }> => p.shape === 'lathe' && p.role === 'liquid')!;

describe('conical tank', () => {
  it('is a labelled catalog component with level and temperature bindings', () => {
    expect(tank.label).toBe('Conical Tank');
    expect(tank.bindable).toEqual({ level: 'percent', temperature: 'temperature' });
  });

  it('has a top inlet facing up and a bottom outlet turned out to the side, both DN150', () => {
    expect(tank.ports).toEqual([
      { id: 'inlet', kind: 'fluid', position: [0, 1.7, 0], direction: [0, 1, 0], nominalSize: 0.15 },
      { id: 'outlet', kind: 'fluid', position: [1.1, -2.1, 0], direction: [1, 0, 0], nominalSize: 0.15 },
    ]);
  });

  it('stands on legs that reach the ground below the outlet pipe', () => {
    expect(tank.bounds.min[1]).toBe(-2.5);
    const legs = tank.parts.filter((p) => p.role === 'shell' && p.shape === 'cylinder' && p.axis === 'y' && p.radius === 0.05);
    expect(legs).toHaveLength(3);
    for (const leg of legs) if (leg.shape === 'cylinder') expect(leg.center[1] - leg.length / 2).toBe(-2.5);
    // The outlet pipe runs below the cone, clear of the ground.
    expect(-2.1 - pipeOuterRadius).toBeGreaterThan(-2.5);
  });

  it('has a cone bottom, a cylindrical body, a sight-glass gauge with its own liquid and a name plate', () => {
    expect(tank.parts.filter((p) => p.shape === 'cone' && p.role === 'shell')).toHaveLength(1);
    expect(tank.parts.filter((p) => p.role === 'gauge')).toHaveLength(1);
    expect(tank.parts.filter((p) => p.role === 'liquid').map((p) => p.shape).sort()).toEqual(['cylinder', 'lathe']);
    expect(tank.parts.filter((p) => p.role === 'plate')).toHaveLength(1);
  });
});

describe('liquidProfile', () => {
  const [y0, y1] = [liquid.points[0][1], liquid.points[liquid.points.length - 1][1]];

  it('is empty at 0 % and the whole inner profile at 100 %, closed on the axis', () => {
    expect(liquidProfile(liquid.points, 0)).toEqual([]);
    const full = liquidProfile(liquid.points, 1);
    expect(full[0]).toEqual([0, y0]);
    expect(full[full.length - 1]).toEqual([0, y1]);
    expect(full.slice(1, -1)).toEqual(liquid.points);
  });

  it('cuts the profile at the level height, interpolating the wall radius', () => {
    const half = liquidProfile(liquid.points, 0.5);
    const top = y0 + 0.5 * (y1 - y0);
    expect(half[half.length - 1]).toEqual([0, top]);
    const wall = half[half.length - 2];
    expect(wall[1]).toBeCloseTo(top, 12);
    expect(wall[0]).toBeGreaterThan(0.5);
    expect(half.every(([, y]) => y <= top + 1e-12)).toBe(true);
  });

  it('is narrow near the bottom of the cone', () => {
    const low = liquidProfile(liquid.points, 0.05);
    expect(low[low.length - 2][0]).toBeLessThan(0.3);
  });

  it('clamps out-of-range fractions', () => {
    expect(liquidProfile(liquid.points, -1)).toEqual([]);
    expect(liquidProfile(liquid.points, 2)).toEqual(liquidProfile(liquid.points, 1));
  });
});
