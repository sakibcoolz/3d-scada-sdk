import { describe, expect, it } from 'vitest';
import { capacityOf, catalogResolvers, componentCatalog, definitionFor, vesselProfile, type GeometryPart } from './index.js';

const plateText = (parts: readonly GeometryPart[]) => parts.find((p) => p.role === 'plate' && p.shape === 'box')?.shape === 'box' ? (parts.find((p) => p.role === 'plate') as Extract<GeometryPart, { shape: 'box' }>).text : undefined;
const struts = (parts: readonly GeometryPart[]) => parts.filter((p) => p.shape === 'strut');
const portOf = (type: Parameters<typeof definitionFor>[0], id: string, properties = {}) => definitionFor(type, properties).ports.find((p) => p.id === id)!;

/** ASME F&D (torispherical) head depth: crown radius D, knuckle radius 0.06 D. */
const fdDepth = (D: number) => {
  const [R, rk, rc] = [D / 2, 0.06 * D, D];
  return rc - Math.sqrt((rc - rk) ** 2 - (R - rk) ** 2);
};

describe('horizontal tank (T-054)', () => {
  const R = 1, L = 3, depth = fdDepth(2);
  it('lies along X with ASME F&D heads, a top inlet near the -X end and a low outlet from the +X head', () => {
    const d = componentCatalog.horizontalTank;
    expect(portOf('horizontalTank', 'inlet')).toMatchObject({ position: [-L / 2 + 0.4, R + 0.2, 0], direction: [0, 1, 0] });
    const outlet = portOf('horizontalTank', 'outlet');
    expect(outlet.direction).toEqual([1, 0, 0]);
    expect(outlet.position[0]).toBeCloseTo(L / 2 + depth + 0.2, 9);
    expect(outlet.position[1]).toBeCloseTo(-0.75 * R, 12);
    const shell = d.parts.find((p): p is Extract<GeometryPart, { shape: 'lathe' }> => p.role === 'shell' && p.shape === 'lathe');
    expect(shell?.axis).toBe('x');
    expect(shell?.points[0][0]).toBeCloseTo(0, 9);
    expect(shell?.points[0][1]).toBeCloseTo(-L / 2 - depth, 9);
    expect(depth / 2).toBeCloseTo(0.169, 3);
    // Weld seams where the heads meet the shell.
    expect(d.parts.filter((p) => p.shape === 'ring' && p.axis === 'x').map((p) => p.shape === 'ring' && p.center[0])).toEqual([-L / 2, L / 2]);
    expect(d.bounds.min[1]).toBeCloseTo(-R - 0.6, 12); // default 0.6 m stand
  });

  it('holds the shell plus two F&D heads (about 0.0809 D³ each), half of it at half height', () => {
    const d = componentCatalog.horizontalTank;
    const approx = Math.PI * R * R * L + 2 * 0.0809 * 8;
    expect(capacityOf(d.parts) / approx).toBeCloseTo(1, 2);
    const v = vesselProfile(d.parts)!;
    expect(v.bottom).toBeCloseTo(-R, 9);
    expect(v.top).toBeCloseTo(R, 9);
    expect(v.volumeAt(0) / v.volumeAt(R)).toBeCloseTo(0.5, 3);
    expect(plateText(d.parts)).toBe('10.7 m³');
  });

  it('puts the plate flat on the middle of the shell and a bracketed full-height gauge at the +X end', () => {
    const d = componentCatalog.horizontalTank;
    const plate = d.parts.find((p) => p.role === 'plate');
    expect(plate?.shape === 'box' && plate.center[0]).toBe(0);
    expect(plate?.shape === 'box' && plate.center[2]).toBeCloseTo(R + 0.012, 12);
    const gauge = d.parts.find((p) => p.role === 'gauge');
    expect(gauge?.shape === 'cylinder' && gauge.center[0]).toBeCloseTo(L / 2 - 0.25, 12);
    expect(gauge?.shape === 'cylinder' && gauge.length).toBeCloseTo(1.7 * R + 0.04, 12);
    expect(d.parts.filter((p) => p.shape === 'cylinder' && p.axis === 'z' && p.radius === 0.015)).toHaveLength(2);
  });

  it('rests on two saddles near the ends, each on two legs, braced front and back', () => {
    const d = definitionFor('horizontalTank', { diameter: 3, length: 6, standHeight: 1 });
    const saddles = d.parts.filter((p) => p.role === 'shell' && p.shape === 'box' && p.size[2] > 1.5);
    expect(saddles.map((p) => p.shape === 'box' && p.center[0])).toEqual([-2.9, 2.9]);
    expect(d.bounds.min[1]).toBeCloseTo(-1.5 - 1, 12);
    expect(portOf('horizontalTank', 'outlet', { diameter: 3, length: 6 }).position[0]).toBeCloseTo(3 + fdDepth(3) + 0.2, 9);
    expect(struts(d.parts)).toHaveLength(4);
    expect(catalogResolvers.validateProperties('horizontalTank', { length: 100 })).toEqual([{ property: 'length', message: 'must be between 1 and 20 m' }]);
  });
});

describe('spherical tank (T-055)', () => {
  const R = 1.2;
  it('is a sphere on four legs at the equator, top inlet and low side outlet', () => {
    const d = componentCatalog.sphericalTank;
    expect(portOf('sphericalTank', 'inlet')).toMatchObject({ position: [0, R + 0.2, 0], direction: [0, 1, 0] });
    expect(portOf('sphericalTank', 'outlet')).toMatchObject({ position: [R + 0.2, -0.7 * R, 0], direction: [1, 0, 0] });
    expect(d.parts.filter((p) => p.role === 'shell' && p.shape === 'cylinder' && p.axis === 'y' && p.radius === 0.06)).toHaveLength(4);
    expect(d.bounds.min[1]).toBeCloseTo(-R - 0.5, 12);
  });

  it('holds (4/3)πR³, half at the equator', () => {
    const d = componentCatalog.sphericalTank;
    const v = vesselProfile(d.parts)!;
    expect(v.volumeAt(R) / ((4 / 3) * Math.PI * R ** 3)).toBeCloseTo(1, 3);
    expect(v.volumeAt(0) / v.volumeAt(R)).toBeCloseTo(0.5, 3);
    expect(plateText(d.parts)).toBe('7.24 m³');
    expect(definitionFor('sphericalTank', { diameter: 4 }).bounds.max[1]).toBeCloseTo(2.2, 12);
  });
});

describe('pool (T-056)', () => {
  it('is an open basin on the ground: walls and floor 0.15 m, liquid filling the inside', () => {
    const d = componentCatalog.pool;
    expect(d.bounds).toEqual({ min: [-3.2, 0, -1.5], max: [3.2, 1.2, 1.51] });
    expect(portOf('pool', 'outlet')).toMatchObject({ position: [3.2, 0.45, 0], direction: [1, 0, 0] });
    expect(portOf('pool', 'inlet')).toMatchObject({ position: [-3.2, 0.95, 0], direction: [-1, 0, 0] });
    const v = vesselProfile(d.parts)!;
    expect(v.bottom).toBeCloseTo(0.15, 12);
    expect(v.volumeAt(1.2)).toBeCloseTo(5.7 * 2.7 * 1.05, 9);
    expect(v.volumeAt(0.675) / v.volumeAt(1.2)).toBeCloseTo(0.5, 9);
    expect(plateText(d.parts)).toBe('16.2 m³');
  });

  it('follows length, width and depth', () => {
    const d = definitionFor('pool', { length: 10, width: 4, depth: 2 });
    expect(capacityOf(d.parts)).toBeCloseTo(9.7 * 3.7 * 1.85, 9);
    expect(d.bounds.max).toEqual([5.2, 2, 2.01]);
  });
});

describe('cross-braced stands', () => {
  it('braces the vertical tank stand with an X on each side, and has none without a stand', () => {
    expect(struts(definitionFor('tank', { standHeight: 0.8 }).parts)).toHaveLength(8);
    expect(struts(componentCatalog.tank.parts)).toHaveLength(0);
  });

  it('keeps every strut inside the bounds', () => {
    for (const d of [definitionFor('tank', { standHeight: 1 }), componentCatalog.horizontalTank, componentCatalog.sphericalTank]) {
      for (const s of struts(d.parts)) {
        if (s.shape !== 'strut') continue;
        for (const p of [s.from, s.to]) for (let i = 0; i < 3; i++) {
          expect(p[i]).toBeGreaterThanOrEqual(d.bounds.min[i] - 1e-9);
          expect(p[i]).toBeLessThanOrEqual(d.bounds.max[i] + 1e-9);
        }
      }
    }
  });
});
