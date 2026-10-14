import { describe, expect, it } from 'vitest';
import {
  portToWorld,
  quaternionFromEuler,
  validateScene,
  type ComponentKind,
  type ConnectionPort,
  type SceneValidationErrorCode,
  type SceneValidationOptions,
  type Vector3Tuple,
} from './index';

const { PI } = Math;
const fluid = (id: string, position: Vector3Tuple, direction: Vector3Tuple): ConnectionPort => ({
  id,
  kind: 'fluid',
  position,
  direction,
  nominalSize: 0.15,
});
const ports: Partial<Record<ComponentKind, ConnectionPort[]>> = {
  tank: [fluid('inlet', [-1.2, 0.8, 0], [-1, 0, 0]), fluid('outlet', [1.2, -0.9, 0], [1, 0, 0])],
  valve: [fluid('in', [-0.6, 0, 0], [-1, 0, 0]), fluid('out', [0.6, 0, 0], [1, 0, 0])],
};
const options: SceneValidationOptions = { resolvePorts: (type) => ports[type] };

const v2Component = (overrides: Record<string, unknown> = {}) => ({
  id: 'valve',
  type: 'valve',
  position: [0, 0, 0],
  rotation: [0, 0, 0, 1],
  scale: [1, 1, 1],
  properties: {},
  ...overrides,
});
const v2 = (component: Record<string, unknown> = v2Component()) => ({
  schemaVersion: 2,
  units: 'm',
  components: [component],
  connections: [],
});

function codes(input: unknown): SceneValidationErrorCode[] {
  const result = validateScene(input, options);
  return result.ok ? [] : result.errors.map((e) => e.code);
}

describe('version 1 migration', () => {
  const v1 = () => ({
    version: 1,
    components: [
      { id: 'tank', kind: 'tank', position: [0, 1.535, 0], rotation: [0.3, -1.1, 2.4], properties: { level: 60 } },
      { id: 'valve', kind: 'valve', position: [3, 0.6, 0], rotation: [0, PI / 2, 0], properties: { open: true } },
    ],
    connections: [{ id: 'e1', from: { instanceId: 'tank', portId: 'outlet' }, to: { instanceId: 'valve', portId: 'in' } }],
  });

  it('converts kind, Euler rotation and missing scale into a version 2 scene', () => {
    const result = validateScene(v1(), options);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.migratedFrom).toBe(1);
    expect(result.scene).toEqual({
      schemaVersion: 2,
      units: 'm',
      components: [
        { id: 'tank', type: 'tank', position: [0, 1.535, 0], rotation: quaternionFromEuler([0.3, -1.1, 2.4]), scale: [1, 1, 1], properties: { level: 60 } },
        { id: 'valve', type: 'valve', position: [3, 0.6, 0], rotation: quaternionFromEuler([0, PI / 2, 0]), scale: [1, 1, 1], properties: { open: true } },
      ],
      connections: v1().connections,
    });
  });

  it('keeps every world port position and direction', () => {
    const result = validateScene(v1(), options);
    if (!result.ok) throw new Error('expected migration');
    const eulerRotated = (euler: Vector3Tuple, position: Vector3Tuple, port: ConnectionPort) =>
      portToWorld({ position, rotation: quaternionFromEuler(euler) }, port);
    const migratedTank = result.scene.components[0];
    for (const port of ports.tank!) {
      const before = eulerRotated([0.3, -1.1, 2.4], [0, 1.535, 0], port);
      const after = portToWorld(migratedTank, port);
      after.position.forEach((n, i) => expect(n).toBeCloseTo(before.position[i], 12));
      after.direction.forEach((n, i) => expect(n).toBeCloseTo(before.direction[i], 12));
    }
  });

  it('applies the same reference checks to version 1 input', () => {
    const scene = v1();
    scene.connections[0].to.portId = 'drain';
    expect(codes(scene)).toEqual(['UNKNOWN_PORT']);
  });

  it('reports version 1 structure errors on the version 1 field names', () => {
    const scene = v1();
    (scene.components[1] as Record<string, unknown>).rotation = [0, 0, 0, 1];
    const result = validateScene(scene, options);
    expect(result).toEqual({ ok: false, errors: [expect.objectContaining({ code: 'INVALID_FIELD', path: 'components[1].rotation' })] });
  });

  it('rejects version 2 fields inside a version 1 document', () => {
    const scene = v1();
    (scene.components[0] as Record<string, unknown>).scale = [1, 1, 1];
    expect(codes(scene)).toEqual(['UNKNOWN_FIELD']);
  });
});

describe('version 2 documents', () => {
  it('accepts an identity transform', () => {
    expect(validateScene(v2(), options)).toEqual({ ok: true, scene: v2() });
  });

  it.each([
    ['missing units', { units: undefined }],
    ['other units', { units: 'mm' }],
  ])('rejects %s', (_, override) => {
    expect(codes({ ...v2(), ...override })).toEqual(['INVALID_FIELD']);
  });

  it('rejects a document that declares both version fields', () => {
    expect(codes({ ...v2(), version: 1 })).toEqual(['UNKNOWN_FIELD']);
  });

  it.each([2.5, 3, '2'])('rejects unsupported schemaVersion %p', (schemaVersion) => {
    expect(codes({ ...v2(), schemaVersion })).toEqual(['UNSUPPORTED_VERSION']);
  });

  it.each([
    [[0, 0, 0]],
    [[0, 0, 0, 2]],
    [[0, 0, 0, 0]],
    [[0, 0, Number.NaN, 1]],
  ])('rejects rotation %p that is not a unit quaternion', (rotation) => {
    expect(codes(v2(v2Component({ rotation })))).toEqual(['INVALID_FIELD']);
  });

  it('accepts a unit quaternion within rounding of length one', () => {
    const q = quaternionFromEuler([0.7, -0.2, 1.9]);
    expect(codes(v2(v2Component({ rotation: q.map((n) => n * (1 + 1e-9)) })))).toEqual([]);
  });

  it.each([[[0, 1, 1]], [[-1, 1, 1]], [[1, 1]], [[1, Infinity, 1]]])('rejects non-positive or malformed scale %p', (scale) => {
    expect(codes(v2(v2Component({ type: 'sensor', id: 's', scale })))).toEqual(['INVALID_FIELD']);
  });

  it('allows scaling a component without ports', () => {
    expect(codes(v2(v2Component({ type: 'sensor', id: 's', scale: [2, 0.5, 2] })))).toEqual([]);
  });

  it('rejects scaling a component with ports, which would break its nominal bore', () => {
    expect(validateScene(v2(v2Component({ scale: [1, 1, 1.5] })), options)).toEqual({
      ok: false,
      errors: [expect.objectContaining({ code: 'UNSUPPORTED_SCALE', path: 'components[0].scale' })],
    });
  });

  it('rejects the version 1 field name kind', () => {
    const { type, ...rest } = v2Component();
    expect(codes(v2({ ...rest, kind: type }))).toEqual(expect.arrayContaining(['UNKNOWN_FIELD']));
  });
});
