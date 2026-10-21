import { describe, expect, it } from 'vitest';
import { quaternionFromEuler, type ComponentInstance, type ScadaScene } from '@sakibcoolz/core';
import { catalogResolvers } from '@sakibcoolz/components';
import { FLOOR_MARGIN, FLOOR_MIN_SIDE, floorSlab } from './floor.js';

const I = { x: 0, y: 0, z: 0, w: 1 };
const part = (id: string, type: ComponentInstance['type'], x: number, z: number, properties = {}, rotation = I): ComponentInstance =>
  ({ id, type, position: { x, y: 0.5, z }, rotation, scale: { x: 1, y: 1, z: 1 }, properties });
const scene = (components: ComponentInstance[]): ScadaScene => ({ schemaVersion: 3, units: 'm', components, connections: [] });

describe('floorSlab', () => {
  it('gives an empty scene the minimum slab at the origin', () => {
    expect(floorSlab(scene([]))).toEqual({ centre: { x: 0, z: 0 }, width: FLOOR_MIN_SIDE, depth: FLOOR_MIN_SIDE });
  });

  it('covers a long line with the margin on every side, in whole metres', () => {
    const slab = floorSlab(scene([part('a', 'pipe', -20, 0, { length: 2 }), part('b', 'pipe', 30, 4, { length: 2 })]));
    const pipe = catalogResolvers.resolveBounds('pipe', { length: 2 })!;
    expect(slab.centre.x - slab.width / 2).toBeLessThanOrEqual(-20 + pipe.min[0] - FLOOR_MARGIN);
    expect(slab.centre.x + slab.width / 2).toBeGreaterThanOrEqual(30 + pipe.max[0] + FLOOR_MARGIN);
    expect(Number.isInteger(slab.width) && Number.isInteger(slab.depth)).toBe(true);
    expect(slab.depth).toBe(FLOOR_MIN_SIDE);
  });

  it('follows a component turned a quarter turn', () => {
    const long = part('p', 'pipe', 0, 0, { length: 20 }, quaternionFromEuler({ x: 0, y: Math.PI / 2, z: 0 }));
    const slab = floorSlab(scene([long]));
    expect(slab.depth).toBeGreaterThanOrEqual(20 + 2 * FLOOR_MARGIN);
    expect(slab.width).toBe(FLOOR_MIN_SIDE);
  });

  it('does not resize for a move smaller than the rounding', () => {
    const at = (x: number) => floorSlab(scene([part('t', 'tank', x, 0), part('u', 'tank', 25, 0)]));
    expect(at(0.0)).toEqual(at(0.01));
  });
});
