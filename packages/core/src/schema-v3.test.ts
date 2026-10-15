import { describe, expect, it } from 'vitest';
import {
  parseScene,
  quaternionFromEuler,
  serializeScene,
  validateScene,
  type ComponentKind,
  type ConnectionPort,
  type SceneValidationErrorCode,
  type SceneValidationOptions,
} from './index.js';

const fluid = (id: string): ConnectionPort => ({ id, kind: 'fluid', position: [0, 0, 0], direction: [1, 0, 0], nominalSize: 0.15 });
const ports: Partial<Record<ComponentKind, ConnectionPort[]>> = { tank: [fluid('inlet'), fluid('outlet')], valve: [fluid('in'), fluid('out')] };
const options: SceneValidationOptions = { resolvePorts: (t) => ports[t] };

const component = (overrides: Record<string, unknown> = {}) => ({
  id: 'valve',
  type: 'valve',
  position: { x: 1.8, y: 0.635, z: 0 },
  rotation: { x: 0, y: 0, z: 0, w: 1 },
  scale: { x: 1, y: 1, z: 1 },
  properties: {},
  ...overrides,
});
const v3 = (c: Record<string, unknown> = component()) => ({ schemaVersion: 3, units: 'm', components: [c], connections: [] });

function codes(input: unknown): SceneValidationErrorCode[] {
  const result = validateScene(input, options);
  return result.ok ? [] : result.errors.map((e) => e.code);
}

describe('schema version 3: structured vectors', () => {
  it('accepts named position, rotation and scale objects', () => {
    expect(validateScene(v3(), options)).toEqual({ ok: true, scene: v3() });
  });

  it.each([
    ['a position array', { position: [1.8, 0.635, 0] }, 'INVALID_FIELD'],
    ['a missing axis', { position: { x: 1, y: 2 } }, 'INVALID_FIELD'],
    ['a non-finite axis', { position: { x: 1, y: Number.NaN, z: 0 } }, 'INVALID_FIELD'],
    ['a string axis', { scale: { x: '1', y: 1, z: 1 } }, 'INVALID_FIELD'],
    ['an extra axis', { position: { x: 1, y: 2, z: 3, w: 4 } }, 'UNKNOWN_FIELD'],
    ['a non-unit rotation', { rotation: { x: 0, y: 0, z: 0, w: 2 } }, 'INVALID_FIELD'],
    ['a rotation without w', { rotation: { x: 0, y: 0, z: 0 } }, 'INVALID_FIELD'],
    ['a zero scale', { scale: { x: 0, y: 1, z: 1 } }, 'INVALID_FIELD'],
  ])('rejects %s', (_, overrides, code) => {
    expect(codes(v3(component(overrides)))).toEqual([code]);
  });

  it('reports errors on the named axis path', () => {
    const result = validateScene(v3(component({ position: { x: 1, y: Number.NaN, z: 0, q: 1 } })), options);
    expect(result.ok ? [] : result.errors.map((e) => [e.code, e.path])).toEqual([
      ['UNKNOWN_FIELD', 'components[0].position.q'],
      ['INVALID_FIELD', 'components[0].position'],
    ]);
  });

  it('serializes vectors as objects with fixed key order', () => {
    const result = validateScene(v3(component({ position: { z: 0, y: 0.635, x: 1.8 }, rotation: { w: 1, z: 0, y: 0, x: 0 } })), options);
    if (!result.ok) throw new Error('expected valid');
    const text = serializeScene(result.scene);
    expect(text).toContain('"schemaVersion": 3');
    expect(text).toContain('"position": {\n        "x": 1.8,\n        "y": 0.635,\n        "z": 0\n      }');
    expect(text).toContain('"rotation": {\n        "x": 0,\n        "y": 0,\n        "z": 0,\n        "w": 1\n      }');
    expect(text).toContain('"scale": {\n        "x": 1,\n        "y": 1,\n        "z": 1\n      }');
    expect(parseScene(text, options)).toEqual({ ok: true, scene: result.scene });
  });
});

describe('migration to version 3', () => {
  it('migrates a version 2 file with arrays and reports it', () => {
    const q = quaternionFromEuler({ x: 0, y: Math.PI / 2, z: 0 });
    const v2 = {
      schemaVersion: 2,
      units: 'm',
      components: [{ id: 'valve', type: 'valve', position: [1.8, 0.635, 0], rotation: [q.x, q.y, q.z, q.w], scale: [1, 1, 1], properties: {} }],
      connections: [],
      tagBindings: [{ id: 'b', tagId: 'XV-1', kind: 'property', instanceId: 'valve', property: 'open' }],
    };
    expect(validateScene(v2, options)).toEqual({
      ok: true,
      migratedFrom: 2,
      scene: {
        schemaVersion: 3,
        units: 'm',
        components: [component({ rotation: q })],
        connections: [],
        tagBindings: v2.tagBindings,
      },
    });
  });

  it('still validates version 2 arrays strictly before migrating', () => {
    const v2 = { schemaVersion: 2, units: 'm', components: [{ ...component(), position: { x: 1, y: 2, z: 3 } }], connections: [] };
    expect(codes(v2)).toEqual(expect.arrayContaining(['INVALID_FIELD']));
  });

  it('migrates a version 1 file straight to version 3', () => {
    const v1 = { version: 1, components: [{ id: 'valve', kind: 'valve', position: [1, 2, 3], rotation: [0, 0, 0], properties: {} }], connections: [] };
    expect(validateScene(v1, options)).toEqual({
      ok: true,
      migratedFrom: 1,
      scene: { schemaVersion: 3, units: 'm', components: [component({ position: { x: 1, y: 2, z: 3 } })], connections: [] },
    });
  });

  it('saves a migrated file as version 3', () => {
    const v2 = { schemaVersion: 2, units: 'm', components: [{ id: 'valve', type: 'valve', position: [0, 0, 0], rotation: [0, 0, 0, 1], scale: [1, 1, 1], properties: {} }], connections: [] };
    const result = validateScene(v2, options);
    if (!result.ok) throw new Error('expected valid');
    expect(JSON.parse(serializeScene(result.scene))).toEqual(expect.objectContaining({ schemaVersion: 3 }));
  });

  it('rejects an unsupported newer version', () => {
    expect(codes({ schemaVersion: 4, units: 'm', components: [], connections: [] })).toEqual(['UNSUPPORTED_VERSION']);
  });
});
