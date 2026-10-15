import type { ComponentInstance, ComponentKind, ConnectionPort, ScadaScene, SceneConnection, Vector3Tuple } from './scene.js';
import { portToWorld, type WorldPort } from './transforms.js';

export type RouteKind = 'direct' | 'straight' | 'orthogonal';
export type RouteFailure = 'UNRESOLVED' | 'UNSUPPORTED_ORIENTATION' | 'UNROUTABLE' | 'BEND_TOO_TIGHT';

export interface RouteBend {
  /** Where the two straight centrelines would meet; the fitting curves inside this corner. */
  corner: Vector3Tuple;
  radius: number;
}

/** Derived pipe centreline for one connection. Never persisted; recompute from the scene. */
export type PipeRoute =
  | {
      status: 'ok';
      connectionId: string;
      kind: RouteKind;
      from: Vector3Tuple;
      to: Vector3Tuple;
      /** Polyline from the `from` port to the `to` port through each corner, metres. */
      points: Vector3Tuple[];
      bends: RouteBend[];
      /** Polyline length through the corners, metres. */
      length: number;
    }
  | {
      status: 'invalid';
      connectionId: string;
      reason: Exclude<RouteFailure, 'UNRESOLVED'>;
      from: Vector3Tuple;
      to: Vector3Tuple;
      message: string;
    }
  | { status: 'invalid'; connectionId: string; reason: 'UNRESOLVED'; message: string };

export interface RoutingOptions {
  resolvePorts: (type: ComponentKind, properties?: ComponentInstance['properties']) => readonly ConnectionPort[] | undefined;
  /** Centreline bend radius, metres. Default 0.3 (2 × DN150, matching the catalog elbow). */
  bendRadius?: number;
}

const EPS = 1e-9;
const AXIS_ORDERS = [
  [0, 1, 2],
  [0, 2, 1],
  [1, 0, 2],
  [1, 2, 0],
  [2, 0, 1],
  [2, 1, 0],
];

const sub = (a: Vector3Tuple, b: Vector3Tuple): Vector3Tuple => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a: Vector3Tuple, b: Vector3Tuple) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const along = (p: Vector3Tuple, d: Vector3Tuple, s: number): Vector3Tuple => [p[0] + d[0] * s, p[1] + d[1] * s, p[2] + d[2] * s];
const same = (a: Vector3Tuple, b: Vector3Tuple) => Math.hypot(...sub(a, b)) < EPS;

/** The exact world axis a unit vector lies on, or undefined if it is off-axis. */
function snapToAxis(v: Vector3Tuple): Vector3Tuple | undefined {
  const index = v.findIndex((n) => Math.abs(n) > 1 - EPS);
  if (index < 0) return undefined;
  const axis: Vector3Tuple = [0, 0, 0];
  axis[index] = Math.sign(v[index]);
  return axis;
}

type Attempt = { points: Vector3Tuple[] } | { failure: 'reversal' | 'tight' };

/**
 * One candidate route: leave `from` along its normal by the bend radius, move along each axis in
 * `order`, then enter `to` against its normal. Rejected if it doubles back or a bend lacks room.
 */
function attempt(p0: Vector3Tuple, d0: Vector3Tuple, p1: Vector3Tuple, d1: Vector3Tuple, order: number[], radius: number): Attempt {
  const a = along(p0, d0, radius);
  const b = along(p1, d1, radius);
  const raw: Vector3Tuple[] = [p0, a];
  let current = a;
  for (const k of order) {
    if (Math.abs(b[k] - current[k]) > EPS) {
      current = [...current];
      current[k] = b[k];
      raw.push(current);
    }
  }
  raw.push(p1);

  // Drop zero-length steps and merge collinear runs; a 180° turn means the route doubles back.
  const points: Vector3Tuple[] = [raw[0]];
  let heading: Vector3Tuple | undefined;
  for (const p of raw.slice(1)) {
    const last = points[points.length - 1];
    if (same(p, last)) continue;
    const step = sub(p, last);
    const dir = step.map((n) => n / Math.hypot(...step)) as Vector3Tuple;
    if (heading && dot(heading, dir) < -1 + EPS) return { failure: 'reversal' };
    if (heading && dot(heading, dir) > 1 - EPS) points[points.length - 1] = p;
    else points.push(p);
    heading = dir;
  }

  // Each bend consumes one radius from both neighbouring straights.
  for (let i = 1; i < points.length; i++) {
    const bendsAtEnds = (i > 1 ? 1 : 0) + (i < points.length - 1 ? 1 : 0);
    if (Math.hypot(...sub(points[i], points[i - 1])) < bendsAtEnds * radius - EPS) return { failure: 'tight' };
  }
  return { points };
}

function polylineLength(points: Vector3Tuple[]): number {
  let length = 0;
  for (let i = 1; i < points.length; i++) length += Math.hypot(...sub(points[i], points[i - 1]));
  return length;
}

function resolve(scene: ScadaScene, endpoint: SceneConnection['from'], options: RoutingOptions): WorldPort | undefined {
  const owner = scene.components.find((c) => c.id === endpoint.instanceId);
  const port = owner && options.resolvePorts(owner.type, owner.properties)?.find((p) => p.id === endpoint.portId);
  return owner && port ? portToWorld(owner, port) : undefined;
}

/**
 * Routes one connection deterministically: `direct` for coincident ports, `straight` for opposed
 * collinear ports at any angle, otherwise an axis-aligned route with the fewest bends (ties go to
 * the first axis order x, y, z). Off-axis ports are only supported when a straight run fits.
 */
export function routeConnection(scene: ScadaScene, connection: SceneConnection, options: RoutingOptions): PipeRoute {
  const radius = options.bendRadius ?? 0.3;
  const connectionId = connection.id;
  const start = resolve(scene, connection.from, options);
  const end = resolve(scene, connection.to, options);
  if (!start || !end) {
    return { status: 'invalid', connectionId, reason: 'UNRESOLVED', message: 'An endpoint does not resolve to a declared port.' };
  }
  const from = start.position;
  const to = end.position;
  const ok = (kind: RouteKind, points: Vector3Tuple[]): PipeRoute => ({
    status: 'ok',
    connectionId,
    kind,
    from,
    to,
    points,
    bends: points.slice(1, -1).map((corner) => ({ corner, radius })),
    length: polylineLength(points),
  });
  const invalid = (reason: Exclude<RouteFailure, 'UNRESOLVED'>, message: string): PipeRoute => ({
    status: 'invalid',
    connectionId,
    reason,
    from,
    to,
    message,
  });

  const offset = sub(to, from);
  const distance = Math.hypot(...offset);
  if (distance < EPS) return ok('direct', [from]);

  const opposed = dot(start.direction, end.direction) < -1 + EPS;
  const ahead = dot(offset, start.direction) / distance;
  if (opposed && ahead > 1 - EPS) return ok('straight', [from, to]);

  const d0 = snapToAxis(start.direction);
  const d1 = snapToAxis(end.direction);
  if (!d0 || !d1) return invalid('UNSUPPORTED_ORIENTATION', 'Orthogonal routing needs both ports on world axes.');

  let best: Vector3Tuple[] | undefined;
  let tight = false;
  for (const order of AXIS_ORDERS) {
    const result = attempt(from, d0, to, d1, order, radius);
    if ('failure' in result) tight ||= result.failure === 'tight';
    else if (!best || result.points.length < best.length) best = result.points;
  }
  if (best) return ok('orthogonal', best);
  return tight
    ? invalid('BEND_TOO_TIGHT', `No route leaves room for bends of radius ${radius} m.`)
    : invalid('UNROUTABLE', 'Every orthogonal route doubles back on itself.');
}

/** Routes every connection, in connection order. */
export function routeScene(scene: ScadaScene, options: RoutingOptions): PipeRoute[] {
  return scene.connections.map((connection) => routeConnection(scene, connection, options));
}

/**
 * The pipe centreline as a polyline that follows each bend's arc (quarter circle of the bend
 * radius inside the corner) instead of the sharp corner, for placing things inside the pipe.
 * `segmentsPerBend` straight pieces approximate each arc. Consecutive duplicates are dropped.
 */
export function sampleRouteCenterline(route: Extract<PipeRoute, { status: 'ok' }>, segmentsPerBend = 8): Vector3Tuple[] {
  const { points, bends } = route;
  if (points.length < 3) return points.map((p) => [...p] as Vector3Tuple);
  const unit = (v: Vector3Tuple): Vector3Tuple => {
    const l = Math.hypot(...v);
    return [v[0] / l, v[1] / l, v[2] / l];
  };
  const out: Vector3Tuple[] = [];
  const push = (p: Vector3Tuple) => {
    if (out.length === 0 || !same(p, out[out.length - 1])) out.push(p);
  };
  push([...points[0]]);
  for (let i = 1; i < points.length - 1; i++) {
    const corner = points[i];
    const radius = bends[i - 1].radius;
    const incoming = unit(sub(corner, points[i - 1]));
    const outgoing = unit(sub(points[i + 1], corner));
    // Arc centre sits one radius back along the incoming run and one radius along the outgoing run.
    const centre = along(along(corner, incoming, -radius), outgoing, radius);
    for (let k = 0; k <= segmentsPerBend; k++) {
      const theta = (k / segmentsPerBend) * (Math.PI / 2);
      push(along(along(centre, outgoing, -radius * Math.cos(theta)), incoming, radius * Math.sin(theta)));
    }
  }
  push([...points[points.length - 1]]);
  return out;
}
