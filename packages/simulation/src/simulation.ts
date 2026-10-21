import type { ComponentInstance, ScadaScene } from '@sakibcoolz/core';
import { definitionFor } from '@sakibcoolz/components';
import { type Endpoint, type Feed, type Simulation, type SimulationNote, type SimulationOptions, type SimulationState } from './shared.js';
import { createHydraulicSimulation } from './hydraulic.js';
import { vesselOf, type Vessel } from './vessels.js';

/** Model constants (ADR-0010). Results are always SIMULATED: a teaching model, not plant data. */
export const MODEL = { name: 'mass-balance', version: 1, gravity: 9.81, dischargeCoefficient: 0.62, step: 0.1 } as const;

/** Liquid-holding components (tanks of any shape) receive flow and drain by gravity. */
const isVessel = (c: ComponentInstance) => vesselOf(c.type, c.properties) !== undefined;

const key = (e: Endpoint) => `${e.instanceId}\u0000${e.portId}`;

/** A share of one source's rate: the connections it uses (signed) and where it ends up. */
interface Plan {
  connections: Map<string, number>;
  tanks: Map<string, number>;
  spill: number;
}

const emptyPlan = (): Plan => ({ connections: new Map(), tanks: new Map(), spill: 0 });
const addInto = (target: Map<string, number>, id: string, n: number) => target.set(id, (target.get(id) ?? 0) + n);

class Network {
  readonly components: Map<string, ComponentInstance>;
  private readonly links = new Map<string, { other: Endpoint; connectionId: string; sign: number }>();

  constructor(readonly scene: ScadaScene) {
    this.components = new Map(scene.components.map((c) => [c.id, c]));
    for (const c of scene.connections) {
      this.links.set(key(c.from), { other: c.to, connectionId: c.id, sign: 1 });
      this.links.set(key(c.to), { other: c.from, connectionId: c.id, sign: -1 });
    }
  }

  ports(id: string): string[] {
    const c = this.components.get(id);
    return c ? (definitionFor(c.type, c.properties).ports.filter((p) => p.kind === 'fluid').map((p) => p.id)) : [];
  }

  bore(e: Endpoint): number {
    const c = this.components.get(e.instanceId)!;
    return definitionFor(c.type, c.properties).ports.find((p) => p.id === e.portId)?.nominalSize ?? 0.15;
  }

  link(e: Endpoint) {
    return this.links.get(key(e));
  }

  /** Ports liquid may leave by after entering `id` through `entry` (passive flow; pumps block). */
  private exits(id: string, entry: string): string[] {
    const c = this.components.get(id)!;
    if (isVessel(c) || c.type === 'pump') return [];
    if (c.type === 'valve' && c.properties.open === false) return [];
    return this.ports(id).filter((p) => p !== entry);
  }

  /** Whether liquid entering `id` through `entry` can reach a tank or a free end. */
  private open(id: string, entry: string, path: ReadonlySet<string>): boolean {
    if (path.has(id)) return false;
    const c = this.components.get(id)!;
    if (isVessel(c)) return true;
    const next = new Set(path).add(id);
    return this.exits(id, entry).some((port) => {
      const link = this.link({ instanceId: id, portId: port });
      return !link || this.open(link.other.instanceId, link.other.portId, next);
    });
  }

  /** Plan for a unit rate entering `id` through `entry`, or undefined when no path is open. */
  enter(id: string, entry: string, path: ReadonlySet<string> = new Set()): Plan | undefined {
    if (path.has(id)) return undefined;
    const c = this.components.get(id)!;
    if (isVessel(c)) {
      const plan = emptyPlan();
      plan.tanks.set(id, 1);
      return plan;
    }
    const next = new Set(path).add(id);
    const outs = this.exits(id, entry).filter((port) => {
      const link = this.link({ instanceId: id, portId: port });
      return !link || this.open(link.other.instanceId, link.other.portId, next);
    });
    if (outs.length === 0) return undefined;
    const plan = emptyPlan();
    for (const port of outs) this.merge(plan, this.leave({ instanceId: id, portId: port }, next)!, 1 / outs.length);
    return plan;
  }

  /** Plan for a unit rate leaving through `from`: along its connection, or spilled at a free end. */
  leave(from: Endpoint, path: ReadonlySet<string> = new Set()): Plan | undefined {
    const link = this.link(from);
    if (!link) {
      const plan = emptyPlan();
      plan.spill = 1;
      return plan;
    }
    const inner = this.enter(link.other.instanceId, link.other.portId, path);
    if (!inner) return undefined;
    addInto(inner.connections, link.connectionId, link.sign);
    return inner;
  }

  /** First tank reachable upstream of a pump suction through an open path, with the connections used. */
  supply(from: Endpoint, path: ReadonlySet<string> = new Set()): { tank: Endpoint; connections: Map<string, number> } | undefined {
    const link = this.link(from);
    if (!link) return undefined;
    const { instanceId, portId } = link.other;
    if (path.has(instanceId)) return undefined;
    const c = this.components.get(instanceId)!;
    const found = (() => {
      if (isVessel(c)) return { tank: link.other, connections: new Map<string, number>() };
      const next = new Set(path).add(instanceId);
      for (const port of this.exits(instanceId, portId)) {
        const up = this.supply({ instanceId, portId: port }, next);
        if (up) return up;
      }
      return undefined;
    })();
    // Liquid travels towards the pump: the reverse of leaving `from`.
    if (found) addInto(found.connections, link.connectionId, -link.sign);
    return found;
  }

  private merge(into: Plan, plan: Plan, share: number) {
    for (const [id, n] of plan.connections) addInto(into.connections, id, n * share);
    for (const [id, n] of plan.tanks) addInto(into.tanks, id, n * share);
    into.spill += plan.spill * share;
  }
}

function assertRate(rate: number, what: string) {
  if (typeof rate !== 'number' || !Number.isFinite(rate) || rate < 0) throw new Error(`${what}: rate must be a finite number ≥ 0 m³/s`);
}

/** Starts a deterministic mass-balance simulation of `scene` (ADR-0010). The host calls `step`. */
export function createSimulation(scene: ScadaScene, options: SimulationOptions = {}): Simulation {
  if (options.model === 'hydraulic') return createHydraulicSimulation(scene, options);
  if (options.model !== undefined && options.model !== 'mass-balance') throw new Error(`unknown model ${String(options.model)}`);
  const dt = options.dt ?? MODEL.step;
  if (!(dt > 0) || !Number.isFinite(dt)) throw new Error('dt must be a positive number of seconds');
  const clock = options.clock ?? (() => new Date().toISOString());
  let network = new Network(scene);
  let feeds: readonly Feed[] = [];
  let pumps: Readonly<Record<string, { rate: number }>> = {};
  let volumes = new Map<string, number>();
  let time = 0;
  let fed = 0;
  let spilled = 0;
  let flows = new Map<string, number>();
  let notes: SimulationNote[] = [];

  const authored = (c: ComponentInstance) => (typeof c.properties.level === 'number' && Number.isFinite(c.properties.level) ? Math.min(100, Math.max(0, c.properties.level)) : 0);
  const tanks = () => scene.components.filter(isVessel);
  const vessel = (id: string): Vessel => vesselOf(network.components.get(id)!.type, network.components.get(id)!.properties)!;
  const staticNotes = (): SimulationNote[] => tanks().filter((c) => typeof c.properties.level !== 'number').map((c) => ({ kind: 'assumed-empty', instanceId: c.id }));

  function configure(next: Pick<SimulationOptions, 'feeds' | 'pumps'>, strict: boolean) {
    const ok = (id: string) => network.components.has(id);
    for (const f of next.feeds ?? []) {
      assertRate(f.rate, `feed at ${f.at.instanceId}`);
      if (strict && (!ok(f.at.instanceId) || !network.ports(f.at.instanceId).includes(f.at.portId))) throw new Error(`feed at unknown port ${f.at.instanceId} "${f.at.portId}"`);
      if (strict && network.link(f.at)) throw new Error(`feed at ${f.at.instanceId} "${f.at.portId}": port is connected; feeds enter at free ports`);
    }
    for (const [id, p] of Object.entries(next.pumps ?? {})) {
      if (!('rate' in p)) throw new Error(`pump ${id}: the mass-balance model takes { rate }; pump curves need model 'hydraulic'`);
      assertRate(p.rate, `pump ${id}`);
      if (strict && network.components.get(id)?.type !== 'pump') throw new Error(`pump ${id}: no pump with that id`);
    }
    // After a scene edit, quietly ignore feeds and pumps whose component is gone.
    feeds = (next.feeds ?? []).filter((f) => ok(f.at.instanceId));
    pumps = Object.fromEntries(Object.entries(next.pumps ?? {}).filter(([id, p]) => 'rate' in p && network.components.get(id)?.type === 'pump')) as Record<string, { rate: number }>;
  }

  function substep(h: number) {
    const stepNotes: SimulationNote[] = [];
    const contributions: { from?: string; rate: number; plan: Plan }[] = [];
    // Gravity: each connected tank port below the surface drains through an open path.
    for (const [id, volume] of volumes) {
      const v = vessel(id);
      const level = v.heightAt(volume);
      for (const portId of network.ports(id)) {
        const head = level - v.portHeight(portId);
        if (head <= 0 || !network.link({ instanceId: id, portId })) continue;
        const plan = network.leave({ instanceId: id, portId }, new Set([id]));
        if (!plan) continue;
        const area = Math.PI * (network.bore({ instanceId: id, portId }) / 2) ** 2;
        contributions.push({ from: id, rate: MODEL.dischargeCoefficient * area * Math.sqrt(2 * MODEL.gravity * head), plan });
      }
    }
    // Pumps force their rate from the first tank upstream of the suction.
    for (const [id, { rate }] of Object.entries(pumps)) {
      if (rate <= 0) continue;
      const up = network.supply({ instanceId: id, portId: 'suction' });
      const head = up ? vessel(up.tank.instanceId).heightAt(volumes.get(up.tank.instanceId) ?? 0) - vessel(up.tank.instanceId).portHeight(up.tank.portId) : 0;
      if (!up || head <= 0) { stepNotes.push({ kind: 'dry', instanceId: id }); continue; }
      const down = network.leave({ instanceId: id, portId: 'discharge' }, new Set([id]));
      if (!down) { stepNotes.push({ kind: 'blocked', instanceId: id }); continue; }
      for (const [c, n] of up.connections) addInto(down.connections, c, n);
      contributions.push({ from: up.tank.instanceId, rate, plan: down });
    }
    // Feeds enter at free ports.
    for (const f of feeds) {
      if (f.rate <= 0) continue;
      const c = network.components.get(f.at.instanceId)!;
      const plan = isVessel(c) ? { ...emptyPlan(), tanks: new Map([[c.id, 1]]) } : network.enter(c.id, f.at.portId);
      if (!plan) { stepNotes.push({ kind: 'blocked', instanceId: f.at.instanceId, portId: f.at.portId }); continue; }
      contributions.push({ rate: f.rate, plan });
    }
    // No tank gives more than it holds above its lowest draining port during this sub-step.
    const outflow = new Map<string, number>();
    for (const c of contributions) if (c.from) addInto(outflow, c.from, c.rate * h);
    const scale = new Map<string, number>();
    for (const [id, out] of outflow) {
      const v = vessel(id);
      const lowest = Math.min(...network.ports(id).map((p) => v.portHeight(p)));
      const available = Math.max(0, (volumes.get(id) ?? 0) - v.volumeAt(lowest));
      scale.set(id, out > available ? available / out : 1);
    }
    const nextFlows = new Map<string, number>();
    const delta = new Map<string, number>();
    for (const c of contributions) {
      const rate = c.rate * (c.from ? scale.get(c.from)! : 1);
      if (c.from) addInto(delta, c.from, -rate * h);
      else fed += rate * h;
      for (const [id, n] of c.plan.connections) addInto(nextFlows, id, rate * n);
      for (const [id, n] of c.plan.tanks) addInto(delta, id, rate * n * h);
      spilled += rate * c.plan.spill * h;
    }
    for (const [id, d] of delta) {
      const max = vessel(id).maxVolume;
      let v = (volumes.get(id) ?? 0) + d;
      if (v > max) {
        spilled += v - max;
        v = max;
        stepNotes.push({ kind: 'overflow', instanceId: id });
      }
      volumes.set(id, Math.max(0, v));
    }
    flows = nextFlows;
    notes = stepNotes;
    time += h;
  }

  function state(): SimulationState {
    const timestamp = clock();
    const unique = new Map([...staticNotes(), ...notes].map((n) => [JSON.stringify(n), n]));
    return {
      time,
      // Level is the liquid height as a percent of the vessel's height, as drawn.
      levels: Object.fromEntries([...volumes].map(([id, v]) => [id, Math.min(100, Math.max(0, vessel(id).percentAt(v)))])),
      flows: network.scene.connections.map((c) => ({ connectionId: c.id, rate: flows.get(c.id) ?? 0, quality: 'GOOD', source: 'SIMULATED', sourceTimestamp: timestamp })),
      totals: { fed, spilled, stored: [...volumes.values()].reduce((a, b) => a + b, 0) },
      notes: [...unique.values()],
      model: { name: MODEL.name, version: MODEL.version },
    };
  }

  function load(next: ScadaScene, keep: boolean) {
    scene = next;
    network = new Network(next);
    volumes = new Map(tanks().map((c) => [c.id, keep && volumes.has(c.id) ? volumes.get(c.id)! : vesselOf(c.type, c.properties)!.volumeAtPercent(authored(c))]));
  }

  load(scene, false);
  configure(options, true);

  return {
    state,
    step(seconds) {
      if (typeof seconds !== 'number' || !Number.isFinite(seconds) || seconds < 0) throw new Error('step: seconds must be a finite number ≥ 0');
      const n = Math.ceil(seconds / dt - 1e-9);
      for (let i = 0; i < n; i++) substep(seconds / n);
      return state();
    },
    update(next) {
      load(next, true);
      configure({ feeds, pumps }, false);
      return state();
    },
    configure(next) {
      configure(next, true);
      return state();
    },
    reset() {
      time = 0;
      fed = 0;
      spilled = 0;
      flows = new Map();
      notes = [];
      load(scene, false);
      return state();
    },
  };
}
