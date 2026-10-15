import { describe, expect, it } from 'vitest';
import { findOpenJoints, seatOnConnection } from './joints.js';
import { portToWorld } from './transforms.js';
import { quaternionFromEuler } from './rotation.js';
import type { ComponentInstance, ConnectionPort, ScadaScene, SceneConnection } from './scene.js';

// Minimal catalog: a 1 m straight "pipe" (in at -X, out at +X) and a "tee" with an up branch.
const fluid = (id: string, position: [number, number, number], direction: [number, number, number]): ConnectionPort => ({ id, kind: 'fluid', position, direction, nominalSize: 0.15 });
const ports: Record<string, ConnectionPort[]> = {
  pipe: [fluid('in', [-0.5, 0, 0], [-1, 0, 0]), fluid('out', [0.5, 0, 0], [1, 0, 0])],
  tee: [fluid('left', [-1, 0, 0], [-1, 0, 0]), fluid('right', [1, 0, 0], [1, 0, 0]), fluid('branch', [0, 1, 0], [0, 1, 0])],
};
const resolvePorts = (type: string) => ports[type];
const options = { resolvePorts };

const part = (id: string, type: 'pipe' | 'tee', x: number, y = 0, z = 0, extra: Partial<ComponentInstance> = {}): ComponentInstance => ({
  id,
  type,
  position: { x, y, z },
  rotation: { x: 0, y: 0, z: 0, w: 1 },
  scale: { x: 1, y: 1, z: 1 },
  properties: {},
  ...extra,
});
const joint = (id: string, a: string, ap: string, b: string, bp: string): SceneConnection => ({ id, from: { instanceId: a, portId: ap }, to: { instanceId: b, portId: bp } });
const scene = (components: ComponentInstance[], connections: SceneConnection[]): ScadaScene => ({ schemaVersion: 3, units: 'm', components, connections });
const world = (s: ScadaScene, id: string, portId: string) => {
  const c = s.components.find((x) => x.id === id)!;
  return portToWorld(c, ports[c.type].find((p) => p.id === portId)!);
};

describe('findOpenJoints', () => {
  it('reports nothing for ports that meet exactly', () => {
    const s = scene([part('a', 'pipe', 0), part('b', 'pipe', 1)], [joint('j', 'a', 'out', 'b', 'in')]);
    expect(findOpenJoints(s, options)).toEqual([]);
  });

  it('accepts a deliberate pipe run that can be routed', () => {
    const s = scene([part('a', 'pipe', 0), part('b', 'pipe', 3)], [joint('j', 'a', 'out', 'b', 'in')]);
    expect(findOpenJoints(s, options)).toEqual([]);
  });

  it('flags a small sideways offset that cannot be routed, with its distance', () => {
    const s = scene([part('a', 'pipe', 0), part('b', 'pipe', 1, 0.015)], [joint('j', 'a', 'out', 'b', 'in')]);
    const [open] = findOpenJoints(s, options);
    expect(open).toMatchObject({ connectionId: 'j', problem: 'unroutable', from: { instanceId: 'a', portId: 'out' }, to: { instanceId: 'b', portId: 'in' } });
    expect(open.distance).toBeCloseTo(0.015, 9);
    expect(open.angle).toBeCloseTo(0, 9);
  });

  it('flags a straight run shorter than the shortest pipe', () => {
    const s = scene([part('a', 'pipe', 0), part('b', 'pipe', 1.05)], [joint('j', 'a', 'out', 'b', 'in')]);
    expect(findOpenJoints(s, options)).toMatchObject([{ connectionId: 'j', problem: 'too-short' }]);
    expect(findOpenJoints(s, { ...options, minRunLength: 0.04 })).toEqual([]);
  });

  it('treats ports within the 1 mm tolerance as joined', () => {
    const s = scene([part('a', 'pipe', 0), part('b', 'pipe', 1.0005)], [joint('j', 'a', 'out', 'b', 'in')]);
    expect(findOpenJoints(s, options)).toEqual([]);
  });

  it('flags ports facing the same way and reports the angle', () => {
    // The tee is turned end for end, so its "left" port points +X like the pipe outlet.
    const flipped = part('t', 'tee', 1.5, 0, 0, { rotation: quaternionFromEuler({ x: 0, y: Math.PI, z: 0 }) });
    const s = scene([part('a', 'pipe', 0), flipped], [joint('j', 'a', 'out', 't', 'left')]);
    const [open] = findOpenJoints(s, options);
    expect(open.problem).toBe('unroutable');
    expect(open.angle).toBeCloseTo(Math.PI, 9);
    expect(open.distance).toBeCloseTo(2, 9);
  });

  it('reuses routes the caller already computed', () => {
    const s = scene([part('a', 'pipe', 0), part('b', 'pipe', 1, 0.015)], [joint('j', 'a', 'out', 'b', 'in')]);
    expect(findOpenJoints(s, { ...options, routes: [] })).toEqual([]);
  });
});

describe('seatOnConnection', () => {
  it('moves the chosen part so its port sits exactly on its partner', () => {
    const s = scene([part('a', 'pipe', 0), part('b', 'pipe', 1, 0.015)], [joint('j', 'a', 'out', 'b', 'in')]);
    const result = seatOnConnection(s, 'j', 'b', options);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.moved).toBeCloseTo(0.015, 9);
    const [p, q] = [world(result.scene, 'a', 'out'), world(result.scene, 'b', 'in')];
    for (let i = 0; i < 3; i++) expect(q.position[i]).toBeCloseTo(p.position[i], 9);
    expect(findOpenJoints(result.scene, options)).toEqual([]);
    expect(result.scene.components[0]).toBe(s.components[0]);
  });

  it('turns a part that faces the wrong way and keeps its other connections in reach', () => {
    // Tee turned end for end between two pipes: left and right are swapped, branch points down.
    const flipped = part('t', 'tee', 1.5, 0, 0, { rotation: quaternionFromEuler({ x: Math.PI, y: Math.PI, z: 0 }) });
    const s = scene(
      [part('a', 'pipe', 0), flipped, part('b', 'pipe', 3), part('up', 'pipe', 1.5, 1.5, 0, { rotation: quaternionFromEuler({ x: 0, y: 0, z: Math.PI / 2 }) })],
      [joint('l', 'a', 'out', 't', 'left'), joint('r', 't', 'right', 'b', 'in'), joint('u', 't', 'branch', 'up', 'in')],
    );
    expect(findOpenJoints(s, options).map((o) => o.connectionId)).toEqual(['l', 'r', 'u']);
    const result = seatOnConnection(s, 'l', 't', options);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // One seat fixes all three: the roll that fits the branch and the far pipe best is chosen.
    expect(findOpenJoints(result.scene, options)).toEqual([]);
  });

  it('moves a part on its own when its partner is in the same assembly', () => {
    const s = scene([part('a', 'pipe', 0), part('b', 'pipe', 1, 0.015, 0, { parentId: 'a' })], [joint('j', 'a', 'out', 'b', 'in')]);
    const result = seatOnConnection(s, 'j', 'a', options);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.scene.components[1]).toBe(s.components[1]);
    expect(result.scene.components[0].position.y).toBeCloseTo(0.015, 9);
  });

  it('moves the whole assembly of the chosen part when the partner is outside it', () => {
    const s = scene(
      [part('a', 'pipe', 0), part('b', 'pipe', 1, 0.015), part('c', 'pipe', 2, 0.015, 0, { parentId: 'b' })],
      [joint('j', 'a', 'out', 'b', 'in'), joint('k', 'b', 'out', 'c', 'in')],
    );
    const result = seatOnConnection(s, 'j', 'b', options);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(findOpenJoints(result.scene, options)).toEqual([]);
    expect(result.scene.components[2].position.y).toBeCloseTo(0, 9);
  });

  it('rejects an unknown connection or a part that is not on it', () => {
    const s = scene([part('a', 'pipe', 0), part('b', 'pipe', 1), part('c', 'pipe', 5)], [joint('j', 'a', 'out', 'b', 'in')]);
    expect(seatOnConnection(s, 'nope', 'a', options)).toMatchObject({ ok: false, error: { code: 'UNKNOWN_CONNECTION' } });
    expect(seatOnConnection(s, 'j', 'c', options)).toMatchObject({ ok: false, error: { code: 'NOT_AN_ENDPOINT' } });
  });
});
