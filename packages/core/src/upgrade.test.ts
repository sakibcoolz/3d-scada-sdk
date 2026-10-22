import { describe, expect, it } from 'vitest';
import { upgradeDimensions } from './upgrade.js';
import { findTouchingPorts } from './touching.js';
import type { ComponentInstance, ConnectionPort, ScadaScene, SceneConnection } from './scene.js';

// "fitting" shrank: its ports were at ±1 (legacy) and are at ±0.2 now. Pipes did not change.
const fluid = (id: string, x: number, dir: number): ConnectionPort => ({ id, kind: 'fluid', position: [x, 0, 0], direction: [dir, 0, 0], nominalSize: 0.15 });
const now: Record<string, ConnectionPort[]> = { pipe: [fluid('in', -0.5, -1), fluid('out', 0.5, 1)], fitting: [fluid('a', -0.2, -1), fluid('b', 0.2, 1)] };
const legacy: Record<string, ConnectionPort[]> = { ...now, fitting: [fluid('a', -1, -1), fluid('b', 1, 1)] };
const options = { resolvePorts: (t: string) => now[t], resolveLegacyPorts: (t: string) => legacy[t] };
const part = (id: string, type: string, x: number): ComponentInstance => ({ id, type: type as never, position: { x, y: 0, z: 0 }, rotation: { x: 0, y: 0, z: 0, w: 1 }, scale: { x: 1, y: 1, z: 1 }, properties: {} });
const join = (id: string, a: string, ap: string, b: string, bp: string): SceneConnection => ({ id, from: { instanceId: a, portId: ap }, to: { instanceId: b, portId: bp } });
// pipe p1 [−0.5, 0.5] — fitting f [0.5, 2.5] (legacy) — pipe p2 [2.5, 3.5], all touching in the old file.
const oldLine = (connected: boolean): ScadaScene => ({
  schemaVersion: 4, documentType: 'industrial.scene', units: 'm',
  components: [part('p1', 'pipe', 0), part('f', 'fitting', 1.5), part('p2', 'pipe', 3)],
  connections: connected ? [join('c1', 'p1', 'out', 'f', 'a'), join('c2', 'f', 'b', 'p2', 'in')] : [],
});

describe('upgradeDimensions', () => {
  it('re-seats joints that met under the old dimensions, carrying the rest of the line along', () => {
    const r = upgradeDimensions(oldLine(true), options);
    expect(r.reseated).toBe(2);
    const x = Object.fromEntries(r.scene.components.map((c) => [c.id, c.position.x]));
    expect(x.p1).toBe(0);
    expect(x.f).toBeCloseTo(0.7, 9); // a at 0.5
    expect(x.p2).toBeCloseTo(1.4, 9); // in at 0.9 = f.b
    expect(r.scene.connections).toEqual(oldLine(true).connections);
  });

  it('keeps unconnected parts that were touching still touching, without connecting them', () => {
    const r = upgradeDimensions(oldLine(false), options);
    expect(r.reseated).toBe(2);
    expect(r.scene.connections).toEqual([]);
    expect(findTouchingPorts(r.scene, options).matches).toHaveLength(2);
  });

  it('changes nothing in a scene already built with the current dimensions', () => {
    const r = upgradeDimensions(oldLine(true), options);
    const again = upgradeDimensions(r.scene, options);
    expect(again.reseated).toBe(0);
    expect(again.scene).toEqual(r.scene);
  });

  it('leaves deliberate gaps (routed runs) alone', () => {
    const s = oldLine(true);
    s.components[2] = part('p2', 'pipe', 6); // 3 m gap after the fitting
    const r = upgradeDimensions(s, options);
    expect(r.reseated).toBe(1);
    expect(r.scene.components[2].position.x).toBe(6);
  });
});

describe('upgradeDimensions with mixed generations', () => {
  // "valve" also shrank (±1 legacy, ±0.2 now). The file has a current fitting but a legacy valve.
  const nowV = { ...now, valve: [fluid('a', -0.2, -1), fluid('b', 0.2, 1)] };
  const legacyV = { ...legacy, valve: [fluid('a', -1, -1), fluid('b', 1, 1)] };
  const opts = { resolvePorts: (t: string) => nowV[t as keyof typeof nowV], resolveLegacyPorts: (t: string) => legacyV[t as keyof typeof legacyV] };

  it('re-seats a legacy part next to a current one and carries current joints along', () => {
    // valve v [-1, 1] (legacy) — current fitting f [1, 1.4] — pipe p [1.4, 2.4]; touching, unconnected.
    const s: ScadaScene = { schemaVersion: 4, documentType: 'industrial.scene', units: 'm', components: [part('v', 'valve', 0), part('f', 'fitting', 1.2), part('p', 'pipe', 1.9)], connections: [] };
    const r = upgradeDimensions(s, opts);
    const x = Object.fromEntries(r.scene.components.map((c) => [c.id, c.position.x]));
    expect(x.v).toBe(0);
    expect(x.f).toBeCloseTo(0.4, 9);
    expect(x.p).toBeCloseTo(1.1, 9);
    expect(findTouchingPorts(r.scene, opts).matches).toHaveLength(2);
    expect(upgradeDimensions(r.scene, opts).reseated).toBe(0);
  });
});
