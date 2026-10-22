import { describe, expect, it } from 'vitest';
import type { ComponentInstance, ComponentKind, ScadaScene, SceneConnection } from '@sakibcoolz/core';
import { pipeOuterRadius } from '@sakibcoolz/components';
import { createSimulation, vesselOf } from './index.js';

const part = (id: string, type: ComponentKind, at: [number, number, number], properties: ComponentInstance['properties'] = {}): ComponentInstance => ({
  id, type, position: { x: at[0], y: at[1], z: at[2] }, rotation: { x: 0, y: 0, z: 0, w: 1 }, scale: { x: 1, y: 1, z: 1 }, properties,
});
const join = (id: string, a: string, ap: string, b: string, bp: string): SceneConnection => ({ id, from: { instanceId: a, portId: ap }, to: { instanceId: b, portId: bp } });
const scene = (components: ComponentInstance[], connections: SceneConnection[]): ScadaScene => ({ schemaVersion: 4, documentType: 'industrial.scene', units: 'm', components, connections });
const clock = () => '2026-10-16T00:00:00.000Z';

// Conical tank standing on the ground (legs reach y = −2.5 locally), outlet at y = 0.4 facing +X.
const groundY = 2.5;
const outletY = groundY - 2.1;
const drainLine = (type: 'conicalTank' | 'tank', level: number) => {
  const y = type === 'conicalTank' ? groundY : 1.535;
  const outlet = type === 'conicalTank' ? [1.1, outletY] : [1.2, 0.635];
  return scene(
    [part('t', type, [0, y, 0], { level }), part('v', 'valve', [outlet[0] + 0.6, outlet[1], 0], { open: true }), part('p', 'pipe', [outlet[0] + 2.2, outlet[1], 0], { length: 2 })],
    [join('a', 't', 'outlet', 'v', 'in'), join('b', 'v', 'out', 'p', 'in')],
  );
};

describe('vessel shapes from the catalog', () => {
  it('describes the flat-bottomed tank as a 3 m cylinder with its side ports', () => {
    const v = vesselOf('tank')!;
    expect(v.height).toBe(3);
    expect(v.maxVolume).toBeCloseTo(Math.PI * 3, 12);
    expect([v.portHeight('outlet'), v.portHeight('inlet')]).toEqual([0.6, 2.3]);
  });

  it('describes the conical tank as cone plus cylinder, outlet at the tip and inlet at the top', () => {
    const v = vesselOf('conicalTank')!;
    const r = pipeOuterRadius;
    const cone = (Math.PI / 3) * 1 * (r * r + r * 1 + 1);
    expect(v.height).toBe(3);
    expect(v.maxVolume).toBeCloseTo(cone + Math.PI * 2, 12);
    expect(v.volumeAt(1)).toBeCloseTo(cone, 12);
    expect([v.portHeight('outlet'), v.portHeight('inlet')]).toEqual([0, 3]);
    for (const h of [0, 0.3, 1, 2.2, 3]) expect(v.heightAt(v.volumeAt(h))).toBeCloseTo(h, 9);
  });

  it('has no vessel for parts that are not tanks', () => {
    expect(vesselOf('pipe')).toBeUndefined();
  });
});

describe('conical tank in the simulation', () => {
  it('drains completely, where the flat tank stops at its side outlet', () => {
    const cone = createSimulation(drainLine('conicalTank', 60), { clock });
    const flat = createSimulation(drainLine('tank', 60), { clock });
    cone.step(3000);
    flat.step(3000);
    expect(cone.state().levels.t).toBeCloseTo(0, 3);
    expect(flat.state().levels.t).toBeCloseTo(20, 3);
  });

  it('falls faster near the bottom, where the cone is narrow', () => {
    const rate = (start: number) => {
      const sim = createSimulation(drainLine('conicalTank', start), { clock });
      sim.step(1);
      return start - sim.state().levels.t;
    };
    expect(rate(15)).toBeGreaterThan(rate(60));
  });

  it('conserves volume with a feed into the top inlet', () => {
    const sim = createSimulation(drainLine('conicalTank', 30), { clock, feeds: [{ at: { instanceId: 't', portId: 'inlet' }, rate: 0.01 }] });
    const start = sim.state().totals.stored;
    sim.step(500);
    const { fed, spilled, stored } = sim.state().totals;
    expect(fed - spilled - (stored - start)).toBeCloseTo(0, 9);
  });

  it('drains in the hydraulic model too, from its raised outlet, conserving volume', () => {
    const sim = createSimulation(drainLine('conicalTank', 80), { clock, model: 'hydraulic' });
    const start = sim.state().totals.stored;
    sim.step(0);
    expect(sim.state().flows.find((f) => f.connectionId === 'a')!.rate).toBeGreaterThan(0);
    sim.step(4000);
    const { spilled, stored } = sim.state().totals;
    expect(sim.state().levels.t).toBeCloseTo(0, 2);
    expect(start - stored - spilled).toBeCloseTo(0, 6);
  });
});
