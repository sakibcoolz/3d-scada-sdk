import { describe, expect, it } from 'vitest';
import {
  connectTouchingPorts,
  createEmptyScene,
  findTouchingPorts,
  quaternionFromEuler,
  validateScene,
  type ComponentInstance,
  type ComponentKind,
  type ConnectionPort,
  type ScadaScene,
  type Vector3Tuple,
} from './index';

const fluid = (id: string, x: number, dir: 1 | -1, nominalSize = 0.15): ConnectionPort => ({ id, kind: 'fluid', position: [x, 0, 0], direction: [dir, 0, 0], nominalSize });
const ports: Partial<Record<ComponentKind, ConnectionPort[]>> = {
  pipe: [fluid('in', -1, -1), fluid('out', 1, 1)],
  valve: [fluid('in', -0.6, -1), fluid('out', 0.6, 1)],
  pump: [fluid('suction', -0.6, -1, 0.2), fluid('discharge', 0.6, 1, 0.2)],
};
const options = { resolvePorts: (t: ComponentKind) => ports[t] };

const at = (id: string, type: ComponentKind, p: Vector3Tuple, yawDeg = 0): ComponentInstance => ({
  id,
  type,
  position: { x: p[0], y: p[1], z: p[2] },
  rotation: quaternionFromEuler({ x: 0, y: (yawDeg * Math.PI) / 180, z: 0 }),
  scale: { x: 1, y: 1, z: 1 },
  properties: {},
});
const scene = (...components: ComponentInstance[]): ScadaScene => ({ ...createEmptyScene(), components });
const pairs = (s: ScadaScene, o = {}) => findTouchingPorts(s, { ...options, ...o }).matches.map((m) => `${m.from.instanceId}.${m.from.portId}-${m.to.instanceId}.${m.to.portId}`);

describe('findTouchingPorts', () => {
  it('matches two free ports that meet face to face', () => {
    // pipe a out at x = 1 facing +X; valve b in at x = 1 facing -X.
    expect(pairs(scene(at('a', 'pipe', [0, 0, 0]), at('b', 'valve', [1.6, 0, 0])))).toEqual(['a.out-b.in']);
  });

  it('ignores ports that are close but not at the same point', () => {
    expect(pairs(scene(at('a', 'pipe', [0, 0, 0]), at('b', 'valve', [1.602, 0, 0])))).toEqual([]);
    expect(pairs(scene(at('a', 'pipe', [0, 0, 0]), at('b', 'valve', [1.602, 0, 0])), { tolerance: 0.005 })).toEqual(['a.out-b.in']);
  });

  it('ignores ports at the same point that do not face each other', () => {
    // b turned 90°: its inlet sits on a.out but faces sideways.
    const b = at('b', 'valve', [1, 0, -0.6], 90);
    expect(pairs(scene(at('a', 'pipe', [0, 0, 0]), b))).toEqual([]);
  });

  it('ignores ports at the same point facing the same way', () => {
    // b turned 180°: its outlet sits on a.out and also faces +X.
    expect(pairs(scene(at('a', 'pipe', [0, 0, 0]), at('b', 'valve', [0.4, 0, 0], 180)))).toEqual([]);
  });

  it('reports a touching pair with a different bore instead of joining it', () => {
    const result = findTouchingPorts(scene(at('a', 'pipe', [0, 0, 0]), at('p', 'pump', [1.6, 0, 0])), options);
    expect(result.matches).toEqual([]);
    expect(result.rejected).toEqual([
      { from: { instanceId: 'a', portId: 'out' }, to: { instanceId: 'p', portId: 'suction' }, reason: 'incompatible' },
    ]);
  });

  it('skips ports that are already connected', () => {
    const s: ScadaScene = {
      ...scene(at('a', 'pipe', [0, 0, 0]), at('b', 'valve', [1.6, 0, 0]), at('c', 'valve', [5, 0, 0])),
      connections: [{ id: 'e', from: { instanceId: 'a', portId: 'out' }, to: { instanceId: 'c', portId: 'in' } }],
    };
    expect(findTouchingPorts(s, options)).toEqual({
      matches: [],
      rejected: [{ from: { instanceId: 'a', portId: 'out' }, to: { instanceId: 'b', portId: 'in' }, reason: 'occupied' }],
    });
  });

  it('skips a pair that is already connected to each other instead of reporting it', () => {
    const s: ScadaScene = {
      ...scene(at('a', 'pipe', [0, 0, 0]), at('b', 'valve', [1.6, 0, 0]), at('c', 'pipe', [3.2, 0, 0])),
      // a–b already joined (written either way round); b–c touching but not yet joined.
      connections: [{ id: 'e', from: { instanceId: 'b', portId: 'in' }, to: { instanceId: 'a', portId: 'out' } }],
    };
    expect(findTouchingPorts(s, options)).toEqual({
      matches: [{ from: { instanceId: 'b', portId: 'out' }, to: { instanceId: 'c', portId: 'in' } }],
      rejected: [],
    });
  });

  it('reports a port that touches two candidates as ambiguous and joins neither', () => {
    // Two valves both put an inlet on the pipe outlet.
    const result = findTouchingPorts(scene(at('a', 'pipe', [0, 0, 0]), at('b', 'valve', [1.6, 0, 0]), at('c', 'valve', [1.6, 0, 0])), options);
    expect(result.matches).toEqual([]);
    expect(result.rejected.map((r) => r.reason)).toEqual(['ambiguous', 'ambiguous']);
  });

  it('lists matches in a stable order whatever the component order', () => {
    const parts = [at('a', 'pipe', [0, 0, 0]), at('b', 'valve', [1.6, 0, 0]), at('c', 'pipe', [3.2, 0, 0])];
    expect(pairs(scene(...parts))).toEqual(['a.out-b.in', 'b.out-c.in']);
    expect(pairs(scene(...[...parts].reverse()))).toEqual(['a.out-b.in', 'b.out-c.in']);
  });
});

describe('connectTouchingPorts', () => {
  const chain = () => scene(at('a', 'pipe', [0, 0, 0]), at('b', 'valve', [1.6, 0, 0]), at('c', 'pipe', [3.2, 0, 0]));
  let n = 0;
  const createId = () => `t${++n}`;

  it('adds every match as a validated connection and reports them', () => {
    n = 0;
    const result = connectTouchingPorts(chain(), { ...options, createId });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.added).toBe(2);
    expect(result.scene.connections).toEqual([
      { id: 't1', from: { instanceId: 'a', portId: 'out' }, to: { instanceId: 'b', portId: 'in' } },
      { id: 't2', from: { instanceId: 'b', portId: 'out' }, to: { instanceId: 'c', portId: 'in' } },
    ]);
    expect(validateScene(result.scene, options).ok).toBe(true);
  });

  it('is idempotent: running it again adds nothing', () => {
    const first = connectTouchingPorts(chain(), { ...options, createId });
    if (!first.ok) throw new Error('expected ok');
    const second = connectTouchingPorts(first.scene, { ...options, createId });
    expect(second).toEqual(expect.objectContaining({ ok: true, added: 0, scene: first.scene }));
  });

  it('does not mutate the input scene', () => {
    const s = chain();
    const before = structuredClone(s);
    connectTouchingPorts(s, { ...options, createId });
    expect(s).toEqual(before);
  });
});
