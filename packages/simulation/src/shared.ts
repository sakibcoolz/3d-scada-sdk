import type { FlowReading, ScadaScene, SceneConnection } from '@sakibcoolz/core';
import { componentCatalog } from '@sakibcoolz/components';

export type Endpoint = SceneConnection['from'];

const round = (n: number) => Math.round(n * 1e9) / 1e9;

/** The catalog's vertical tank: cylinder size and port heights above its bottom, metres. */
export const TANK = (() => {
  const tank = componentCatalog.tank;
  const shell = tank.parts.find((p) => p.shape === 'cylinder' && p.axis === 'y' && p.openEnded);
  if (!shell || shell.shape !== 'cylinder') throw new Error('catalog tank has no vertical shell');
  const bottom = shell.center[1] - shell.length / 2;
  return {
    radius: shell.radius,
    height: shell.length,
    ports: Object.fromEntries(tank.ports.map((p) => [p.id, round(p.position[1] - bottom)])) as Record<string, number>,
  };
})();


export interface Feed {
  /** A free port where liquid enters; at a tank port it goes straight into the tank. */
  at: Endpoint;
  /** m³/s, finite and ≥ 0. */
  rate: number;
}

/** Hydraulic pump curve H = H₀ − a·Q², from the shut-off head and one design point (ADR-0011). */
export interface PumpCurve {
  /** Head at zero flow, metres. */
  shutoffHead: number;
  /** One operating point on the curve: rate m³/s, head m (below the shut-off head). */
  design: { rate: number; head: number };
}

export interface SimulationOptions {
  /** `mass-balance` v1 (default, ADR-0010) or `hydraulic` v1 (friction, fittings, pump curves; ADR-0011). */
  model?: 'mass-balance' | 'hydraulic';
  feeds?: readonly Feed[];
  /**
   * Running pumps by component id; absent = stopped. `mass-balance` forces `{ rate }` m³/s;
   * `hydraulic` takes a `PumpCurve`.
   */
  pumps?: Readonly<Record<string, { rate: number } | PumpCurve>>;
  /** Integration step, seconds. Default 0.1 (mass-balance) or 0.5 (hydraulic). */
  dt?: number;
  /** Timestamp for emitted readings (ISO 8601). Default: the wall clock. */
  clock?: () => string;
}

export type SimulationNote =
  | { kind: 'assumed-empty'; instanceId: string }
  | { kind: 'overflow'; instanceId: string }
  | { kind: 'dry'; instanceId: string }
  | { kind: 'blocked'; instanceId: string; portId?: string }
  /** Hydraulic model: a cycle among junctions, not solved; its links carry no flow. */
  | { kind: 'loop'; instanceId: string };

export interface SimulationState {
  /** Simulated seconds since start or reset. */
  time: number;
  /** Liquid level per tank id, percent 0–100. */
  levels: Record<string, number>;
  /** One reading per connection, m³/s, + = from→to. */
  flows: FlowReading[];
  /** Cumulative volumes, m³: `fed` entered through feeds, `spilled` left at free ends or overflowed, `stored` is in tanks now. */
  totals: { fed: number; spilled: number; stored: number };
  /** What the model could not do or assumed during the last step. */
  notes: SimulationNote[];
  model: { name: 'mass-balance' | 'hydraulic'; version: 1 };
}

export interface Simulation {
  state(): SimulationState;
  /** Advance by `seconds` of simulated time in fixed sub-steps. */
  step(seconds: number): SimulationState;
  /** Take a new scene (topology, valve states) and keep the volume of tanks that still exist. */
  update(scene: ScadaScene): SimulationState;
  /** Replace feeds and pumps. */
  configure(options: Pick<SimulationOptions, 'feeds' | 'pumps'>): SimulationState;
  /** Back to the authored levels, time 0 and zero totals. */
  reset(): SimulationState;
}

