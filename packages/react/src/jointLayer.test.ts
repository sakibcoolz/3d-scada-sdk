import { describe, expect, it } from 'vitest';
import { routeScene, type ComponentInstance, type ComponentKind, type ScadaScene, type SceneConnection } from '@sakibcoolz/core';
import { asme, catalogResolvers } from '@sakibcoolz/components';
import { jointPlacements } from './jointLayer.js';

const I = { x: 0, y: 0, z: 0, w: 1 };
const part = (id: string, type: ComponentKind, x: number, y = 0.2, properties: ComponentInstance['properties'] = {}): ComponentInstance => ({ id, type, position: { x, y, z: 0 }, rotation: I, scale: { x: 1, y: 1, z: 1 }, properties });
const join = (id: string, a: string, ap: string, b: string, bp: string): SceneConnection => ({ id, from: { instanceId: a, portId: ap }, to: { instanceId: b, portId: bp } });
const scene = (components: ComponentInstance[], connections: SceneConnection[] = []): ScadaScene => ({ schemaVersion: 3, units: 'm', components, connections });
const place = (s: ScadaScene) => jointPlacements(s, routeScene(s, catalogResolvers));
const origin = (m: readonly number[]) => [m[12], m[13], m[14]].map((n) => Math.round(n * 1e9) / 1e9);
const xAxis = (m: readonly number[]) => [m[0], m[1], m[2]].map((n) => Math.round(n * 1e9) / 1e9);

describe('jointPlacements', () => {
  it('puts one flange pair where a valve meets a pipe, on the joint, along the valve port', () => {
    // valve out at x = F/2 (B16.10); pipe in there too.
    const h = asme.DN150.valveFaceToFace / 2;
    const s = scene([part('v', 'valve', 0, 0.2, { open: true }), part('p', 'pipe', h + 1, 0.2, { length: 2 })], [join('c', 'v', 'out', 'p', 'in')]);
    const pairs = place(s).filter((p) => p.style === 'pair');
    expect(pairs).toHaveLength(1);
    expect(pairs[0].size).toBe('DN150');
    expect(origin(pairs[0].matrix)).toEqual([h, 0.2, 0]);
    expect(xAxis(pairs[0].matrix)).toEqual([1, 0, 0]);
    // The valve's other, free end gets a single flange; the free pipe end gets nothing.
    expect(place(s).filter((p) => p.style === 'single').map((p) => origin(p.matrix))).toEqual([[-h, 0.2, 0]]);
  });

  it('welds a pipe to an elbow', () => {
    const s = scene([part('p', 'pipe', 0, 0.2, { length: 2 }), part('e', 'elbow', 1 + 0.229, 0.2)], [join('c', 'p', 'out', 'e', 'in')]);
    expect(place(s).map((p) => [p.style, origin(p.matrix)])).toEqual([['weld', [1, 0.2, 0]]]);
  });

  it('gives a routed run a joint at each end and a weld either side of every bend', () => {
    // Two pipes far apart, joined through one bend: pipe ends are welded, the bend adds two welds.
    const up = { x: 0, y: 0, z: Math.SQRT1_2, w: Math.SQRT1_2 };
    const s = scene([part('a', 'pipe', 0, 0.2, { length: 2 }), { ...part('b', 'pipe', 4, 3, { length: 2 }), rotation: up }], [join('c', 'a', 'out', 'b', 'in')]);
    const routes = routeScene(s, catalogResolvers);
    expect(routes[0].status === 'ok' && routes[0].bends).toHaveLength(1);
    const welds = jointPlacements(s, routes).filter((p) => p.style === 'weld');
    expect(welds).toHaveLength(4);
  });

  it('draws nothing for a connection that cannot be routed (an open joint)', () => {
    // 15 mm sideways offset: no pipe can be drawn, so neither a weld nor a flange is.
    const s = scene([part('a', 'pipe', 0, 0.2, { length: 2 }), part('b', 'pipe', 2, 0.215, { length: 2 })], [join('c', 'a', 'out', 'b', 'in')]);
    const routes = routeScene(s, catalogResolvers);
    expect(routes[0].status).toBe('invalid');
    expect(jointPlacements(s, routes)).toEqual([]);
  });
});
