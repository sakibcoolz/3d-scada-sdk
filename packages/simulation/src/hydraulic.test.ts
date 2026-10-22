import { describe, expect, it } from 'vitest';
import { quaternionFromEuler, type ComponentInstance, type ComponentKind, type QuaternionLike, type ScadaScene, type SceneConnection } from '@sakibcoolz/core';
import { createSimulation, frictionFactor, HYDRAULIC, TANK } from './index.js';

const I = { x: 0, y: 0, z: 0, w: 1 };
const part = (id: string, type: ComponentKind, at: [number, number, number], properties: ComponentInstance['properties'] = {}, rotation: QuaternionLike = I): ComponentInstance => ({
  id,
  type,
  position: { x: at[0], y: at[1], z: at[2] },
  rotation,
  scale: { x: 1, y: 1, z: 1 },
  properties,
});
const join = (id: string, a: string, ap: string, b: string, bp: string): SceneConnection => ({ id, from: { instanceId: a, portId: ap }, to: { instanceId: b, portId: bp } });
const scene = (components: ComponentInstance[], connections: SceneConnection[]): ScadaScene => ({ schemaVersion: 4, documentType: 'industrial.scene', units: 'm', components, connections });
const clock = () => '2026-10-16T00:00:00.000Z';
const hydraulic = { model: 'hydraulic' as const, clock };

const D = 0.15;
const AREA = Math.PI * (D / 2) ** 2;
const nu = HYDRAULIC.viscosity / HYDRAULIC.density;
const g = HYDRAULIC.gravity;
const relRough = HYDRAULIC.roughness / D;

/** Colebrook–White, solved by fixed-point iteration: the independent reference for friction. */
function colebrook(re: number, rr: number): number {
  if (re < 2000) return 64 / re;
  let f = 0.02;
  for (let i = 0; i < 100; i++) f = (-2 * Math.log10(rr / 3.7 + 2.51 / (re * Math.sqrt(f)))) ** -2;
  return f;
}

/** Velocity that makes `head` equal the losses K·v²/2g + f·(L/D)·v²/2g (+ `lift`), by bisection. */
function solveVelocity(head: (v: number) => number): number {
  let lo = 0, hi = 50;
  for (let i = 0; i < 200; i++) {
    const v = (lo + hi) / 2;
    if (head(v) > 0) lo = v; else hi = v;
  }
  return (lo + hi) / 2;
}

// Upright tank on the ground: bottom at y = 0.035, outlet at y = 0.635 facing +X at x = 1.2.
const tankY = 1.535;
const bottom = tankY - TANK.height / 2;
const outletY = bottom + TANK.ports.outlet;

/** Tank → open valve → horizontal DN150 pipe of `length` m ending free at the outlet height. */
const gravityLine = (level: number, length: number) =>
  scene(
    [part('t', 'tank', [0, tankY, 0], { level }), part('v', 'valve', [1.8, outletY, 0], { open: true }), part('p', 'pipe', [2.4 + length / 2, outletY, 0], { length })],
    [join('a', 't', 'outlet', 'v', 'in'), join('b', 'v', 'out', 'p', 'in')],
  );

const flowOf = (sim: ReturnType<typeof createSimulation>, id: string) => sim.state().flows.find((f) => f.connectionId === id)!.rate;

describe('friction factor', () => {
  it('matches Colebrook–White within 2 % for every catalog pipe size in turbulent flow', () => {
    // ε/D for DN50…DN200 in commercial steel; Swamee–Jain is worst just above the transition.
    for (const bore of [0.05, 0.08, 0.1, 0.15, 0.2]) {
      for (const re of [4e3, 5e3, 1e4, 3e4, 1e5, 3e5, 1e6, 1e7]) {
        const rr = HYDRAULIC.roughness / bore;
        const ref = colebrook(re, rr);
        expect(Math.abs(frictionFactor(re, rr) - ref) / ref).toBeLessThan(0.02);
      }
    }
  });

  it('is within 1 % of Colebrook–White in the fully developed range (Re ≥ 3·10⁴)', () => {
    for (const bore of [0.05, 0.15, 0.2]) for (const re of [3e4, 1e5, 1e6]) {
      const rr = HYDRAULIC.roughness / bore;
      expect(Math.abs(frictionFactor(re, rr) - colebrook(re, rr)) / colebrook(re, rr)).toBeLessThan(0.01);
    }
  });

  it('is 64/Re when laminar and continuous through the transition', () => {
    expect(frictionFactor(1000, 3e-4)).toBeCloseTo(0.064, 12);
    const below = frictionFactor(1999.999, 3e-4), above = frictionFactor(2000.001, 3e-4);
    expect(Math.abs(below - above)).toBeLessThan(1e-6);
    expect(Math.abs(frictionFactor(4000 - 1e-6, 3e-4) - frictionFactor(4000 + 1e-6, 3e-4))).toBeLessThan(1e-6);
  });
});

describe('hydraulic model: gravity line', () => {
  it('matches an independent energy-equation solution within 1 %', () => {
    for (const [level, length] of [[90, 20], [60, 5], [40, 18]] as const) {
      const sim = createSimulation(gravityLine(level, length), hydraulic);
      sim.step(0); // solve at the starting levels
      const surface = bottom + (level / 100) * TANK.height;
      const lift = surface - outletY;
      // Entry from tank 0.5, valve 0.05, exit to atmosphere 1.0; friction over valve 1.2 m + pipe.
      const v = solveVelocity((v) => lift - (0.5 + 0.05 + 1.0 + colebrook((v * D) / nu, relRough) * ((1.2 + length) / D)) * (v * v) / (2 * g));
      const expected = v * AREA;
      expect(Math.abs(flowOf(sim, 'a') - expected) / expected).toBeLessThan(0.01);
      expect(flowOf(sim, 'b')).toBeCloseTo(flowOf(sim, 'a'), 9);
    }
  });

  it('drains more slowly than the frictionless mass-balance model', () => {
    const ideal = createSimulation(gravityLine(90, 20), { clock });
    const real = createSimulation(gravityLine(90, 20), hydraulic);
    ideal.step(60);
    real.step(60);
    expect(real.state().levels.t).toBeGreaterThan(ideal.state().levels.t);
    expect(real.state().model).toEqual({ name: 'hydraulic', version: 1 });
  });

  it('does not flow when the free end is above the liquid surface, and never sucks air back in', () => {
    // Outlet pipe turned to point straight up, 4 m tall: its free end is above any level.
    const up = quaternionFromEuler({ x: 0, y: 0, z: Math.PI / 2 });
    const s = scene(
      [part('t', 'tank', [0, tankY, 0], { level: 50 }), part('v', 'valve', [1.8, outletY, 0], { open: true }), part('p', 'pipe', [2.4, outletY + 2, 0], { length: 4 }, up)],
      [join('a', 't', 'outlet', 'v', 'in'), join('b', 'v', 'out', 'p', 'in')],
    );
    const sim = createSimulation(s, hydraulic);
    sim.step(30);
    expect(flowOf(sim, 'a')).toBe(0);
    expect(sim.state().levels.t).toBeCloseTo(50, 12);
  });

  it('does not flow through a closed valve', () => {
    const s = gravityLine(80, 10);
    s.components[1].properties.open = false;
    const sim = createSimulation(s, hydraulic);
    sim.step(30);
    expect(flowOf(sim, 'a')).toBe(0);
  });
});

describe('hydraulic model: tanks, tees, pumps', () => {
  const twoTanks = (a: number, b: number) =>
    scene(
      [part('A', 'tank', [0, tankY, 0], { level: a }), part('v', 'valve', [1.8, outletY, 0], { open: true }), part('B', 'tank', [6, tankY, 0], { level: b })],
      [join('c1', 'A', 'outlet', 'v', 'in'), join('c2', 'v', 'out', 'B', 'outlet')],
    );

  it('equalises two connected tanks at the same surface elevation, conserving volume', () => {
    const sim = createSimulation(twoTanks(90, 30), hydraulic);
    const start = sim.state().totals.stored;
    sim.step(4000);
    const { levels, totals } = sim.state();
    expect(Math.abs(levels.A - levels.B)).toBeLessThan(0.1);
    expect(levels.A).toBeCloseTo(60, 0);
    expect(totals.stored).toBeCloseTo(start, 6);
    expect(totals.spilled).toBe(0);
  });

  it('flows backwards along a connection when the far tank is higher', () => {
    const sim = createSimulation(twoTanks(30, 90), hydraulic);
    sim.step(1);
    expect(flowOf(sim, 'c1')).toBeLessThan(0);
  });

  it('splits a tee by resistance: the longer branch carries less, and the node balances', () => {
    // Tank → valve → tee; right: 2 m pipe; branch: routed up and over to a 30 m pipe at the same end height.
    const s = scene(
      [
        part('t', 'tank', [0, tankY, 0], { level: 95 }),
        part('v', 'valve', [1.8, outletY, 0], { open: true }),
        part('tee', 'tee', [3.4, outletY, 0]),
        part('r', 'pipe', [5.4, outletY, 0], { length: 2 }),
        part('b', 'pipe', [3.4 + 15, outletY, 6], { length: 30 }),
      ],
      [join('c1', 't', 'outlet', 'v', 'in'), join('c2', 'v', 'out', 'tee', 'left'), join('c3', 'tee', 'right', 'r', 'in'), join('c4', 'tee', 'branch', 'b', 'in')],
    );
    const sim = createSimulation(s, hydraulic);
    sim.step(0);
    const [qIn, qRight, qBranch] = ['c2', 'c3', 'c4'].map((id) => flowOf(sim, id));
    expect(qBranch).toBeGreaterThan(0);
    expect(qBranch).toBeLessThan(qRight);
    expect(qRight + qBranch).toBeCloseTo(qIn, 6);
  });

  it('runs a pump at the operating point where its curve meets the system curve', () => {
    // Tank → pump → vertical 10 m pipe discharging 10 m above the pump outlet.
    const up = quaternionFromEuler({ x: 0, y: 0, z: Math.PI / 2 });
    const dischargeY = outletY + 0.6;
    const L = 10;
    const s = scene(
      [part('t', 'tank', [0, tankY, 0], { level: 50 }), part('pump', 'pump', [1.8, outletY, 0]), part('p', 'pipe', [2.1, dischargeY + L / 2, 0], { length: L }, up)],
      [join('c1', 't', 'outlet', 'pump', 'suction'), join('c2', 'pump', 'discharge', 'p', 'in')],
    );
    const curve = { shutoffHead: 25, design: { rate: 0.03, head: 18 } };
    const sim = createSimulation(s, { ...hydraulic, pumps: { pump: curve } });
    sim.step(0);
    const q = flowOf(sim, 'c2');
    const a = (curve.shutoffHead - curve.design.head) / curve.design.rate ** 2;
    const surface = bottom + 0.5 * TANK.height;
    const lift = dischargeY + L - surface;
    // Independent: pump head = lift + (entry 0.5 + exit 1.0 + friction over 10 m)·v²/2g.
    const v = solveVelocity((v) => curve.shutoffHead - a * (v * AREA) ** 2 - lift - (0.5 + 1.0 + colebrook((v * D) / nu, relRough) * (L / D)) * (v * v) / (2 * g));
    expect(Math.abs(q - v * AREA) / (v * AREA)).toBeLessThan(0.01);
  });

  it('delivers nothing when the pump cannot lift high enough, and never runs backwards', () => {
    const up = quaternionFromEuler({ x: 0, y: 0, z: Math.PI / 2 });
    const s = scene(
      [part('t', 'tank', [0, tankY, 0], { level: 50 }), part('pump', 'pump', [1.8, outletY, 0]), part('p', 'pipe', [2.1, outletY + 0.6 + 10, 0], { length: 20 }, up)],
      [join('c1', 't', 'outlet', 'pump', 'suction'), join('c2', 'pump', 'discharge', 'p', 'in')],
    );
    const sim = createSimulation(s, { ...hydraulic, pumps: { pump: { shutoffHead: 8, design: { rate: 0.01, head: 6 } } } });
    sim.step(10);
    expect(flowOf(sim, 'c2')).toBe(0);
  });
});

describe('hydraulic model: limits and bookkeeping', () => {
  it('reports a loop and carries no flow around it', () => {
    const s = scene(
      [part('t', 'tank', [0, tankY, 0], { level: 80 }), part('tee', 'tee', [2.2, outletY, 0]), part('loop', 'pipe', [3, outletY + 3, 0], { length: 2 })],
      [join('c1', 't', 'outlet', 'tee', 'left'), join('c2', 'tee', 'right', 'loop', 'in'), join('c3', 'loop', 'out', 'tee', 'branch')],
    );
    const sim = createSimulation(s, hydraulic);
    sim.step(10);
    expect(sim.state().levels.t).toBeCloseTo(80, 12);
    expect(sim.state().notes).toContainEqual({ kind: 'loop', instanceId: 'tee' });
  });

  it('reports a feed with no way out as blocked and does not count it', () => {
    const s = scene([part('p', 'pipe', [0, 0.084, 0], { length: 2 }), part('v', 'valve', [1.6, 0.084, 0], { open: false })], [join('c1', 'p', 'out', 'v', 'in')]);
    const sim = createSimulation(s, { ...hydraulic, feeds: [{ at: { instanceId: 'p', portId: 'in' }, rate: 0.01 }] });
    sim.step(5);
    expect(sim.state().totals.fed).toBe(0);
    expect(sim.state().notes).toContainEqual({ kind: 'blocked', instanceId: 'p', portId: 'in' });
  });

  it('conserves volume with a feed: fed = Δstored + spilled', () => {
    const sim = createSimulation(gravityLine(30, 10), { ...hydraulic, feeds: [{ at: { instanceId: 't', portId: 'inlet' }, rate: 0.03 }] });
    const before = sim.state().totals.stored;
    sim.step(1500);
    const { fed, spilled, stored } = sim.state().totals;
    expect(fed).toBeCloseTo(0.03 * 1500, 6);
    expect(fed - spilled - (stored - before)).toBeCloseTo(0, 6);
  });

  it('is deterministic', () => {
    const run = () => {
      const sim = createSimulation(gravityLine(77, 12), hydraulic);
      sim.step(321);
      return sim.state();
    };
    expect(run()).toEqual(run());
  });

  it('validates pump curves for the hydraulic model', () => {
    const s = scene([part('t', 'tank', [0, tankY, 0], { level: 50 }), part('pump', 'pump', [1.8, outletY, 0])], [join('c1', 't', 'outlet', 'pump', 'suction')]);
    expect(() => createSimulation(s, { ...hydraulic, pumps: { pump: { shutoffHead: 10, design: { rate: 0.01, head: 12 } } } })).toThrow(/design head/);
    expect(() => createSimulation(s, { ...hydraulic, pumps: { pump: { shutoffHead: 10, design: { rate: 0, head: 5 } } } })).toThrow(/design rate/);
    expect(() => createSimulation(s, { ...hydraulic, pumps: { pump: { rate: 0.01 } as never } })).toThrow(/shutoffHead/);
  });
});
