import { describe, expect, it } from 'vitest';
import {
  createObservationStore,
  parseScene,
  resolveFlow,
  resolveTelemetry,
  serializeScene,
  validateScene,
  type SceneValidationErrorCode,
} from './index.js';

import { baseV4, hostileValues, mutate, options, rng, type Json } from './fixtures/fuzz.js';

// Adversarial input tests for everything that accepts untrusted host or file data. Fuzzing is
// seeded, so any failure reproduces exactly.

const validCodes = new Set<SceneValidationErrorCode>([
  'NOT_AN_OBJECT', 'UNSUPPORTED_VERSION', 'INVALID_FIELD', 'UNKNOWN_FIELD', 'LIMIT_EXCEEDED', 'UNKNOWN_COMPONENT_KIND',
  'DUPLICATE_COMPONENT_ID', 'DUPLICATE_CONNECTION_ID', 'UNKNOWN_INSTANCE', 'UNKNOWN_PORT', 'SELF_CONNECTION', 'INCOMPATIBLE_PORTS',
  'PORT_OCCUPIED', 'DUPLICATE_EDGE', 'UNSUPPORTED_SCALE', 'INVALID_JSON', 'UNKNOWN_CONNECTION', 'UNBINDABLE_PROPERTY',
  'INVALID_UNIT', 'DUPLICATE_BINDING_ID', 'DUPLICATE_BINDING_TARGET', 'SECRET_FIELD',
  'DUPLICATE_DATA_SOURCE_ID', 'DUPLICATE_VARIABLE_ID', 'UNKNOWN_DATA_SOURCE', 'INVALID_ADDRESS',
]);

const base = () => ({
  schemaVersion: 2,
  units: 'm',
  components: [
    { id: 'tank', type: 'tank', position: [0, 1.535, 0], rotation: [0, 0, 0, 1], scale: [1, 1, 1], properties: { level: 45, label: 'T-101' } },
    { id: 'valve', type: 'valve', position: [1.8, 0.635, 0], rotation: [0, 0, 0, 1], scale: [1, 1, 1], properties: { open: true } },
  ],
  connections: [{ id: 'e1', from: { instanceId: 'tank', portId: 'outlet' }, to: { instanceId: 'valve', portId: 'in' } }],
  tagBindings: [
    { id: 'b1', tagId: 'LT-101', kind: 'property', instanceId: 'tank', property: 'level', unit: '%' },
    { id: 'b2', tagId: 'FT-101', kind: 'flow', connectionId: 'e1' },
  ],
});

const hostile = hostileValues();
function expectSafeResult(result: ReturnType<typeof validateScene>): void {
  if (result.ok) {
    // Anything accepted must survive a canonical roundtrip unchanged.
    const text = serializeScene(result.scene);
    expect(parseScene(text, options)).toEqual(expect.objectContaining({ ok: true, scene: result.scene }));
  } else {
    expect(result.errors.length).toBeGreaterThan(0);
    for (const e of result.errors) {
      expect(validCodes.has(e.code)).toBe(true);
      expect(typeof e.path).toBe('string');
      expect(typeof e.message).toBe('string');
    }
  }
}

describe('validateScene against mutated documents', () => {
  it('never throws, pollutes prototypes or accepts an unsafe scene across 3000 seeded mutations', () => {
    const next = rng(20261015);
    for (let i = 0; i < 3000; i++) {
      const doc = base() as unknown as Json;
      const mutations = 1 + Math.floor(next() * 4);
      for (let m = 0; m < mutations; m++) mutate(doc, next);
      let result: ReturnType<typeof validateScene> | undefined;
      expect(() => (result = validateScene(doc, options)), `iteration ${i}`).not.toThrow();
      expectSafeResult(result!);
    }
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
    expect(Object.prototype).not.toHaveProperty('polluted');
  });
});

describe('validateScene against mutated version 4 documents', () => {
  it('never throws, pollutes prototypes or accepts an unsafe scene across 3000 seeded mutations', () => {
    const next = rng(20261022);
    for (let i = 0; i < 3000; i++) {
      const doc = baseV4() as unknown as Json;
      const mutations = 1 + Math.floor(next() * 4);
      for (let m = 0; m < mutations; m++) mutate(doc, next);
      let result: ReturnType<typeof validateScene> | undefined;
      expect(() => (result = validateScene(doc, options)), `iteration ${i}`).not.toThrow();
      expectSafeResult(result!);
    }
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
    expect(Object.prototype).not.toHaveProperty('polluted');
  });
});

describe('parseScene against corrupted text', () => {
  it('never throws on truncated or byte-flipped scene JSON', () => {
    const next = rng(42);
    const valid = validateScene(base(), options);
    if (!valid.ok) throw new Error('expected valid base scene');
    const text = serializeScene(valid.scene);
    for (let i = 0; i < 2000; i++) {
      const chars = [...text];
      const edits = 1 + Math.floor(next() * 6);
      for (let e = 0; e < edits; e++) {
        const at = Math.floor(next() * chars.length);
        const roll = next();
        if (roll < 0.4) chars[at] = String.fromCharCode(32 + Math.floor(next() * 95));
        else if (roll < 0.7) chars.splice(at, 1 + Math.floor(next() * 8));
        else chars.splice(at, 0, pick(['{', '}', '[', ']', '"', ',', ':', '\\u0000', '__proto__', '1e999']));
      }
      const corrupted = next() < 0.1 ? chars.join('').slice(0, Math.floor(next() * chars.length)) : chars.join('');
      let result: ReturnType<typeof parseScene> | undefined;
      expect(() => (result = parseScene(corrupted, options)), `iteration ${i}`).not.toThrow();
      expectSafeResult(result!);
    }
    function pick<T>(list: readonly T[]): T {
      return list[Math.floor(next() * list.length)];
    }
  });
});

describe('prototype pollution', () => {
  it.each([
    ['the document root', '{"__proto__":{"polluted":true},"schemaVersion":2,"units":"m","components":[],"connections":[]}'],
    ['a component', '{"schemaVersion":2,"units":"m","components":[{"__proto__":{"polluted":true},"id":"t","type":"tank","position":[0,0,0],"rotation":[0,0,0,1],"scale":[1,1,1],"properties":{}}],"connections":[]}'],
    ['component properties', '{"schemaVersion":2,"units":"m","components":[{"id":"t","type":"tank","position":[0,0,0],"rotation":[0,0,0,1],"scale":[1,1,1],"properties":{"__proto__":{"polluted":true}}}],"connections":[]}'],
    ['a connection endpoint', '{"schemaVersion":2,"units":"m","components":[],"connections":[{"id":"e","from":{"__proto__":{"polluted":true},"instanceId":"a","portId":"p"},"to":{"instanceId":"b","portId":"p"}}]}'],
    ['a tag binding', '{"schemaVersion":2,"units":"m","components":[],"connections":[],"tagBindings":[{"__proto__":{"polluted":true},"id":"b","tagId":"T","kind":"flow","connectionId":"e"}]}'],
  ])('in %s is rejected or kept as plain data, never applied to Object.prototype', (_, text) => {
    const result = parseScene(text, options);
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
    if (result.ok) for (const c of result.scene.components) expect(Object.getPrototypeOf(c.properties)).toBe(Object.prototype);
  });
});

describe('regressions found by fuzzing', () => {
  const doc = (field: string, value: unknown) => ({
    schemaVersion: 2,
    units: 'm',
    components: [{ id: 's', type: 'sensor', position: [0, 0, 0], rotation: [0, 0, 0, 1], scale: [1, 1, 1], properties: {}, [field]: value }],
    connections: [],
  });
  const holey = (values: number[], hole: number) => {
    const array: unknown[] = [...values];
    delete array[hole];
    return array;
  };

  it.each([
    ['rotation', holey([0, 0, 0, 1], 1)],
    ['position', holey([0, 0, 0], 2)],
    ['scale', holey([1, 1, 1], 0)],
  ])('rejects a sparse %s array instead of accepting a hole', (field, value) => {
    expect(validateScene(doc(field, value), options)).toEqual({ ok: false, errors: [expect.objectContaining({ code: 'INVALID_FIELD', path: `components[0].${field}` })] });
  });

  it('rejects a non-string timestamp instead of throwing', () => {
    const valid = validateScene(base(), options);
    if (!valid.ok) throw new Error('expected valid base scene');
    const symbolTime = [{ tagId: 'LT-101', value: 5, quality: 'GOOD', sourceTimestamp: Symbol('t') }] as never[];
    expect(resolveTelemetry(valid.scene, symbolTime, { now: Date.now(), resolveBindable: options.resolveBindable }).properties[0].reason).toBe('INVALID_TIMESTAMP');
    expect(() => createObservationStore().set(symbolTime)).not.toThrow();
  });
});

describe('resource limits', () => {
  it('rejects a document past the component limit quickly and without validating every item', () => {
    const components = Array.from({ length: 10_001 }, (_, i) => ({ id: `c${i}` }));
    const started = performance.now();
    const result = validateScene({ schemaVersion: 2, units: 'm', components, connections: [] }, options);
    expect(result).toEqual({ ok: false, errors: [expect.objectContaining({ code: 'LIMIT_EXCEEDED', path: 'components' })] });
    expect(performance.now() - started).toBeLessThan(200);
  });

  it('handles deeply nested JSON without a stack overflow', () => {
    const deep = `${'['.repeat(100_000)}${']'.repeat(100_000)}`;
    expect(() => parseScene(`{"schemaVersion":2,"units":"m","components":${deep},"connections":[]}`, options)).not.toThrow();
  });

  it('bounds the observation store against a flood of distinct tags', () => {
    const store = createObservationStore({ maxTags: 1000 });
    const flood = Array.from({ length: 50_000 }, (_, i) => ({ tagId: `T${i}`, value: i, quality: 'GOOD' as const, sourceTimestamp: '2026-10-15T12:00:00Z' }));
    expect(store.set(flood)).toBe(1000);
    expect(store.get()).toHaveLength(1000);
  });
});

describe('runtime resolvers against hostile host data', () => {
  it('never throw on observations and readings of the wrong shape', () => {
    const valid = validateScene(base(), options);
    if (!valid.ok) throw new Error('expected valid base scene');
    const next = rng(7);
    for (let i = 0; i < 1000; i++) {
      const junk = Array.from({ length: 5 }, () => ({
        tagId: next() < 0.5 ? 'LT-101' : 'FT-101',
        connectionId: 'e1',
        value: hostile[Math.floor(next() * hostile.length)],
        rate: hostile[Math.floor(next() * hostile.length)],
        quality: hostile[Math.floor(next() * hostile.length)],
        source: next() < 0.5 ? 'MEASURED' : hostile[Math.floor(next() * hostile.length)],
        sourceTimestamp: hostile[Math.floor(next() * hostile.length)],
        unit: hostile[Math.floor(next() * hostile.length)],
      })) as never[];
      expect(() => resolveTelemetry(valid.scene, junk, { now: Date.now(), resolveBindable: options.resolveBindable })).not.toThrow();
      expect(() => resolveFlow(valid.scene, junk, { now: Date.now() })).not.toThrow();
    }
  });
});

describe('sparse arrays', () => {
  it('reports a hole in a list as an invalid entry, as JSON null would be', () => {
    const doc = { ...baseV4(), tagBindings: [, { id: 'b1', tagId: 'LT-101', kind: 'property', instanceId: 'tank', property: 'level' }] };
    const result = validateScene(doc, options);
    expect(result.ok ? [] : result.errors.map((e) => [e.code, e.path])).toEqual([['INVALID_FIELD', 'tagBindings[0]']]);
  });
});
