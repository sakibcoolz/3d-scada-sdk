import { portToWorld, routeScene, type ComponentInstance, type ScadaScene } from '@scada3d/core';
import { catalogResolvers, definitionFor } from '@scada3d/components';
import { type Endpoint, type Feed, type PumpCurve, type Simulation, type SimulationNote, type SimulationOptions, type SimulationState } from './shared.js';

/** Constants of the `hydraulic` v1 model (ADR-0011): water at 20 °C in commercial steel pipe. */
export const HYDRAULIC = {
  name: 'hydraulic',
  version: 1,
  gravity: 9.81,
  /** kg/m³ */
  density: 998,
  /** Pa·s */
  viscosity: 1.0e-3,
  /** Absolute roughness, m. */
  roughness: 4.5e-5,
  /** Default integration step, s. */
  step: 0.5,
  /** Minor-loss coefficients, h = K·v²/2g. */
  K: { valve: 0.05, elbow: 0.3, bend: 0.3, teeRun: 0.1, teeBranch: 1.0, reducer: 0.5, tankExit: 0.5, tankEntry: 1.0, freeExit: 1.0 },
} as const;

import { vesselOf } from './vessels.js';

const NU = HYDRAULIC.viscosity / HYDRAULIC.density;
const isVessel = (c: ComponentInstance) => vesselOf(c.type, c.properties) !== undefined;
const G = HYDRAULIC.gravity;

/**
 * Darcy friction factor: 64/Re when laminar (Re < 2000), Swamee–Jain when turbulent (Re > 4000),
 * linear in between so the head loss stays continuous and monotonic.
 */
export function frictionFactor(re: number, relativeRoughness: number): number {
  if (!(re > 0)) return 0;
  const turbulent = (r: number) => 0.25 / Math.log10(relativeRoughness / 3.7 + 5.74 / r ** 0.9) ** 2;
  if (re < 2000) return 64 / re;
  if (re > 4000) return turbulent(re);
  const t = (re - 2000) / 2000;
  return (1 - t) * (64 / 2000) + t * turbulent(4000);
}

interface Segment { length: number; diameter: number; k: number }

/** Head loss over one segment for a flow magnitude q ≥ 0, metres. */
function segmentLoss(s: Segment, q: number): number {
  if (q === 0) return 0;
  const v = q / (Math.PI * (s.diameter / 2) ** 2);
  const f = frictionFactor((v * s.diameter) / NU, HYDRAULIC.roughness / s.diameter);
  return (f * (s.length / s.diameter) + s.k) * (v * v) / (2 * G);
}

const velocityHead = (diameter: number, q: number) => (q / (Math.PI * (diameter / 2) ** 2)) ** 2 / (2 * G);

type TerminalKind = 'node' | 'tank' | 'free';
interface Terminal { id: string; kind: TerminalKind; component: string; port?: string; elevation: number }

interface Link {
  a: Terminal;
  b: Terminal;
  segments: Segment[];
  /** Connection id → sign of a→b flow along that connection's from→to. */
  connections: Map<string, number>;
  /** +1: only a→b; −1: only b→a; 0: both. */
  oneWay: number;
  closed: boolean;
  /** Pump on the path: its curve and +1 when a→b is suction→discharge. */
  pump?: { curve: PumpCurve; dir: number };
}

const key = (e: Endpoint) => `${e.instanceId}\u0000${e.portId}`;

function curveCoefficient(c: PumpCurve) {
  return (c.shutoffHead - c.design.head) / c.design.rate ** 2;
}

/** Head loss a→b for a signed flow q (a→b positive), minus any pump gain. Monotonic in q. */
function linkLoss(link: Link, q: number): number {
  const m = Math.abs(q);
  let h = link.segments.reduce((sum, s) => sum + segmentLoss(s, m), 0);
  const first = link.segments[0], last = link.segments[link.segments.length - 1];
  const end = (t: Terminal, seg: Segment | undefined, leaving: boolean) => {
    if (!seg) return 0;
    if (t.kind === 'tank') return (leaving ? HYDRAULIC.K.tankExit : HYDRAULIC.K.tankEntry) * velocityHead(seg.diameter, m);
    if (t.kind === 'free' && !leaving) return HYDRAULIC.K.freeExit * velocityHead(seg.diameter, m);
    return 0;
  };
  // q > 0 leaves a and enters b; q < 0 the reverse.
  h += q >= 0 ? end(link.a, first, true) + end(link.b, last, false) : end(link.b, last, true) + end(link.a, first, false);
  let signed = q >= 0 ? h : -h;
  if (link.pump && q * link.pump.dir >= 0) {
    const gain = link.pump.curve.shutoffHead - curveCoefficient(link.pump.curve) * q * q;
    signed -= link.pump.dir * gain;
  }
  return signed;
}

/**
 * Root of an increasing function: expand a bracket from `x0` by `step`, then Illinois false
 * position (superlinear, never leaves the bracket). Stops at |x| tolerance `tol`.
 */
function rootOfIncreasing(F: (x: number) => number, x0: number, step: number, tol: number, lo0 = -Infinity, hi0 = Infinity): number {
  let a = Math.max(lo0, x0 - step), b = Math.min(hi0, x0 + step);
  let fa = F(a), fb = F(b);
  for (let i = 0; fa > 0 && a > lo0 && i < 200; i++) { a = Math.max(lo0, a - (step *= 2)); fa = F(a); }
  for (let i = 0; fb < 0 && b < hi0 && i < 200; i++) { b = Math.min(hi0, b + (step *= 2)); fb = F(b); }
  if (fa >= 0) return a;
  if (fb <= 0) return b;
  let side = 0;
  for (let i = 0; i < 100 && b - a > tol; i++) {
    const x = (a * fb - b * fa) / (fb - fa);
    const fx = F(x);
    if (fx === 0) return x;
    if (fx < 0) { a = x; fa = fx; if (side === -1) fb /= 2; side = -1; }
    else { b = x; fb = fx; if (side === 1) fa /= 2; side = 1; }
  }
  return (a + b) / 2;
}

/** Allowed flow directions of a link at the current levels: [min, max] sign bounds. */
function allowed(link: Link, tankDry: (t: Terminal) => boolean): [boolean, boolean] {
  if (link.closed) return [false, false];
  let pos = link.oneWay >= 0, neg = link.oneWay <= 0;
  // A dry tank port only accepts inflow.
  if (link.a.kind === 'tank' && tankDry(link.a)) pos = false;
  if (link.b.kind === 'tank' && tankDry(link.b)) neg = false;
  return [neg, pos];
}

/** Flow a→b for a head difference Ha − Hb, by bisection on the monotonic loss function. */
function linkFlow(link: Link, dh: number, tankDry: (t: Terminal) => boolean): number {
  const [neg, pos] = allowed(link, tankDry);
  if (!neg && !pos) return 0;
  const F = (q: number) => linkLoss(link, q) - dh;
  // Just either side of zero the only term left is a pump's shut-off head in its own direction.
  const h0 = link.pump ? link.pump.curve.shutoffHead : 0;
  const atPlus = (link.pump && link.pump.dir > 0 ? -h0 : 0) - dh;
  const atMinus = (link.pump && link.pump.dir < 0 ? h0 : 0) - dh;
  // Search one side of zero for the flow magnitude; F is increasing in q on both sides.
  const solve = (sign: number) => sign * rootOfIncreasing((m) => sign * F(sign * m), 0.01, 0.01, 1e-13, 0, 1e3);
  if (pos && atPlus < 0) return solve(1);
  if (neg && atMinus > 0) return solve(-1);
  return 0;
}

class HydraulicNetwork {
  readonly terminals = new Map<string, Terminal>();
  readonly links: Link[] = [];
  readonly notes: SimulationNote[] = [];
  private readonly components: Map<string, ComponentInstance>;
  private readonly peers = new Map<string, { other: Endpoint; connectionId: string; sign: number }>();
  private readonly runs = new Map<string, { length: number; bends: number }>();

  constructor(readonly scene: ScadaScene, private readonly pumps: Readonly<Record<string, PumpCurve>>, private readonly fedPorts: ReadonlySet<string>) {
    this.components = new Map(scene.components.map((c) => [c.id, c]));
    for (const c of scene.connections) {
      this.peers.set(key(c.from), { other: c.to, connectionId: c.id, sign: 1 });
      this.peers.set(key(c.to), { other: c.from, connectionId: c.id, sign: -1 });
    }
    for (const r of routeScene(scene, catalogResolvers)) {
      if (r.status === 'ok') this.runs.set(r.connectionId, { length: r.length, bends: r.bends.length });
      else if ('from' in r) this.runs.set(r.connectionId, { length: Math.hypot(r.to[0] - r.from[0], r.to[1] - r.from[1], r.to[2] - r.from[2]), bends: 0 });
    }
    this.build();
  }

  private port(e: Endpoint) {
    const c = this.components.get(e.instanceId)!;
    return definitionFor(c.type, c.properties).ports.find((p) => p.id === e.portId)!;
  }
  private ports(id: string) {
    const c = this.components.get(id)!;
    return definitionFor(c.type, c.properties).ports.filter((p) => p.kind === 'fluid').map((p) => p.id);
  }
  private elevation(e: Endpoint) {
    return portToWorld(this.components.get(e.instanceId)!, this.port(e)).position[1];
  }
  /** Tee leg from the centre to a port: the ASME centre-to-end distance. */
  private teeLeg(e: Endpoint) {
    return Math.hypot(...this.port(e).position);
  }
  private bore(e: Endpoint) {
    return this.port(e).nominalSize ?? 0.15;
  }

  private terminal(kind: TerminalKind, e: Endpoint): Terminal {
    const id = kind === 'node' && this.components.get(e.instanceId)!.type === 'tee' ? `tee:${e.instanceId}` : `${kind}:${key(e)}`;
    let t = this.terminals.get(id);
    if (!t) this.terminals.set(id, (t = { id, kind, component: e.instanceId, port: kind === 'node' && id.startsWith('tee:') ? undefined : e.portId, elevation: this.elevation(e) }));
    return t;
  }

  /** Segments inside a two-port component from `entry` to its other port. */
  private inside(c: ComponentInstance, entry: string): Segment[] {
    const d = (p: string) => this.bore({ instanceId: c.id, portId: p });
    const exit = this.ports(c.id).find((p) => p !== entry)!;
    switch (c.type) {
      case 'pipe':
      case 'coupler': {
        // Flow length from the validated geometry (an out-of-range length falls back like the drawing does).
        const [p0, p1] = definitionFor(c.type, c.properties).ports;
        return [{ length: Math.hypot(p1.position[0] - p0.position[0], p1.position[1] - p0.position[1], p1.position[2] - p0.position[2]), diameter: d(entry), k: 0 }];
      }
      case 'elbow': {
        // Centreline arc of the long-radius bend.
        const bend = definitionFor(c.type, c.properties).parts.find((p) => p.shape === 'bend');
        return [{ length: bend && bend.shape === 'bend' ? (Math.PI / 2) * bend.bendRadius : 0, diameter: d(entry), k: HYDRAULIC.K.elbow }];
      }
      case 'valve': {
        // B16.10 face-to-face (ADR-0016).
        const [p0, p1] = definitionFor(c.type, c.properties).ports;
        return [{ length: Math.hypot(p1.position[0] - p0.position[0], p1.position[1] - p0.position[1], p1.position[2] - p0.position[2]), diameter: d(entry), k: HYDRAULIC.K.valve }];
      }
      case 'reducer': {
        const [din, dout] = [d(entry), d(exit)];
        const small = Math.min(din, dout), large = Math.max(din, dout);
        const k = HYDRAULIC.K.reducer * (1 - (small * small) / (large * large)) ** 2;
        return [{ length: 0.15, diameter: din, k: din === small ? k : 0 }, { length: 0.15, diameter: dout, k: dout === small ? k : 0 }];
      }
      default:
        return [];
    }
  }

  private build() {
    const used = new Set<string>();
    const starts: { terminal: Terminal; segments: Segment[]; leaving: Endpoint; through?: ComponentInstance; entry?: string }[] = [];
    for (const c of this.scene.components) {
      for (const p of this.ports(c.id)) {
        const e = { instanceId: c.id, portId: p };
        const connected = this.peers.has(key(e));
        if (c.type === 'tee') starts.push({ terminal: this.terminal('node', e), segments: [{ length: this.teeLeg(e), diameter: this.bore(e), k: p === 'branch' ? HYDRAULIC.K.teeBranch : HYDRAULIC.K.teeRun }], leaving: e });
        else if (isVessel(c)) { if (connected) starts.push({ terminal: this.terminal('tank', e), segments: [], leaving: e }); }
        else if (!connected) starts.push({ terminal: this.terminal(this.fedPorts.has(key(e)) ? 'node' : 'free', e), segments: [], leaving: e, through: c, entry: p });
      }
    }
    for (const s of starts) {
      const startKey = key(s.through ? { instanceId: s.through.id, portId: s.entry! } : s.leaving);
      if (used.has(startKey)) continue;
      used.add(startKey);
      const link: Link = { a: s.terminal, b: s.terminal, segments: [...s.segments], connections: new Map(), oneWay: 0, closed: false };
      const visited = new Set<string>();
      let leaving = s.leaving;
      // A walk that starts at a free port first crosses its own component.
      if (s.through) {
        const next = this.cross(link, s.through, s.entry!);
        if (!next) { this.finish(link, s.terminal, used); continue; }
        visited.add(s.through.id);
        leaving = next;
      }
      for (;;) {
        const peer = this.peers.get(key(leaving));
        if (!peer) { this.finish(link, this.terminal(this.fedPorts.has(key(leaving)) ? 'node' : 'free', leaving), used, key(leaving)); break; }
        const run = this.runs.get(peer.connectionId) ?? { length: 0, bends: 0 };
        if (run.length > 0) link.segments.push({ length: run.length, diameter: this.bore(leaving), k: run.bends * HYDRAULIC.K.bend });
        link.connections.set(peer.connectionId, (link.connections.get(peer.connectionId) ?? 0) + peer.sign);
        const c = this.components.get(peer.other.instanceId)!;
        if (isVessel(c)) { this.finish(link, this.terminal('tank', peer.other), used, key(peer.other)); break; }
        if (c.type === 'tee') {
          link.segments.push({ length: this.teeLeg(peer.other), diameter: this.bore(peer.other), k: peer.other.portId === 'branch' ? HYDRAULIC.K.teeBranch : HYDRAULIC.K.teeRun });
          this.finish(link, this.terminal('node', peer.other), used, key(peer.other));
          break;
        }
        if (visited.has(c.id)) { link.closed = true; this.finish(link, s.terminal, used); break; }
        visited.add(c.id);
        const next = this.cross(link, c, peer.other.portId);
        if (!next) { this.finish(link, s.terminal, used); break; }
        leaving = next;
      }
    }
    this.findLoops();
  }

  /** Crosses a two-port component; returns the port the flow leaves by, or undefined when blocked. */
  private cross(link: Link, c: ComponentInstance, entry: string): Endpoint | undefined {
    if (c.type === 'valve' && c.properties.open === false) link.closed = true;
    if (c.type === 'pump') {
      const curve = this.pumps[c.id];
      if (!curve) link.closed = true;
      else link.pump = { curve, dir: entry === 'suction' ? 1 : -1 };
    }
    const exit = this.ports(c.id).find((p) => p !== entry);
    if (!exit) { link.closed = true; return undefined; }
    link.segments.push(...this.inside(c, entry));
    return { instanceId: c.id, portId: exit };
  }

  private finish(link: Link, end: Terminal, used: Set<string>, endKey?: string) {
    if (endKey) used.add(endKey);
    link.b = end;
    // Free ends only let liquid out.
    if (link.a.kind === 'free') link.oneWay = -1;
    if (link.b.kind === 'free') link.oneWay = link.oneWay === -1 ? 2 : 1;
    if (link.oneWay === 2) link.closed = true;
    if (link.pump) {
      if (link.oneWay !== 0 && link.oneWay !== link.pump.dir) link.closed = true;
      link.oneWay = link.pump.dir;
    }
    this.links.push(link);
  }

  /** A cycle among junction nodes is reported and its closing link carries no flow (trees only). */
  private findLoops() {
    const parent = new Map<string, string>();
    const root = (x: string): string => { let r = x; while (parent.has(r)) r = parent.get(r)!; return r; };
    for (const link of this.links) {
      if (link.closed || link.a.kind !== 'node' || link.b.kind !== 'node') continue;
      const [ra, rb] = [root(link.a.id), root(link.b.id)];
      if (ra === rb) {
        link.closed = true;
        for (const t of [link.a, link.b]) this.notes.push({ kind: 'loop', instanceId: t.component });
      } else parent.set(ra, rb);
    }
  }
}

function assertCurve(id: string, p: unknown): PumpCurve {
  const c = p as Partial<PumpCurve> | undefined;
  if (!c || typeof c.shutoffHead !== 'number' || !c.design || typeof c.design.rate !== 'number' || typeof c.design.head !== 'number')
    throw new Error(`pump ${id}: the hydraulic model needs { shutoffHead, design: { rate, head } }`);
  if (!(c.shutoffHead > 0) || !Number.isFinite(c.shutoffHead)) throw new Error(`pump ${id}: shutoffHead must be a positive head in metres`);
  if (!(c.design.rate > 0) || !Number.isFinite(c.design.rate)) throw new Error(`pump ${id}: design rate must be > 0 m³/s`);
  if (!(c.design.head >= 0 && c.design.head < c.shutoffHead)) throw new Error(`pump ${id}: design head must be ≥ 0 and below shutoffHead`);
  return c as PumpCurve;
}

/** `hydraulic` v1 (ADR-0011): quasi-steady network solve per step, then the tank mass balance. */
export function createHydraulicSimulation(initial: ScadaScene, options: SimulationOptions): Simulation {
  const dt = options.dt ?? HYDRAULIC.step;
  if (!(dt > 0) || !Number.isFinite(dt)) throw new Error('dt must be a positive number of seconds');
  const clock = options.clock ?? (() => new Date().toISOString());
  let scene = initial;
  let feeds: readonly Feed[] = [];
  let pumps: Record<string, PumpCurve> = {};
  let network: HydraulicNetwork;
  let volumes = new Map<string, number>();
  let heads = new Map<string, number>();
  let time = 0, fed = 0, spilled = 0;
  let flows = new Map<string, number>();
  let notes: SimulationNote[] = [];

  const components = () => new Map(scene.components.map((c) => [c.id, c]));
  const tanks = () => scene.components.filter(isVessel);
  const vessel = (id: string) => vesselOf(components().get(id)!.type, components().get(id)!.properties)!;
  const authored = (c: ComponentInstance) => (typeof c.properties.level === 'number' && Number.isFinite(c.properties.level) ? Math.min(100, Math.max(0, c.properties.level)) : 0);
  const bottomOf = (c: ComponentInstance) => c.position.y + vesselOf(c.type, c.properties)!.bottom;

  function rebuild() {
    const fedPorts = new Set(feeds.filter((f) => { const c = components().get(f.at.instanceId); return c && !isVessel(c); }).map((f) => key(f.at)));
    network = new HydraulicNetwork(scene, pumps, fedPorts);
  }

  function configure(next: Pick<SimulationOptions, 'feeds' | 'pumps'>, strict: boolean) {
    const byId = components();
    for (const f of next.feeds ?? []) {
      if (typeof f.rate !== 'number' || !Number.isFinite(f.rate) || f.rate < 0) throw new Error(`feed at ${f.at.instanceId}: rate must be a finite number ≥ 0 m³/s`);
      const c = byId.get(f.at.instanceId);
      if (strict && (!c || !definitionFor(c.type, c.properties).ports.some((p) => p.id === f.at.portId))) throw new Error(`feed at unknown port ${f.at.instanceId} "${f.at.portId}"`);
      if (strict && scene.connections.some((x) => key(x.from) === key(f.at) || key(x.to) === key(f.at))) throw new Error(`feed at ${f.at.instanceId} "${f.at.portId}": port is connected; feeds enter at free ports`);
    }
    const curves: Record<string, PumpCurve> = {};
    for (const [id, p] of Object.entries(next.pumps ?? {})) {
      if (strict && byId.get(id)?.type !== 'pump') throw new Error(`pump ${id}: no pump with that id`);
      if (byId.get(id)?.type === 'pump') curves[id] = assertCurve(id, p);
    }
    feeds = (next.feeds ?? []).filter((f) => byId.has(f.at.instanceId));
    pumps = curves;
    rebuild();
  }

  /** Tank terminal head: its liquid surface; a port above the surface is "dry" (inflow only). */
  const surface = (componentId: string) => {
    const c = components().get(componentId)!;
    return bottomOf(c) + vessel(componentId).heightAt(volumes.get(componentId) ?? 0);
  };
  /** Where a vessel port meets the liquid: its height inside the vessel (a cone outlet drains at the tip). */
  const portLevel = (t: Terminal) => bottomOf(components().get(t.component)!) + vessel(t.component).portHeight(t.port!);
  const tankDry = (t: Terminal) => t.kind === 'tank' && surface(t.component) <= portLevel(t) + 1e-12;
  const fixedHead = (t: Terminal) => (t.kind === 'tank' ? Math.max(surface(t.component), portLevel(t)) : t.elevation);

  /** Solves the junction heads (Gauss–Seidel bisection) and returns the flow of every link. */
  function solve(): { linkFlows: number[]; blockedFeeds: Set<string> } {
    const injection = new Map<string, number>();
    for (const f of feeds) {
      const c = components().get(f.at.instanceId)!;
      if (!isVessel(c)) injection.set(`node:${key(f.at)}`, (injection.get(`node:${key(f.at)}`) ?? 0) + f.rate);
    }
    const nodes = [...network.terminals.values()].filter((t) => t.kind === 'node');
    const incident = new Map(nodes.map((n) => [n.id, network.links.filter((l) => l.a === n || l.b === n)]));
    const fixed = [...network.terminals.values()].filter((t) => t.kind !== 'node').map(fixedHead);
    const span = Math.max(1, ...fixed.map(Math.abs)) + 1e3;
    const head = (t: Terminal) => (t.kind === 'node' ? heads.get(t.id) ?? 0 : fixedHead(t));
    const outflow = (n: Terminal, h: number) =>
      incident.get(n.id)!.reduce((sum, l) => {
        if (l.a === n && l.b === n) return sum;
        return sum + (l.a === n ? linkFlow(l, h - head(l.b), tankDry) : -linkFlow(l, head(l.a) - h, tankDry));
      }, 0);
    const blockedFeeds = new Set<string>();
    for (const n of nodes) if (!heads.has(n.id)) heads.set(n.id, fixed.length ? fixed.reduce((a, b) => a + b, 0) / fixed.length : 0);
    for (let sweep = 0; sweep < 200; sweep++) {
      let change = 0;
      for (const n of nodes) {
        const q = injection.get(n.id) ?? 0;
        if (outflow(n, span) < q - 1e-12) { blockedFeeds.add(n.id); continue; }
        const h = rootOfIncreasing((x) => outflow(n, x) - q, heads.get(n.id)!, 0.05, 1e-11, -span, span);
        change = Math.max(change, Math.abs(h - (heads.get(n.id) ?? h)));
        heads.set(n.id, h);
      }
      if (change < 1e-10) break;
    }
    // Below 1 µL/s a flow is solver tolerance, not physics (e.g. a dead-end tee): report it as zero.
    const linkFlows = network.links.map((l) => {
      const q = l.a === l.b ? 0 : linkFlow(l, head(l.a) - head(l.b), tankDry);
      return Math.abs(q) < 1e-9 ? 0 : q;
    });
    return { linkFlows, blockedFeeds };
  }

  function substep(h: number) {
    const stepNotes: SimulationNote[] = [...network.notes];
    let remaining = h;
    let lastFlows = new Map<string, number>();
    while (remaining > 1e-12) {
      const { linkFlows, blockedFeeds } = solve();
      for (const id of blockedFeeds) {
        const t = network.terminals.get(id)!;
        stepNotes.push({ kind: 'blocked', instanceId: t.component, portId: t.port });
      }
      // Net flow into each tank and onto free ends.
      const into = new Map<string, number>();
      let spill = 0;
      network.links.forEach((l, i) => {
        const q = linkFlows[i];
        if (q === 0) return;
        for (const [t, sign] of [[l.a, -1], [l.b, 1]] as const) {
          if (t.kind === 'tank') into.set(t.component, (into.get(t.component) ?? 0) + sign * q);
          if (t.kind === 'free' && sign * q > 0) spill += sign * q;
        }
      });
      for (const f of feeds) if (isVessel(components().get(f.at.instanceId)!)) into.set(f.at.instanceId, (into.get(f.at.instanceId) ?? 0) + f.rate);
      const injected = feeds.filter((f) => !isVessel(components().get(f.at.instanceId)!) && !blockedFeeds.has(`node:${key(f.at)}`)).reduce((a, f) => a + f.rate, 0);
      const tankFed = feeds.filter((f) => isVessel(components().get(f.at.instanceId)!)).reduce((a, f) => a + f.rate, 0);
      // Shorten the step so no tank drops below its lowest connected port within it.
      let step = remaining;
      for (const [id, q] of into) {
        if (q >= 0) continue;
        const lowest = Math.min(...network.links.flatMap((l) => [l.a, l.b]).filter((t) => t.kind === 'tank' && t.component === id).map(portLevel));
        const bottom = bottomOf(components().get(id)!);
        const above = Math.max(0, (volumes.get(id) ?? 0) - vessel(id).volumeAt(lowest - bottom));
        step = Math.min(step, Math.max(above / -q, 1e-6));
      }
      for (const [id, q] of into) {
        let v = (volumes.get(id) ?? 0) + q * step;
        const max = vessel(id).maxVolume;
        if (v > max) {
          spilled += v - max;
          v = max;
          stepNotes.push({ kind: 'overflow', instanceId: id });
        }
        volumes.set(id, Math.max(0, v));
      }
      fed += (injected + tankFed) * step;
      spilled += spill * step;
      lastFlows = new Map();
      network.links.forEach((l, i) => { for (const [c, sign] of l.connections) lastFlows.set(c, (lastFlows.get(c) ?? 0) + sign * linkFlows[i]); });
      remaining -= step;
    }
    flows = lastFlows;
    notes = stepNotes;
    time += h;
  }

  function state(): SimulationState {
    const timestamp = clock();
    const assumed: SimulationNote[] = tanks().filter((c) => typeof c.properties.level !== 'number').map((c) => ({ kind: 'assumed-empty', instanceId: c.id }));
    const unique = new Map([...assumed, ...notes].map((n) => [JSON.stringify(n), n]));
    return {
      time,
      levels: Object.fromEntries([...volumes].map(([id, v]) => [id, Math.min(100, Math.max(0, vessel(id).percentAt(v)))])),
      flows: scene.connections.map((c) => ({ connectionId: c.id, rate: flows.get(c.id) ?? 0, quality: 'GOOD', source: 'SIMULATED', sourceTimestamp: timestamp })),
      totals: { fed, spilled, stored: [...volumes.values()].reduce((a, b) => a + b, 0) },
      notes: [...unique.values()],
      model: { name: HYDRAULIC.name, version: HYDRAULIC.version },
    };
  }

  function load(next: ScadaScene, keep: boolean) {
    scene = next;
    volumes = new Map(tanks().map((c) => [c.id, keep && volumes.has(c.id) ? volumes.get(c.id)! : vesselOf(c.type, c.properties)!.volumeAtPercent(authored(c))]));
    heads = new Map();
  }

  load(initial, false);
  configure(options, true);
  notes = [...network!.notes];

  return {
    state,
    step(seconds) {
      if (typeof seconds !== 'number' || !Number.isFinite(seconds) || seconds < 0) throw new Error('step: seconds must be a finite number ≥ 0');
      if (seconds === 0) {
        // Solve at the current levels without advancing time, so the state shows the starting flows.
        const { linkFlows } = solve();
        flows = new Map();
        network.links.forEach((l, i) => { for (const [c, sign] of l.connections) flows.set(c, (flows.get(c) ?? 0) + sign * linkFlows[i]); });
        return state();
      }
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
      time = 0; fed = 0; spilled = 0;
      flows = new Map();
      load(scene, false);
      rebuild();
      notes = [...network.notes];
      return state();
    },
  };
}
