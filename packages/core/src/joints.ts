import { assemblyOf, moveAssembly } from './assembly';
import { multiplyQuaternions, normalizeQuaternion, quaternionFromUnitVectors } from './quaternion';
import { routeScene, type PipeRoute, type RoutingOptions } from './routing';
import type { ComponentInstance, QuaternionTuple, ScadaScene, SceneConnection, Vector3Tuple } from './scene';
import { portToWorld, type WorldPort } from './transforms';
import { quaternionToTuple, tupleToQuaternion, tupleToVector } from './vectors';

type Endpoint = SceneConnection['from'];

export interface JointOptions extends RoutingOptions {
  /** Ports closer than this, facing each other within 1°, count as joined. Metres, default 0.001. */
  tolerance?: number;
  /** A routed run shorter than this is treated as a mistake, not a pipe. Metres, default 0.2 (shortest pipe). */
  minRunLength?: number;
  /** Routes already computed for this scene, to avoid routing twice. */
  routes?: readonly PipeRoute[];
}

export interface OpenJoint {
  connectionId: string;
  from: Endpoint;
  to: Endpoint;
  /** Distance between the two port centres, metres. */
  distance: number;
  /** Angle between the `from` direction and the reversed `to` direction, radians (0 = facing). */
  angle: number;
  /** `unroutable`: no pipe can be drawn between the ports; `too-short`: the drawn run is shorter than any pipe. */
  problem: 'unroutable' | 'too-short';
}

const dot = (a: Vector3Tuple, b: Vector3Tuple) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const angleBetween = (a: WorldPort, b: WorldPort) => Math.acos(Math.min(1, Math.max(-1, -dot(a.direction, b.direction))));

function worldPort(scene: ScadaScene, e: Endpoint, options: RoutingOptions): WorldPort | undefined {
  const c = scene.components.find((x) => x.id === e.instanceId);
  const port = c && options.resolvePorts(c.type, c.properties)?.find((p) => p.id === e.portId);
  return c && port ? portToWorld(c, port) : undefined;
}

/**
 * Connections whose ports do not actually meet and cannot be drawn as a sensible pipe: the route is
 * invalid, or the run between them is shorter than `minRunLength`. Deliberate routed pipe runs
 * are not reported. Display only; nothing is changed.
 */
export function findOpenJoints(scene: ScadaScene, options: JointOptions): OpenJoint[] {
  const tolerance = options.tolerance ?? 0.001;
  const minRun = options.minRunLength ?? 0.2;
  const routes = new Map((options.routes ?? routeScene(scene, options)).map((r) => [r.connectionId, r]));
  const open: OpenJoint[] = [];
  for (const c of scene.connections) {
    const route = routes.get(c.id);
    const a = worldPort(scene, c.from, options), b = worldPort(scene, c.to, options);
    if (!route || !a || !b) continue;
    const distance = Math.hypot(...a.position.map((n, i) => n - b.position[i]));
    const angle = angleBetween(a, b);
    if (distance <= tolerance && angle <= Math.PI / 180) continue;
    if (route.status === 'invalid') open.push({ connectionId: c.id, from: c.from, to: c.to, distance, angle, problem: 'unroutable' });
    else if (route.kind !== 'direct' && route.length < minRun) open.push({ connectionId: c.id, from: c.from, to: c.to, distance, angle, problem: 'too-short' });
  }
  return open;
}

export type SeatResult =
  | { ok: true; scene: ScadaScene; /** How far the seated port moved, metres. */ moved: number }
  | { ok: false; error: { code: 'UNKNOWN_CONNECTION' | 'NOT_AN_ENDPOINT' | 'UNRESOLVED'; message: string } };

/** Quarter-turn rolls about a unit axis. */
function rolls(axis: Vector3Tuple): QuaternionTuple[] {
  return [0, 1, 2, 3].map((k) => {
    const s = Math.sin((k * Math.PI) / 4);
    return [axis[0] * s, axis[1] * s, axis[2] * s, Math.cos((k * Math.PI) / 4)];
  });
}

/**
 * Moves `instanceId` so its port on `connectionId` sits exactly on the partner port, facing it.
 * The smallest turn is used, then the quarter-turn roll about the port axis that brings the
 * part's other connected ports closest to their partners. When the partner is in the same
 * assembly only this part moves; otherwise its whole assembly moves with it (ADR-0008).
 */
export function seatOnConnection(scene: ScadaScene, connectionId: string, instanceId: string, options: RoutingOptions): SeatResult {
  const connection = scene.connections.find((c) => c.id === connectionId);
  if (!connection) return { ok: false, error: { code: 'UNKNOWN_CONNECTION', message: `No connection "${connectionId}".` } };
  const [own, partner] = connection.from.instanceId === instanceId ? [connection.from, connection.to] : connection.to.instanceId === instanceId ? [connection.to, connection.from] : [];
  if (!own || !partner) return { ok: false, error: { code: 'NOT_AN_ENDPOINT', message: `"${instanceId}" is not on connection "${connectionId}".` } };
  const moving = scene.components.find((c) => c.id === instanceId)!;
  const ownPort = options.resolvePorts(moving.type, moving.properties)?.find((p) => p.id === own.portId);
  const target = worldPort(scene, partner, options);
  if (!ownPort || !target) return { ok: false, error: { code: 'UNRESOLVED', message: 'A port on this connection cannot be resolved.' } };

  const current = portToWorld(moving, ownPort);
  const wanted: Vector3Tuple = [-target.direction[0], -target.direction[1], -target.direction[2]];
  const turned = multiplyQuaternions(quaternionFromUnitVectors(current.direction, wanted), quaternionToTuple(moving.rotation));
  const poseFor = (roll: QuaternionTuple): ComponentInstance => {
    const rotation = tupleToQuaternion(normalizeQuaternion(multiplyQuaternions(roll, turned)));
    const anchor = portToWorld({ position: { x: 0, y: 0, z: 0 }, rotation, scale: moving.scale }, ownPort).position;
    return { ...moving, rotation, position: tupleToVector([target.position[0] - anchor[0], target.position[1] - anchor[1], target.position[2] - anchor[2]]) };
  };
  // Score each roll by how far this part's other connected ports land from their partners.
  const others = scene.connections.filter((c) => c.id !== connectionId && (c.from.instanceId === instanceId || c.to.instanceId === instanceId));
  const misfit = (pose: ComponentInstance) => {
    const trial = { ...scene, components: scene.components.map((c) => (c.id === instanceId ? pose : c)) };
    return others.reduce((sum, c) => {
      const a = worldPort(trial, c.from, options), b = worldPort(trial, c.to, options);
      return a && b ? sum + Math.hypot(...a.position.map((n, i) => n - b.position[i])) + angleBetween(a, b) : sum;
    }, 0);
  };
  const candidates = rolls(wanted).map(poseFor);
  const best = candidates.reduce((x, y) => (misfit(y) < misfit(x) - 1e-9 ? y : x));

  const sameAssembly = assemblyOf(scene, instanceId).includes(partner.instanceId);
  const next = sameAssembly
    ? { ...scene, components: scene.components.map((c) => (c.id === instanceId ? best : c)) }
    : moveAssembly(scene, instanceId, best.position, best.rotation);
  return { ok: true, scene: next, moved: Math.hypot(...current.position.map((n, i) => n - target.position[i])) };
}
