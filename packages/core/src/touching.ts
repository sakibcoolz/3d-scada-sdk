import { portsCompatible, type ComponentInstance, type ComponentKind, type ConnectionPort, type ScadaScene, type SceneConnection } from './scene';
import { portToWorld, type WorldPort } from './transforms';
import { validateScene, type SceneValidationOptions } from './validation';

type Endpoint = SceneConnection['from'];

export interface TouchingOptions {
  resolvePorts: (type: ComponentKind, properties?: ComponentInstance['properties']) => readonly ConnectionPort[] | undefined;
  /** Largest distance between two port centres that still counts as the same point, metres. Default 0.001. */
  tolerance?: number;
  /** Largest deviation from exactly opposite facing directions, radians. Default 1°. */
  maxAngle?: number;
}

export interface TouchingMatch {
  /** The endpoint that sorts first (instance id, then port id); `to` is the other. */
  from: Endpoint;
  to: Endpoint;
}

export interface TouchingRejection extends TouchingMatch {
  /** Why a pair that meets face to face is not joined. */
  reason: 'incompatible' | 'occupied' | 'ambiguous';
}

export interface TouchingResult {
  matches: TouchingMatch[];
  rejected: TouchingRejection[];
}

const key = (e: Endpoint) => JSON.stringify([e.instanceId, e.portId]);

/**
 * Ports of different components that sit at the same point and face each other: candidates for
 * explicit connections (ADR-0002 still holds: nothing is connected until `connectTouchingPorts`
 * or the user writes the edge). Pairs already connected to each other are skipped. Pairs with a
 * type/bore mismatch, a port used by another connection, or a port that touches more than one
 * candidate are reported in `rejected`, never matched.
 */
export function findTouchingPorts(scene: ScadaScene, options: TouchingOptions): TouchingResult {
  const tolerance = options.tolerance ?? 0.001;
  const minOpposition = Math.cos(options.maxAngle ?? Math.PI / 180);
  const occupied = new Set(scene.connections.flatMap((c) => [key(c.from), key(c.to)]));
  // Pairs that are already joined to each other (either way round) are done, not problems.
  const joined = new Set(scene.connections.flatMap((c) => [`${key(c.from)}|${key(c.to)}`, `${key(c.to)}|${key(c.from)}`]));

  type Entry = { endpoint: Endpoint; port: ConnectionPort; world: WorldPort };
  const entries: Entry[] = scene.components.flatMap((c) =>
    (options.resolvePorts(c.type, c.properties) ?? []).map((port) => ({ endpoint: { instanceId: c.id, portId: port.id }, port, world: portToWorld(c, port) })),
  );

  // Spatial hash: cells of the tolerance size; neighbours are found in the 27 surrounding cells.
  const cell = (v: number) => Math.floor(v / Math.max(tolerance, 1e-6));
  const grid = new Map<string, Entry[]>();
  for (const e of entries) {
    const k = e.world.position.map(cell).join(',');
    grid.set(k, [...(grid.get(k) ?? []), e]);
  }

  const pairs: { a: Entry; b: Entry }[] = [];
  for (const a of entries) {
    const [cx, cy, cz] = a.world.position.map(cell);
    for (let dx = -1; dx <= 1; dx++)
      for (let dy = -1; dy <= 1; dy++)
        for (let dz = -1; dz <= 1; dz++)
          for (const b of grid.get(`${cx + dx},${cy + dy},${cz + dz}`) ?? []) {
            if (b.endpoint.instanceId === a.endpoint.instanceId || key(b.endpoint) <= key(a.endpoint)) continue;
            const d = Math.hypot(...a.world.position.map((n, i) => n - b.world.position[i]));
            const opposition = -a.world.direction.reduce((s, n, i) => s + n * b.world.direction[i], 0);
            if (d <= tolerance && opposition >= minOpposition) pairs.push({ a, b });
          }
  }

  const touches = new Map<string, number>();
  for (const { a, b } of pairs) for (const e of [a, b]) touches.set(key(e.endpoint), (touches.get(key(e.endpoint)) ?? 0) + 1);

  const matches: TouchingMatch[] = [];
  const rejected: TouchingRejection[] = [];
  for (const { a, b } of pairs) {
    const pair = { from: a.endpoint, to: b.endpoint };
    if (joined.has(`${key(a.endpoint)}|${key(b.endpoint)}`)) continue;
    if (touches.get(key(a.endpoint))! > 1 || touches.get(key(b.endpoint))! > 1) rejected.push({ ...pair, reason: 'ambiguous' });
    else if (!portsCompatible(a.port, b.port)) rejected.push({ ...pair, reason: 'incompatible' });
    else if (occupied.has(key(a.endpoint)) || occupied.has(key(b.endpoint))) rejected.push({ ...pair, reason: 'occupied' });
    else matches.push(pair);
  }
  const order = (x: TouchingMatch, y: TouchingMatch) => (key(x.from) < key(y.from) ? -1 : key(x.from) > key(y.from) ? 1 : key(x.to) < key(y.to) ? -1 : 1);
  return { matches: matches.sort(order), rejected: rejected.sort(order) };
}

export type ConnectTouchingResult =
  | { ok: true; scene: ScadaScene; added: number; rejected: TouchingRejection[] }
  | { ok: false; error: { code: string; message: string } };

/** Writes every `findTouchingPorts` match as an explicit connection, validated as one change. */
export function connectTouchingPorts(
  scene: ScadaScene,
  options: TouchingOptions & Omit<SceneValidationOptions, 'resolvePorts'> & { createId: () => string },
): ConnectTouchingResult {
  const { matches, rejected } = findTouchingPorts(scene, options);
  if (matches.length === 0) return { ok: true, scene, added: 0, rejected };
  const next: ScadaScene = { ...scene, connections: [...scene.connections, ...matches.map((m) => ({ id: options.createId(), ...m }))] };
  const result = validateScene(next, options);
  if (!result.ok) return { ok: false, error: { code: result.errors[0].code, message: result.errors[0].message } };
  return { ok: true, scene: result.scene, added: matches.length, rejected };
}
