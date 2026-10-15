import { describe, expect, it } from 'vitest';
import {
  assemblyOf,
  createEmptyScene,
  lockConnectedAsChildren,
  moveAssembly,
  parseScene,
  portToWorld,
  quaternionFromEuler,
  removeComponent,
  serializeScene,
  unlockFromParent,
  validateScene,
  type ComponentInstance,
  type ComponentKind,
  type ConnectionPort,
  type ScadaScene,
  type Vector3Tuple,
} from './index.js';

const fluid = (id: string, x: number, dir: 1 | -1): ConnectionPort => ({ id, kind: 'fluid', position: [x, 0, 0], direction: [dir, 0, 0], nominalSize: 0.15 });
const ports: Partial<Record<ComponentKind, ConnectionPort[]>> = { pipe: [fluid('in', -1, -1), fluid('out', 1, 1)], valve: [fluid('in', -0.6, -1), fluid('out', 0.6, 1)] };
const options = { resolvePorts: (t: ComponentKind) => ports[t] };

const at = (id: string, type: ComponentKind, p: Vector3Tuple, parentId?: string): ComponentInstance => ({
  id,
  type,
  ...(parentId ? { parentId } : {}),
  position: { x: p[0], y: p[1], z: p[2] },
  rotation: { x: 0, y: 0, z: 0, w: 1 },
  scale: { x: 1, y: 1, z: 1 },
  properties: {},
});
const edge = (id: string, a: [string, string], b: [string, string]) => ({ id, from: { instanceId: a[0], portId: a[1] }, to: { instanceId: b[0], portId: b[1] } });

/** pipe a → valve b → pipe c, joined port to port; d stands apart. */
const chain = (): ScadaScene => ({
  ...createEmptyScene(),
  components: [at('a', 'pipe', [0, 0, 0]), at('b', 'valve', [1.6, 0, 0]), at('c', 'pipe', [3.2, 0, 0]), at('d', 'valve', [10, 0, 0])],
  connections: [edge('e1', ['a', 'out'], ['b', 'in']), edge('e2', ['b', 'out'], ['c', 'in'])],
});

const codes = (s: unknown) => {
  const r = validateScene(s, options);
  return r.ok ? [] : r.errors.map((e) => e.code);
};

describe('parentId in scene files', () => {
  it('accepts children pointing at a parent and keeps parentId on save and load', () => {
    const s: ScadaScene = { ...chain(), components: [at('a', 'pipe', [0, 0, 0]), at('b', 'valve', [1.6, 0, 0], 'a'), at('c', 'pipe', [3.2, 0, 0], 'a')] };
    const text = serializeScene(s);
    expect(text).toContain('"type": "valve",\n      "parentId": "a",');
    expect(parseScene(text, options)).toEqual({ ok: true, scene: s });
  });

  it.each([
    ['an unknown parent', [at('a', 'pipe', [0, 0, 0], 'ghost')], 'UNKNOWN_PARENT'],
    ['a component that is its own parent', [at('a', 'pipe', [0, 0, 0], 'a')], 'PARENT_CYCLE'],
    ['a parent cycle', [at('a', 'pipe', [0, 0, 0], 'b'), at('b', 'valve', [5, 0, 0], 'a')], 'PARENT_CYCLE'],
  ])('rejects %s', (_, components, code) => {
    expect(codes({ ...createEmptyScene(), components })).toContain(code);
  });

  it('rejects a parentId that is not a non-empty string', () => {
    expect(codes({ ...createEmptyScene(), components: [{ ...at('a', 'pipe', [0, 0, 0]), parentId: 7 }] })).toEqual(['INVALID_FIELD']);
  });
});

describe('assemblies', () => {
  const locked = () => {
    const r = lockConnectedAsChildren(chain(), 'a');
    if (!r.ok) throw new Error(r.error.message);
    return r.scene;
  };

  it('locks every connected component to the chosen parent, and nothing else', () => {
    const s = locked();
    expect(s.components.map((c) => [c.id, c.parentId])).toEqual([
      ['a', undefined],
      ['b', 'a'],
      ['c', 'a'],
      ['d', undefined],
    ]);
    expect(assemblyOf(s, 'c')).toEqual(['a', 'b', 'c']);
    expect(assemblyOf(s, 'd')).toEqual(['d']);
  });

  it('makes the chosen component the root even if it was a child before', () => {
    const first = lockConnectedAsChildren(chain(), 'a');
    if (!first.ok) throw new Error();
    const again = lockConnectedAsChildren(first.scene, 'b');
    if (!again.ok) throw new Error();
    expect(again.scene.components.map((c) => [c.id, c.parentId])).toEqual([
      ['a', 'b'],
      ['b', undefined],
      ['c', 'b'],
      ['d', undefined],
    ]);
  });

  it('refuses to lock a component with nothing connected', () => {
    expect(lockConnectedAsChildren(chain(), 'd')).toEqual({ ok: false, error: expect.objectContaining({ code: 'NOTHING_CONNECTED' }) });
  });

  it('moves the whole assembly rigidly when any member moves', () => {
    const s = locked();
    const moved = moveAssembly(s, 'b', { x: 3.6, y: 1, z: -2 }, s.components[1].rotation);
    expect(moved.components.map((c) => [c.id, c.position])).toEqual([
      ['a', { x: 2, y: 1, z: -2 }],
      ['b', { x: 3.6, y: 1, z: -2 }],
      ['c', { x: 5.2, y: 1, z: -2 }],
      ['d', { x: 10, y: 0, z: 0 }],
    ]);
  });

  it('rotates the whole assembly about the moved member and keeps joined ports joined', () => {
    const s = locked();
    const turn = quaternionFromEuler({ x: 0, y: Math.PI / 2, z: 0 });
    const moved = moveAssembly(s, 'a', s.components[0].position, turn);
    const world = (id: string, port: number) => {
      const c = moved.components.find((x) => x.id === id)!;
      return portToWorld(c, ports[c.type]![port]).position;
    };
    world('a', 1).forEach((n, i) => expect(n).toBeCloseTo(world('b', 0)[i], 9));
    world('b', 1).forEach((n, i) => expect(n).toBeCloseTo(world('c', 0)[i], 9));
    // Turned +90° about Y around a's origin: b's centre goes from (1.6, 0, 0) to (0, 0, -1.6).
    const b = moved.components[1].position;
    expect(b.x).toBeCloseTo(0, 9);
    expect(b.z).toBeCloseTo(-1.6, 9);
  });

  it('moves only the component itself when it is not in an assembly', () => {
    const moved = moveAssembly(chain(), 'b', { x: 9, y: 9, z: 9 }, { x: 0, y: 0, z: 0, w: 1 });
    expect(moved.components.map((c) => c.position.x)).toEqual([0, 9, 3.2, 10]);
  });

  it('unlocks a single child, or a whole assembly from its parent', () => {
    const s = locked();
    expect(unlockFromParent(s, 'b').components.map((c) => c.parentId)).toEqual([undefined, undefined, 'a', undefined]);
    expect(unlockFromParent(s, 'a').components.map((c) => c.parentId)).toEqual([undefined, undefined, undefined, undefined]);
  });

  it('frees the children when their parent is removed', () => {
    const r = removeComponent(locked(), 'a');
    if (!r.ok) throw new Error();
    expect(r.scene.components.map((c) => [c.id, c.parentId])).toEqual([
      ['b', undefined],
      ['c', undefined],
      ['d', undefined],
    ]);
    expect(validateScene(r.scene, options).ok).toBe(true);
  });

  it('never mutates its input', () => {
    const s = locked();
    const before = structuredClone(s);
    moveAssembly(s, 'b', { x: 1, y: 2, z: 3 }, s.components[1].rotation);
    unlockFromParent(s, 'a');
    lockConnectedAsChildren(s, 'c');
    expect(s).toEqual(before);
  });
});
