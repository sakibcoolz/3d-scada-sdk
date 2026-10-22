// Seeded fuzzing helpers shared by the security and schema tests. Test-only: excluded from the build.
import type { ComponentType, ConnectionPort, Quantity } from '../scene.js';
import type { SceneValidationOptions } from '../validation.js';

export function rng(seed: number): () => number {
  // mulberry32
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const fluid = (id: string): ConnectionPort => ({ id, kind: 'fluid', position: [0, 0, 0], direction: [1, 0, 0], nominalSize: 0.15 });
const ports: Partial<Record<ComponentType, ConnectionPort[]>> = { tank: [fluid('inlet'), fluid('outlet')], valve: [fluid('in'), fluid('out')] };
const bindable: Partial<Record<ComponentType, Record<string, Quantity>>> = { tank: { level: 'percent' }, valve: { open: 'boolean' } };
export const options: SceneValidationOptions = { resolvePorts: (t) => ports[t], resolveBindable: (t) => bindable[t] };

/** Fresh hostile values per use, so mutations never share (and accidentally cycle) objects across iterations. */
export const hostileValues = (): unknown[] => [
  null, undefined, 0, -0, 1e308, -1, Number.NaN, Number.POSITIVE_INFINITY, '', 'x'.repeat(5000), '<script>alert(1)</script>',
  true, [], [[[]]], {}, { __proto__: { polluted: true } }, JSON.parse('{"__proto__":{"polluted":true}}'), { constructor: { prototype: { polluted: true } } },
  Object.create(null), [1, 2, 3, 4, 5], { toString: 'not a function' }, Symbol('s'), () => 1, 10n,
];
const hostileKeys = ['__proto__', 'constructor', 'prototype', 'toString', 'hasOwnProperty', '', 'id', 'type', 'kind'];

export type Json = Record<string | number, unknown>;

/** Replaces, deletes or adds one random node somewhere in the document. */
export function mutate(doc: Json, next: () => number): void {
  const containers: Json[] = [];
  const seen = new Set<unknown>();
  const walk = (value: unknown) => {
    if (value && typeof value === 'object' && !seen.has(value)) {
      seen.add(value);
      containers.push(value as Json);
      for (const child of Object.values(value)) walk(child);
    }
  };
  walk(doc);
  const target = containers[Math.floor(next() * containers.length)];
  const keys = Object.keys(target);
  const pick = <T,>(list: readonly T[]) => list[Math.floor(next() * list.length)];
  const roll = next();
  const fresh = hostileValues();
  if (roll < 0.6 && keys.length) target[pick(keys)] = pick(fresh);
  else if (roll < 0.8 && keys.length) delete target[pick(keys)];
  else Object.defineProperty(target, pick(hostileKeys), { value: pick(fresh), enumerable: true, writable: true, configurable: true });
}

/** A version 4 document using every v4 field (ADR-0021), for the same mutation fuzzing. */
export const baseV4 = () => ({
  schemaVersion: 4,
  documentType: 'industrial.scene',
  units: 'm',
  project: { id: 'p', name: 'Plant', revision: '1', description: 'd' },
  components: [
    { id: 'tank', name: 'T-101', type: 'tank', typeVersion: '1', manufacturer: 'ACME', model: 'X', position: { x: 0, y: 1.535, z: 0 }, rotation: { x: 0, y: 0, z: 0, w: 1 }, scale: { x: 1, y: 1, z: 1 }, properties: { level: 45 }, labels: { area: 'A', asset: '1' }, extensions: { 'com.example.a': { list: [1, 'two', { three: true }], deep: { a: { b: null } } } } },
    { id: 'valve', type: 'valve', position: { x: 1.8, y: 0.635, z: 0 }, rotation: { x: 0, y: 0, z: 0, w: 1 }, scale: { x: 1, y: 1, z: 1 }, properties: { open: true } },
  ],
  connections: [{ id: 'e1', from: { instanceId: 'tank', portId: 'outlet' }, to: { instanceId: 'valve', portId: 'in' } }],
  tagBindings: [{ id: 'b1', tagId: 'LT-101', kind: 'property', instanceId: 'tank', property: 'level', unit: '%' }],
  extensions: { 'org.example.b': { n: 1, s: 'x', arr: [[], {}] } },
});
