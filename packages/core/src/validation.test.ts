import { describe, expect, it } from 'vitest';
import {
  validateScene,
  type ComponentKind,
  type ConnectionPort,
  type SceneValidationErrorCode,
  type SceneValidationOptions,
} from './index';

const fluidPort = (id: string, nominalSize = 0.15): ConnectionPort => ({
  id,
  kind: 'fluid',
  position: [0, 0, 0],
  direction: [1, 0, 0],
  nominalSize,
});

const ports: Partial<Record<ComponentKind, ConnectionPort[]>> = {
  tank: [fluidPort('inlet'), fluidPort('outlet')],
  valve: [fluidPort('in'), fluidPort('out')],
  pipe: [fluidPort('in', 0.2), fluidPort('out', 0.2)],
  tee: [fluidPort('left'), fluidPort('right'), fluidPort('branch')],
  sensor: [{ id: 'signal', kind: 'signal', position: [0, 0, 0], direction: [0, 1, 0] }],
};

const options: SceneValidationOptions = { resolvePorts: (kind) => ports[kind] };

const component = (id: string, kind: ComponentKind) => ({
  id,
  kind,
  position: [0, 0, 0],
  rotation: [0, 0, 0],
  properties: {},
});

const edge = (id: string, from: [string, string], to: [string, string]) => ({
  id,
  from: { instanceId: from[0], portId: from[1] },
  to: { instanceId: to[0], portId: to[1] },
});

const validScene = () => ({
  version: 1,
  components: [component('tank-1', 'tank'), component('valve-1', 'valve'), component('tee-1', 'tee')],
  connections: [
    edge('e1', ['tank-1', 'outlet'], ['valve-1', 'in']),
    edge('e2', ['valve-1', 'out'], ['tee-1', 'left']),
  ],
});

function codes(input: unknown): SceneValidationErrorCode[] {
  const result = validateScene(input, options);
  return result.ok ? [] : result.errors.map((e) => e.code);
}

describe('validateScene: accepted scenes', () => {
  it('accepts an empty scene', () => {
    expect(validateScene({ version: 1, components: [], connections: [] }, options)).toEqual({
      ok: true,
      scene: { version: 1, components: [], connections: [] },
    });
  });

  it('accepts a connected tank -> valve -> tee scene', () => {
    const result = validateScene(validScene(), options);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.scene).toEqual(validScene());
  });

  it('accepts string, number and boolean properties', () => {
    const scene = validScene();
    scene.components[0].properties = { level: 45, open: true, label: 'T-101' };
    expect(codes(scene)).toEqual([]);
  });

  it('keeps a "__proto__" property key as data', () => {
    const scene = JSON.parse(JSON.stringify(validScene()).replace('"properties":{}', '"properties":{"__proto__":5}'));
    const result = validateScene(scene, options);
    if (!result.ok) throw new Error('expected valid scene');
    expect(Object.keys(result.scene.components[0].properties)).toEqual(['__proto__']);
    expect(Object.getPrototypeOf(result.scene.components[0].properties)).toBe(Object.prototype);
  });

  it('returns a copy that does not share structure with the input', () => {
    const input = validScene();
    const result = validateScene(input, options);
    if (!result.ok) throw new Error('expected valid scene');
    input.components[0].position[0] = 99;
    input.connections[0].from.portId = 'inlet';
    expect(result.scene.components[0].position[0]).toBe(0);
    expect(result.scene.connections[0].from.portId).toBe('outlet');
  });

  it('does not mutate the input', () => {
    const input = validScene();
    const snapshot = structuredClone(input);
    validateScene(input, options);
    expect(input).toEqual(snapshot);
  });
});

describe('validateScene: document structure', () => {
  it.each([null, undefined, 42, 'scene', []])('rejects a non-object root %p', (input) => {
    expect(codes(input)).toEqual(['NOT_AN_OBJECT']);
  });

  it.each([0, 2, '1', undefined])('rejects unsupported version %p', (version) => {
    expect(codes({ version, components: [], connections: [] })).toContain('UNSUPPORTED_VERSION');
  });

  it('rejects missing component and connection arrays', () => {
    const result = validateScene({ version: 1 }, options);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.map((e) => [e.code, e.path])).toEqual([
        ['INVALID_FIELD', 'components'],
        ['INVALID_FIELD', 'connections'],
      ]);
    }
  });

  it('rejects unknown fields instead of silently dropping them', () => {
    expect(codes({ ...validScene(), camera: [1, 2, 3] })).toEqual(['UNKNOWN_FIELD']);
    const scene: Record<string, unknown> = validScene();
    (scene.components as Record<string, unknown>[])[0].selected = true;
    expect(codes(scene)).toEqual(['UNKNOWN_FIELD']);
  });
});

describe('validateScene: components', () => {
  it('rejects an unknown component kind', () => {
    const scene = validScene();
    scene.components.push(component('x-1', 'reactor' as ComponentKind));
    expect(codes(scene)).toEqual(['UNKNOWN_COMPONENT_KIND']);
  });

  it.each(['', 7, undefined])('rejects invalid component id %p', (id) => {
    const scene: Record<string, unknown> = validScene();
    (scene.components as Record<string, unknown>[])[0].id = id;
    expect(codes(scene)).toContain('INVALID_FIELD');
  });

  it('rejects duplicate component ids', () => {
    const scene = validScene();
    scene.components.push(component('tank-1', 'pipe'));
    const result = validateScene(scene, options);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors).toEqual([
        expect.objectContaining({ code: 'DUPLICATE_COMPONENT_ID', path: 'components[3].id' }),
      ]);
    }
  });

  it.each([
    ['position', [0, 0]],
    ['position', [0, Number.NaN, 0]],
    ['position', [0, Number.POSITIVE_INFINITY, 0]],
    ['rotation', [0, 0, '1']],
    ['rotation', [0, 0, 0, 1]],
  ])('rejects malformed %s %p', (field, value) => {
    const scene: Record<string, unknown> = validScene();
    (scene.components as Record<string, unknown>[])[1][field] = value;
    expect(codes(scene)).toEqual(['INVALID_FIELD']);
  });

  it.each([{ nested: { a: 1 } }, { list: [1] }, { nan: Number.NaN }, { nil: null }])(
    'rejects unsupported property value %p',
    (properties) => {
      const scene: Record<string, unknown> = validScene();
      (scene.components as Record<string, unknown>[])[0].properties = properties;
      expect(codes(scene)).toEqual(['INVALID_FIELD']);
    },
  );
});

describe('validateScene: connections', () => {
  it('rejects duplicate connection ids', () => {
    const scene = validScene();
    scene.connections[1].id = 'e1';
    expect(codes(scene)).toEqual(['DUPLICATE_CONNECTION_ID']);
  });

  it('rejects an endpoint referencing a missing instance', () => {
    const scene = validScene();
    scene.connections.push(edge('e3', ['tee-1', 'branch'], ['ghost', 'in']));
    const result = validateScene(scene, options);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors).toEqual([
        expect.objectContaining({ code: 'UNKNOWN_INSTANCE', path: 'connections[2].to.instanceId' }),
      ]);
    }
  });

  it('rejects an endpoint referencing an undeclared port', () => {
    const scene = validScene();
    scene.connections[0].from.portId = 'drain';
    expect(codes(scene)).toEqual(['UNKNOWN_PORT']);
  });

  it('rejects a component kind without ports when it is connected', () => {
    const scene = validScene();
    scene.components.push(component('pump-1', 'pump'));
    scene.connections.push(edge('e3', ['tee-1', 'branch'], ['pump-1', 'in']));
    expect(codes(scene)).toEqual(['UNKNOWN_PORT']);
  });

  it('rejects connecting a component to itself', () => {
    const scene = validScene();
    scene.connections.push(edge('e3', ['tee-1', 'right'], ['tee-1', 'branch']));
    expect(codes(scene)).toEqual(['SELF_CONNECTION']);
  });

  it('rejects a port domain mismatch', () => {
    const scene = validScene();
    scene.components.push(component('sensor-1', 'sensor'));
    scene.connections.push(edge('e3', ['tee-1', 'branch'], ['sensor-1', 'signal']));
    expect(codes(scene)).toEqual(['INCOMPATIBLE_PORTS']);
  });

  it('rejects a nominal bore mismatch', () => {
    const scene = validScene();
    scene.components.push(component('pipe-1', 'pipe'));
    scene.connections.push(edge('e3', ['tee-1', 'branch'], ['pipe-1', 'in']));
    expect(codes(scene)).toEqual(['INCOMPATIBLE_PORTS']);
  });

  it('rejects a second edge on an occupied port', () => {
    const scene = validScene();
    scene.components.push(component('valve-2', 'valve'));
    scene.connections.push(edge('e3', ['valve-2', 'out'], ['tank-1', 'outlet']));
    const result = validateScene(scene, options);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors).toEqual([
        expect.objectContaining({ code: 'PORT_OCCUPIED', path: 'connections[2].to' }),
      ]);
    }
  });

  it('rejects the same pair connected twice, in either direction', () => {
    const scene = validScene();
    scene.connections.push(edge('e3', ['valve-1', 'in'], ['tank-1', 'outlet']));
    expect(codes(scene)).toEqual(['DUPLICATE_EDGE']);
  });

  it('allows a tee to branch to two outlets', () => {
    const scene = validScene();
    scene.components.push(component('valve-a', 'valve'), component('valve-b', 'valve'));
    scene.connections.push(
      edge('e3', ['tee-1', 'right'], ['valve-a', 'in']),
      edge('e4', ['tee-1', 'branch'], ['valve-b', 'in']),
    );
    expect(codes(scene)).toEqual([]);
  });

  it('allows a closed loop of components', () => {
    const scene = {
      version: 1,
      components: [component('a', 'valve'), component('b', 'valve')],
      connections: [edge('e1', ['a', 'out'], ['b', 'in']), edge('e2', ['b', 'out'], ['a', 'in'])],
    };
    expect(codes(scene)).toEqual([]);
  });

  it('skips reference checks while the structure is invalid', () => {
    const scene: Record<string, unknown> = validScene();
    (scene.components as Record<string, unknown>[])[0].position = 'here';
    expect(codes(scene)).toEqual(['INVALID_FIELD']);
  });
});

describe('validateScene: limits', () => {
  it('rejects more components than the limit', () => {
    const scene = { version: 1, components: [component('a', 'valve'), component('b', 'valve')], connections: [] };
    expect(validateScene(scene, { ...options, limits: { maxComponents: 1 } })).toEqual({
      ok: false,
      errors: [expect.objectContaining({ code: 'LIMIT_EXCEEDED', path: 'components' })],
    });
  });

  it('rejects more connections than the limit', () => {
    const result = validateScene(validScene(), { ...options, limits: { maxConnections: 1 } });
    expect(result.ok ? [] : result.errors.map((e) => e.code)).toEqual(['LIMIT_EXCEEDED']);
  });

  it('rejects ids longer than the limit', () => {
    const scene = validScene();
    scene.components[0].id = 'x'.repeat(129);
    expect(codes(scene)).toContain('LIMIT_EXCEEDED');
  });

  it('rejects too many properties on one component', () => {
    const scene = validScene();
    scene.components[0].properties = Object.fromEntries(Array.from({ length: 65 }, (_, i) => [`p${i}`, i]));
    expect(codes(scene)).toEqual(['LIMIT_EXCEEDED']);
  });

  it('rejects string property values longer than the limit', () => {
    const scene = validScene();
    scene.components[0].properties = { label: 'x'.repeat(1025) };
    expect(codes(scene)).toEqual(['LIMIT_EXCEEDED']);
  });
});
