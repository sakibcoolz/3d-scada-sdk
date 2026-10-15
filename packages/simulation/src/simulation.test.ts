import { describe, expect, it } from 'vitest';
import type { ComponentInstance, ComponentKind, ScadaScene, SceneConnection } from '@scada3d/core';
import { createSimulation, MODEL, TANK } from './index.js';

const part = (id: string, type: ComponentKind, properties: ComponentInstance['properties'] = {}): ComponentInstance => ({
  id,
  type,
  position: { x: 0, y: 0, z: 0 },
  rotation: { x: 0, y: 0, z: 0, w: 1 },
  scale: { x: 1, y: 1, z: 1 },
  properties,
});
const join = (id: string, a: string, ap: string, b: string, bp: string): SceneConnection => ({ id, from: { instanceId: a, portId: ap }, to: { instanceId: b, portId: bp } });
const scene = (components: ComponentInstance[], connections: SceneConnection[]): ScadaScene => ({ schemaVersion: 3, units: 'm', components, connections });
const clock = () => '2026-10-15T00:00:00.000Z';

/** Tank → valve → pipe whose far end is free (spills to atmosphere). */
const drainLine = (level: number, open = true) =>
  scene([part('t', 'tank', { level }), part('v', 'valve', { open }), part('p', 'pipe', { length: 2 })], [join('a', 't', 'outlet', 'v', 'in'), join('b', 'v', 'out', 'p', 'in')]);

const area = Math.PI * TANK.radius ** 2;
const orifice = Math.PI * (0.15 / 2) ** 2;
const k = MODEL.dischargeCoefficient * orifice * Math.sqrt(2 * MODEL.gravity);
const height = (percent: number) => (percent / 100) * TANK.height;
const flow = (state: ReturnType<ReturnType<typeof createSimulation>['state']>, id: string) => state.flows.find((f) => f.connectionId === id)!.rate;

describe('tank geometry from the catalog', () => {
  it('uses the vertical tank: radius 1 m, 3 m tall, outlet 0.6 m and inlet 2.3 m above the bottom', () => {
    expect(TANK).toEqual({ radius: 1, height: 3, ports: { outlet: 0.6, inlet: 2.3 } });
  });
});

describe('gravity drain', () => {
  it('follows the analytic Torricelli solution within 0.5 %', () => {
    const sim = createSimulation(drainLine(100), { clock });
    const h0 = height(100) - TANK.ports.outlet;
    for (const t of [60, 120, 240, 360]) {
      sim.step(t - sim.state().time);
      const expected = Math.max(0, Math.sqrt(h0) - (k / (2 * area)) * t) ** 2 + TANK.ports.outlet;
      expect(height(sim.state().levels.t)).toBeCloseTo(expected, 2);
      expect(Math.abs(height(sim.state().levels.t) - expected) / expected).toBeLessThan(0.005);
    }
  });

  it('stops when the liquid reaches the outlet, never drains below it', () => {
    const sim = createSimulation(drainLine(50), { clock });
    sim.step(3600);
    expect(height(sim.state().levels.t)).toBeCloseTo(TANK.ports.outlet, 3);
    expect(flow(sim.state(), 'a')).toBeCloseTo(0, 6);
  });

  it('reports flow from→to as positive along the path', () => {
    const sim = createSimulation(drainLine(80), { clock });
    sim.step(1);
    const state = sim.state();
    expect(flow(state, 'a')).toBeGreaterThan(0);
    expect(flow(state, 'b')).toBeCloseTo(flow(state, 'a'), 12);
    expect(state.flows.every((f) => f.source === 'SIMULATED' && f.quality === 'GOOD' && f.sourceTimestamp === clock())).toBe(true);
  });

  it('reverses the sign when the connection is written the other way round', () => {
    const s = drainLine(80);
    const flipped = { ...s, connections: [join('a', 'v', 'in', 't', 'outlet'), s.connections[1]] };
    const sim = createSimulation(flipped, { clock });
    sim.step(1);
    expect(flow(sim.state(), 'a')).toBeLessThan(0);
  });

  it('does not flow through a closed valve', () => {
    const sim = createSimulation(drainLine(80, false), { clock });
    sim.step(600);
    expect(sim.state().levels.t).toBeCloseTo(80, 12);
    expect(flow(sim.state(), 'a')).toBe(0);
  });
});

describe('mass balance', () => {
  it('conserves volume over a long run: fed = Δstored + spilled', () => {
    const s = drainLine(30);
    const sim = createSimulation(s, { clock, feeds: [{ at: { instanceId: 't', portId: 'inlet' }, rate: 0.02 }] });
    const before = sim.state().totals.stored;
    sim.step(2000);
    const { fed, spilled, stored } = sim.state().totals;
    expect(fed).toBeCloseTo(0.02 * 2000, 9);
    expect(fed - spilled - (stored - before)).toBeCloseTo(0, 9);
  });

  it('settles where the feed equals the gravity drain', () => {
    const feed = 0.03;
    const sim = createSimulation(drainLine(20), { clock, feeds: [{ at: { instanceId: 't', portId: 'inlet' }, rate: feed }] });
    sim.step(20000);
    const head = (feed / k) ** 2;
    expect(height(sim.state().levels.t)).toBeCloseTo(TANK.ports.outlet + head, 2);
  });

  it('counts inflow into a full tank as overflow', () => {
    const s = scene([part('t', 'tank', { level: 100 })], []);
    const sim = createSimulation(s, { clock, feeds: [{ at: { instanceId: 't', portId: 'inlet' }, rate: 0.05 }] });
    sim.step(10);
    expect(sim.state().levels.t).toBe(100);
    expect(sim.state().totals.spilled).toBeCloseTo(0.5, 9);
    expect(sim.state().notes).toContainEqual({ kind: 'overflow', instanceId: 't' });
  });

  it('moves liquid from one tank to another', () => {
    const s = scene(
      [part('a', 'tank', { level: 90 }), part('v', 'valve', { open: true }), part('b', 'tank', { level: 10 })],
      [join('c1', 'a', 'outlet', 'v', 'in'), join('c2', 'v', 'out', 'b', 'inlet')],
    );
    const sim = createSimulation(s, { clock });
    const start = sim.state().totals.stored;
    sim.step(100);
    const { levels, totals } = sim.state();
    expect(levels.a).toBeLessThan(90);
    expect(levels.b).toBeGreaterThan(10);
    expect(totals.stored).toBeCloseTo(start, 9);
    expect(totals.spilled).toBe(0);
  });

  it('starts a tank without a level as empty and says so', () => {
    const sim = createSimulation(scene([part('t', 'tank')], []), { clock });
    expect(sim.state().levels.t).toBe(0);
    expect(sim.state().notes).toContainEqual({ kind: 'assumed-empty', instanceId: 't' });
  });
});

describe('network rules', () => {
  const teeLine = (branchOpen: boolean) =>
    scene(
      [part('t', 'tank', { level: 80 }), part('p', 'pipe', { length: 2 }), part('tee', 'tee'), part('r', 'pipe', { length: 2 }), part('vb', 'valve', { open: branchOpen }), part('b', 'pipe', { length: 2 })],
      [join('c1', 't', 'outlet', 'p', 'in'), join('c2', 'p', 'out', 'tee', 'left'), join('c3', 'tee', 'right', 'r', 'in'), join('c4', 'tee', 'branch', 'vb', 'in'), join('c5', 'vb', 'out', 'b', 'in')],
    );

  it('splits equally across the open branches of a tee', () => {
    const sim = createSimulation(teeLine(true), { clock });
    sim.step(1);
    const state = sim.state();
    expect(flow(state, 'c3')).toBeCloseTo(flow(state, 'c1') / 2, 12);
    expect(flow(state, 'c4')).toBeCloseTo(flow(state, 'c1') / 2, 12);
  });

  it('sends everything down the open branch when the other is closed', () => {
    const sim = createSimulation(teeLine(false), { clock });
    sim.step(1);
    const state = sim.state();
    expect(flow(state, 'c3')).toBeCloseTo(flow(state, 'c1'), 12);
    expect(flow(state, 'c4')).toBe(0);
  });

  it('treats a path that loops back on itself as blocked', () => {
    // Tank outlet → tee left; tee right and branch joined by a pipe loop.
    const s = scene(
      [part('t', 'tank', { level: 80 }), part('tee', 'tee'), part('loop', 'pipe', { length: 2 })],
      [join('c1', 't', 'outlet', 'tee', 'left'), join('c2', 'tee', 'right', 'loop', 'in'), join('c3', 'loop', 'out', 'tee', 'branch')],
    );
    const sim = createSimulation(s, { clock });
    sim.step(10);
    expect(sim.state().levels.t).toBeCloseTo(80, 12);
  });

  it('runs a pump at its set rate from the suction tank, and only forwards', () => {
    const s = scene(
      [part('t', 'tank', { level: 60 }), part('pump', 'pump'), part('p', 'pipe', { length: 2 })],
      [join('c1', 't', 'outlet', 'pump', 'suction'), join('c2', 'pump', 'discharge', 'p', 'in')],
    );
    const sim = createSimulation(s, { clock, pumps: { pump: { rate: 0.01 } } });
    const start = sim.state().totals.stored;
    sim.step(50);
    expect(start - sim.state().totals.stored).toBeCloseTo(0.5, 9);
    expect(flow(sim.state(), 'c2')).toBeCloseTo(0.01, 12);
    // A stopped pump blocks passive flow.
    const stopped = createSimulation(s, { clock });
    stopped.step(50);
    expect(stopped.state().levels.t).toBeCloseTo(60, 12);
  });

  it('reports a pump whose suction tank has run dry', () => {
    const s = scene(
      [part('t', 'tank', { level: 20 }), part('pump', 'pump'), part('p', 'pipe', { length: 2 })],
      [join('c1', 't', 'outlet', 'pump', 'suction'), join('c2', 'pump', 'discharge', 'p', 'in')],
    );
    const sim = createSimulation(s, { clock, pumps: { pump: { rate: 0.01 } } });
    sim.step(1);
    expect(flow(sim.state(), 'c2')).toBe(0);
    expect(sim.state().notes).toContainEqual({ kind: 'dry', instanceId: 'pump' });
  });

  it('reports a feed with no open path as blocked and does not count it', () => {
    const s = scene([part('p', 'pipe', { length: 2 }), part('v', 'valve', { open: false })], [join('c1', 'p', 'out', 'v', 'in')]);
    const sim = createSimulation(s, { clock, feeds: [{ at: { instanceId: 'p', portId: 'in' }, rate: 0.01 }] });
    sim.step(10);
    expect(sim.state().totals.fed).toBe(0);
    expect(sim.state().notes).toContainEqual({ kind: 'blocked', instanceId: 'p', portId: 'in' });
  });
});

describe('simulation lifecycle', () => {
  it('is deterministic for the same inputs', () => {
    const run = () => {
      const sim = createSimulation(drainLine(75), { clock, feeds: [{ at: { instanceId: 't', portId: 'inlet' }, rate: 0.01 }] });
      sim.step(123.4);
      return sim.state();
    };
    expect(run()).toEqual(run());
  });

  it('keeps levels across scene edits and picks up valve changes', () => {
    const sim = createSimulation(drainLine(80), { clock });
    sim.step(30);
    const level = sim.state().levels.t;
    sim.update(drainLine(80, false));
    expect(sim.state().levels.t).toBe(level);
    sim.step(30);
    expect(sim.state().levels.t).toBe(level);
  });

  it('adds new tanks at their authored level and drops removed ones', () => {
    const sim = createSimulation(drainLine(80), { clock });
    sim.update(scene([part('t2', 'tank', { level: 40 })], []));
    expect(sim.state().levels).toEqual({ t2: 40 });
  });

  it('resets to the authored levels and zero totals', () => {
    const sim = createSimulation(drainLine(80), { clock });
    sim.step(100);
    sim.reset();
    expect(sim.state()).toMatchObject({ time: 0, levels: { t: 80 }, totals: { fed: 0, spilled: 0 } });
  });

  it('names the model in its state', () => {
    expect(createSimulation(drainLine(80), { clock }).state().model).toEqual({ name: 'mass-balance', version: 1 });
  });

  it('rejects invalid rates and unknown ids', () => {
    expect(() => createSimulation(drainLine(80), { feeds: [{ at: { instanceId: 't', portId: 'inlet' }, rate: -1 }] })).toThrow(/rate/);
    expect(() => createSimulation(drainLine(80), { feeds: [{ at: { instanceId: 'nope', portId: 'inlet' }, rate: 1 }] })).toThrow(/nope/);
    expect(() => createSimulation(drainLine(80), { pumps: { v: { rate: 1 } } })).toThrow(/pump/);
    expect(() => createSimulation(drainLine(80)).step(Number.NaN)).toThrow(/seconds/);
  });
});
