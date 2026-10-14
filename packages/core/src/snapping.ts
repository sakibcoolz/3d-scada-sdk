import { portsCompatible, type ComponentInstance, type ComponentKind, type ConnectionPort, type ScadaScene, type SceneConnection, type Vector3Tuple } from './scene';
import { portToWorld, type WorldPort } from './transforms';

export type SnapStatus = 'ok' | 'incompatible' | 'occupied' | 'misaligned';

export interface SnapCandidate {
  movingPortId: string;
  target: SceneConnection['to'];
  /** Distance between the two world-space port anchors, metres. */
  distance: number;
  /** Angle between the moving port normal and the reversed target normal, radians. */
  angle: number;
  status: SnapStatus;
}

export interface SnapOptions {
  resolvePorts: (kind: ComponentKind) => readonly ConnectionPort[] | undefined;
  /** Search radius around each moving port, metres. Default 0.5. */
  maxDistance?: number;
  /** Largest allowed misalignment before snapping, radians. Default π/4. */
  maxAngle?: number;
}

export type SnapResult =
  | {
      ok: true;
      candidate: SnapCandidate;
      /** Transform for the moving component that makes the ports coincide with opposing normals. */
      position: Vector3Tuple;
      rotation: Vector3Tuple;
      connection: Pick<SceneConnection, 'from' | 'to'>;
    }
  | { ok: false; reason: 'NO_CANDIDATE'; nearest?: SnapCandidate };

type Quaternion = [number, number, number, number]; // x, y, z, w

const dot = (a: Vector3Tuple, b: Vector3Tuple) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

function compareCandidates(a: SnapCandidate, b: SnapCandidate): number {
  return (
    a.distance - b.distance ||
    a.target.instanceId.localeCompare(b.target.instanceId) ||
    a.target.portId.localeCompare(b.target.portId) ||
    a.movingPortId.localeCompare(b.movingPortId)
  );
}

function occupiedPorts(scene: ScadaScene): Set<string> {
  const occupied = new Set<string>();
  for (const c of scene.connections) {
    occupied.add(JSON.stringify([c.from.instanceId, c.from.portId]));
    occupied.add(JSON.stringify([c.to.instanceId, c.to.portId]));
  }
  return occupied;
}

/**
 * Lists every port pairing between `moving` and the rest of the scene within `maxDistance`,
 * nearest first with a stable tie-break, each marked with whether it can snap and why not.
 * A scene component with the same id as `moving` is treated as the one being dragged and skipped.
 */
export function findSnapCandidates(scene: ScadaScene, moving: ComponentInstance, options: SnapOptions): SnapCandidate[] {
  const maxDistance = options.maxDistance ?? 0.5;
  const maxAngle = options.maxAngle ?? Math.PI / 4;
  const occupied = occupiedPorts(scene);
  const movingPorts = (options.resolvePorts(moving.kind) ?? []).map((port) => ({ port, world: portToWorld(moving, port) }));
  const candidates: SnapCandidate[] = [];

  for (const other of scene.components) {
    if (other.id === moving.id) continue;
    for (const targetPort of options.resolvePorts(other.kind) ?? []) {
      const target = portToWorld(other, targetPort);
      for (const { port, world } of movingPorts) {
        const offset: Vector3Tuple = [
          target.position[0] - world.position[0],
          target.position[1] - world.position[1],
          target.position[2] - world.position[2],
        ];
        const distance = Math.hypot(...offset);
        if (distance > maxDistance) continue;
        // Normals must oppose: compare the moving normal with the reversed target normal.
        const angle = Math.acos(Math.min(1, Math.max(-1, -dot(world.direction, target.direction))));
        let status: SnapStatus = 'ok';
        if (!portsCompatible(port, targetPort)) status = 'incompatible';
        else if (occupied.has(JSON.stringify([moving.id, port.id])) || occupied.has(JSON.stringify([other.id, targetPort.id])))
          status = 'occupied';
        else if (angle > maxAngle) status = 'misaligned';
        candidates.push({ movingPortId: port.id, target: { instanceId: other.id, portId: targetPort.id }, distance, angle, status });
      }
    }
  }
  return candidates.sort(compareCandidates);
}

/**
 * Snaps `moving` to the best eligible candidate: the smallest rotation that makes its port normal
 * oppose the target normal (roll about the port axis is kept), then a translation that makes the
 * anchors coincide. Returns the proposed transform and endpoints; the scene is not modified.
 */
export function snapComponent(scene: ScadaScene, moving: ComponentInstance, options: SnapOptions): SnapResult {
  const candidates = findSnapCandidates(scene, moving, options);
  const candidate = candidates.find((c) => c.status === 'ok');
  if (!candidate) return candidates.length > 0 ? { ok: false, reason: 'NO_CANDIDATE', nearest: candidates[0] } : { ok: false, reason: 'NO_CANDIDATE' };

  const targetInstance = scene.components.find((c) => c.id === candidate.target.instanceId)!;
  const targetPort = options.resolvePorts(targetInstance.kind)!.find((p) => p.id === candidate.target.portId)!;
  const movingPort = options.resolvePorts(moving.kind)!.find((p) => p.id === candidate.movingPortId)!;
  const target: WorldPort = portToWorld(targetInstance, targetPort);
  const current = portToWorld(moving, movingPort);

  const wanted: Vector3Tuple = [-target.direction[0], -target.direction[1], -target.direction[2]];
  const orientation = normalizeQuaternion(multiply(fromUnitVectors(current.direction, wanted), fromEulerXYZ(moving.rotation)));
  const rotation = toEulerXYZ(orientation);

  const anchor = portToWorld({ position: [0, 0, 0], rotation }, movingPort).position;
  const position: Vector3Tuple = [
    target.position[0] - anchor[0],
    target.position[1] - anchor[1],
    target.position[2] - anchor[2],
  ];
  return {
    ok: true,
    candidate,
    position,
    rotation,
    connection: { from: { instanceId: moving.id, portId: movingPort.id }, to: candidate.target },
  };
}

// Quaternion helpers. Conventions match Three.js so Euler XYZ round-trips with the renderer.

function multiply(a: Quaternion, b: Quaternion): Quaternion {
  const [ax, ay, az, aw] = a;
  const [bx, by, bz, bw] = b;
  return [
    ax * bw + aw * bx + ay * bz - az * by,
    ay * bw + aw * by + az * bx - ax * bz,
    az * bw + aw * bz + ax * by - ay * bx,
    aw * bw - ax * bx - ay * by - az * bz,
  ];
}

function normalizeQuaternion(q: Quaternion): Quaternion {
  const length = Math.hypot(...q);
  return [q[0] / length, q[1] / length, q[2] / length, q[3] / length];
}

function fromEulerXYZ([x, y, z]: Vector3Tuple): Quaternion {
  const c1 = Math.cos(x / 2);
  const c2 = Math.cos(y / 2);
  const c3 = Math.cos(z / 2);
  const s1 = Math.sin(x / 2);
  const s2 = Math.sin(y / 2);
  const s3 = Math.sin(z / 2);
  return [
    s1 * c2 * c3 + c1 * s2 * s3,
    c1 * s2 * c3 - s1 * c2 * s3,
    c1 * c2 * s3 + s1 * s2 * c3,
    c1 * c2 * c3 - s1 * s2 * s3,
  ];
}

function toEulerXYZ([x, y, z, w]: Quaternion): Vector3Tuple {
  const m11 = 1 - 2 * (y * y + z * z);
  const m12 = 2 * (x * y - w * z);
  const m13 = 2 * (x * z + w * y);
  const m22 = 1 - 2 * (x * x + z * z);
  const m23 = 2 * (y * z - w * x);
  const m32 = 2 * (y * z + w * x);
  const m33 = 1 - 2 * (x * x + y * y);
  // atan2 stays accurate near ±90° about Y, where asin(m13) loses precision (gimbal lock).
  const cosY = Math.hypot(m11, m12);
  const ey = Math.atan2(m13, cosY);
  if (cosY > 1e-7) return [Math.atan2(-m23, m33), ey, Math.atan2(-m12, m11)];
  return [Math.atan2(m32, m22), ey, 0];
}

/** Shortest rotation taking unit vector `a` onto unit vector `b`. A half turn prefers the world Y axis. */
function fromUnitVectors(a: Vector3Tuple, b: Vector3Tuple): Quaternion {
  const r = dot(a, b) + 1;
  if (r < 1e-9) {
    // Opposite vectors: turn half way round an axis perpendicular to `a`, upright when possible.
    const axis: Vector3Tuple = Math.abs(a[1]) < 0.999 ? [-a[1] * a[0], 1 - a[1] * a[1], -a[1] * a[2]] : [1 - a[0] * a[0], -a[0] * a[1], -a[0] * a[2]];
    const length = Math.hypot(...axis);
    return [axis[0] / length, axis[1] / length, axis[2] / length, 0];
  }
  return normalizeQuaternion([a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0], r]);
}
