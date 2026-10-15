import { describe, expect, it } from 'vitest';
import {
  createEmptyScene,
  findCollisions,
  quaternionFromEuler,
  type CollisionOptions,
  type ComponentInstance,
  type ComponentKind,
  type ScadaScene,
  type Vector3Tuple,
} from './index.js';

// Box bounds per type, as the catalog provides them (local metres).
const bounds: Partial<Record<ComponentKind, { min: Vector3Tuple; max: Vector3Tuple }>> = {
  tank: { min: [-1.2, -1.535, -1], max: [1.2, 1.535, 1] },
  pipe: { min: [-1, -0.084, -0.084], max: [1, 0.084, 0.084] },
  valve: { min: [-0.6, -0.2, -0.2], max: [0.6, 0.495, 0.2] },
  sensor: { min: [-0.15, -0.3, -0.15], max: [0.15, 0.3, 0.15] },
};
const options: CollisionOptions = { resolveBounds: (t) => bounds[t] };

const at = (id: string, type: ComponentKind, p: Vector3Tuple, euler: Vector3Tuple = [0, 0, 0], scale: Vector3Tuple = [1, 1, 1]): ComponentInstance => ({
  id,
  type,
  position: { x: p[0], y: p[1], z: p[2] },
  rotation: quaternionFromEuler({ x: euler[0], y: euler[1], z: euler[2] }),
  scale: { x: scale[0], y: scale[1], z: scale[2] },
  properties: {},
});
const scene = (...components: ComponentInstance[]): ScadaScene => ({ ...createEmptyScene(), components });
const pairs = (s: ScadaScene, o: CollisionOptions = options) => findCollisions(s, o).pairs.map((p) => [p.a, p.b]);

describe('findCollisions', () => {
  it('finds nothing for separated components', () => {
    expect(findCollisions(scene(at('t1', 'tank', [0, 0, 0]), at('t2', 'tank', [5, 0, 0])), options)).toEqual({ pairs: [], collidingIds: new Set() });
  });

  it('reports overlapping components once, with ids in a stable order', () => {
    const result = findCollisions(scene(at('t2', 'tank', [1, 0, 0]), at('t1', 'tank', [0, 0, 0])), options);
    expect(result.pairs).toEqual([{ a: 't1', b: 't2' }]);
    expect(result.collidingIds).toEqual(new Set(['t1', 't2']));
  });

  it('does not count faces that only touch, such as parts joined at a port', () => {
    // Valve inlet face at x = 1.2 meets the tank outlet face at x = 1.2.
    expect(pairs(scene(at('tank', 'tank', [0, 1.535, 0]), at('valve', 'valve', [1.8, 0.635, 0])))).toEqual([]);
  });

  it('ignores overlap within the tolerance and reports overlap beyond it', () => {
    expect(pairs(scene(at('a', 'sensor', [0, 0, 0]), at('b', 'sensor', [0.2995, 0, 0])))).toEqual([]);
    expect(pairs(scene(at('a', 'sensor', [0, 0, 0]), at('b', 'sensor', [0.298, 0, 0])))).toEqual([['a', 'b']]);
    expect(pairs(scene(at('a', 'sensor', [0, 0, 0]), at('b', 'sensor', [0.298, 0, 0])), { ...options, tolerance: 0.005 })).toEqual([]);
  });

  it('uses the oriented box, not the world-aligned box, for rotated components', () => {
    // A pipe turned 45° about Y lies along the diagonal z = -x.
    const pipe = at('pipe', 'pipe', [0, 0, 0], [0, Math.PI / 4, 0]);
    expect(pairs(scene(pipe, at('off', 'sensor', [0.6, 0, 0.6])))).toEqual([]);
    expect(pairs(scene(pipe, at('on', 'sensor', [0.6, 0, -0.6])))).toEqual([['on', 'pipe']]);
  });

  it('applies scale', () => {
    expect(pairs(scene(at('a', 'sensor', [0, 0, 0]), at('b', 'sensor', [0.5, 0, 0])))).toEqual([]);
    expect(pairs(scene(at('a', 'sensor', [0, 0, 0], [0, 0, 0], [3, 1, 1]), at('b', 'sensor', [0.5, 0, 0])))).toEqual([['a', 'b']]);
  });

  it('reports every pair when several components overlap, in id order', () => {
    expect(pairs(scene(at('c', 'sensor', [0.1, 0, 0]), at('a', 'sensor', [0, 0, 0]), at('b', 'sensor', [0.05, 0, 0])))).toEqual([
      ['a', 'b'],
      ['a', 'c'],
      ['b', 'c'],
    ]);
  });

  it('skips component types without bounds', () => {
    expect(pairs(scene(at('m1', 'motor', [0, 0, 0]), at('m2', 'motor', [0, 0, 0])))).toEqual([]);
  });

  it('agrees with a brute-force check on a seeded random scene', () => {
    let seed = 99;
    const next = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
    const types: ComponentKind[] = ['tank', 'pipe', 'valve', 'sensor'];
    const components = Array.from({ length: 150 }, (_, i) =>
      at(`c${String(i).padStart(3, '0')}`, types[Math.floor(next() * 4)], [next() * 30, next() * 4, next() * 30], [next() * 6, next() * 6, next() * 6]),
    );
    const fast = pairs(scene(...components));
    // Brute force: every pair tested on its own.
    const slow: string[][] = [];
    for (let i = 0; i < components.length; i++)
      for (let j = i + 1; j < components.length; j++)
        if (findCollisions(scene(components[i], components[j]), options).pairs.length) slow.push([components[i].id, components[j].id].sort());
    slow.sort((x, y) => x[0].localeCompare(y[0]) || x[1].localeCompare(y[1]));
    expect(fast).toEqual(slow);
    expect(fast.length).toBeGreaterThan(0);
  });

  it('does not mutate the scene', () => {
    const s = scene(at('a', 'sensor', [0, 0, 0]), at('b', 'sensor', [0.1, 0, 0]));
    const before = structuredClone(s);
    findCollisions(s, options);
    expect(s).toEqual(before);
  });
});
