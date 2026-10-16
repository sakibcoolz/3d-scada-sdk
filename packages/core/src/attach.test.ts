import { describe, expect, it } from 'vitest';
import { attachComponents } from './attach.js';
import { portToWorld } from './transforms.js';
import type { ComponentInstance, ConnectionPort, ScadaScene, SceneConnection } from './scene.js';

const fluid = (id: string, position: [number, number, number], direction: [number, number, number], nominalSize = 0.15): ConnectionPort => ({ id, kind: 'fluid', position, direction, nominalSize });
const ports: Record<string, ConnectionPort[]> = {
  pipe: [fluid('in', [-0.5, 0, 0], [-1, 0, 0]), fluid('out', [0.5, 0, 0], [1, 0, 0])],
  small: [fluid('in', [-0.5, 0, 0], [-1, 0, 0], 0.1), fluid('out', [0.5, 0, 0], [1, 0, 0], 0.1)],
};
const options = { resolvePorts: (type: string) => ports[type], createId: () => 'new' };
const part = (id: string, type: 'pipe' | 'small', x: number, z = 0, extra: Partial<ComponentInstance> = {}): ComponentInstance => ({
  id, type: type as never, position: { x, y: 0, z }, rotation: { x: 0, y: 0, z: 0, w: 1 }, scale: { x: 1, y: 1, z: 1 }, properties: {}, ...extra,
});
const join = (id: string, a: string, ap: string, b: string, bp: string): SceneConnection => ({ id, from: { instanceId: a, portId: ap }, to: { instanceId: b, portId: bp } });
const scene = (components: ComponentInstance[], connections: SceneConnection[] = []): ScadaScene => ({ schemaVersion: 3, units: 'm', components, connections });
const world = (s: ScadaScene, id: string, portId: string) => {
  const c = s.components.find((x) => x.id === id)!;
  return portToWorld(c, ports[c.type].find((p) => p.id === portId)!).position;
};

describe('attachComponents', () => {
  it('moves the second part so the closest free ports meet, and connects them', () => {
    const s = scene([part('a', 'pipe', 0), part('b', 'pipe', 4, 3)]);
    const r = attachComponents(s, 'a', 'b', options);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    // a.out (0.5, 0, 0) is closest to b.in (3.5, 0, 3).
    expect(r.connection).toEqual({ id: 'new', from: { instanceId: 'b', portId: 'in' }, to: { instanceId: 'a', portId: 'out' } });
    const [p, q] = [world(r.scene, 'a', 'out'), world(r.scene, 'b', 'in')];
    for (let i = 0; i < 3; i++) expect(q[i]).toBeCloseTo(p[i], 9);
    expect(r.moved).toBeCloseTo(Math.hypot(3, 3), 9);
    expect(r.scene.components[0]).toEqual(s.components[0]); // the fixed part does not move
    expect(r.scene.connections).toHaveLength(1);
  });

  it('skips ports that are already connected', () => {
    const s = scene([part('a', 'pipe', 0), part('b', 'pipe', 4), part('c', 'pipe', -1)], [join('x', 'c', 'out', 'a', 'in')]);
    const r = attachComponents(s, 'a', 'b', options);
    expect(r.ok && r.connection.to).toEqual({ instanceId: 'a', portId: 'out' });
  });

  it('only pairs ports of the same size', () => {
    const r = attachComponents(scene([part('a', 'pipe', 0), part('b', 'small', 4)]), 'a', 'b', options);
    expect(r).toMatchObject({ ok: false, error: { code: 'NO_MATCHING_PORTS' } });
  });

  it('refuses to attach a part to itself or to an unknown part', () => {
    const s = scene([part('a', 'pipe', 0)]);
    expect(attachComponents(s, 'a', 'a', options)).toMatchObject({ ok: false, error: { code: 'SAME_COMPONENT' } });
    expect(attachComponents(s, 'a', 'zz', options)).toMatchObject({ ok: false, error: { code: 'UNKNOWN_INSTANCE' } });
  });

  it('moves the whole assembly of the attached part', () => {
    const s = scene([part('a', 'pipe', 0), part('b', 'pipe', 5), part('c', 'pipe', 6, 0, { parentId: 'b' })], [join('k', 'b', 'out', 'c', 'in')]);
    const r = attachComponents(s, 'a', 'b', options);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const [bOut, cIn] = [world(r.scene, 'b', 'out'), world(r.scene, 'c', 'in')];
    for (let i = 0; i < 3; i++) expect(cIn[i]).toBeCloseTo(bOut[i], 9);
  });

  it('does not change the input scene', () => {
    const s = scene([part('a', 'pipe', 0), part('b', 'pipe', 4, 3)]);
    const copy = structuredClone(s);
    attachComponents(s, 'a', 'b', options);
    expect(s).toEqual(copy);
  });
});
