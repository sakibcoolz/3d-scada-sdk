import { describe, expect, it } from 'vitest';
import { componentCatalog, type GeometryPart } from './index.js';

type Cylinder = Extract<GeometryPart, { shape: 'cylinder' }>;
type Box = Extract<GeometryPart, { shape: 'box' }>;

describe.each(['tank', 'conicalTank'] as const)('%s level gauge, scale and name plate', (type) => {
  const parts = componentCatalog[type].parts;
  const glass = parts.filter((p): p is Cylinder => p.role === 'gauge' && p.shape === 'cylinder');
  const column = parts.find((p): p is Cylinder => p.role === 'liquid' && p.shape === 'cylinder' && p.radius < 0.1)!;
  const ticks = parts.filter((p): p is Box => p.role === 'scale' && p.shape === 'box');
  const plate = parts.find((p): p is Box => p.role === 'plate' && p.shape === 'box')!;

  it('has one vertical sight glass on the front centre with a liquid column inside it', () => {
    expect(glass).toHaveLength(1);
    expect(glass[0]).toMatchObject({ axis: 'y', center: [0, expect.any(Number), 1.08] });
    expect(column.center).toEqual(glass[0].center);
    expect(column.length).toBeLessThan(glass[0].length);
  });

  it('has eleven ticks every 10 % of the column, longer at 0, 50 and 100 %', () => {
    expect(ticks).toHaveLength(11);
    const bottom = column.center[1] - column.length / 2;
    ticks.forEach((t, i) => expect(t.center[1]).toBeCloseTo(bottom + (i / 10) * column.length, 9));
    const long = ticks.filter((t) => t.size[0] > 0.06).map((t) => ticks.indexOf(t));
    expect(long).toEqual([0, 5, 10]);
    for (const t of ticks) expect(t.center[0] - t.size[0] / 2).toBeGreaterThanOrEqual(0.04);
  });

  it('has a name plate across the middle of the gauge, in front of it', () => {
    expect(plate.center[0]).toBe(0);
    expect(plate.center[2] - plate.size[2] / 2).toBeGreaterThan(1.08 + 0.04 - 1e-9);
    expect(plate.center[1]).toBeGreaterThan(column.center[1] - column.length / 2);
    expect(plate.center[1]).toBeLessThan(column.center[1] + column.length / 2);
  });
});

describe('vertical tank keeps its ports and main liquid', () => {
  it('is unchanged where it matters for connections and level', () => {
    const tank = componentCatalog.tank;
    expect(tank.ports.map((p) => [p.id, p.position, p.direction])).toEqual([
      ['inlet', [-1.2, 0.8, 0], [-1, 0, 0]],
      ['outlet', [1.2, -0.9, 0], [1, 0, 0]],
    ]);
    expect(tank.parts.find((p) => p.role === 'liquid' && p.shape === 'cylinder' && p.radius === 0.94)).toMatchObject({ center: [0, 0, 0], length: 2.93 });
  });
});
