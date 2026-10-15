import {
  portsCompatible,
  type ComponentInstance,
  type ComponentKind,
  type ConnectionPort,
  type QuaternionLike,
  type Vector3Like,
  type ScadaScene,
  type SceneConnection,
  type Vector3Tuple,
} from './scene.js';
import { multiplyQuaternions, normalizeQuaternion, quaternionFromUnitVectors } from './quaternion.js';
import { portToWorld, type WorldPort } from './transforms.js';
import { quaternionToTuple, tupleToQuaternion, tupleToVector } from './vectors.js';

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
  resolvePorts: (type: ComponentKind, properties?: ComponentInstance['properties']) => readonly ConnectionPort[] | undefined;
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
      position: Vector3Like;
      rotation: QuaternionLike;
      connection: Pick<SceneConnection, 'from' | 'to'>;
    }
  | { ok: false; reason: 'NO_CANDIDATE'; nearest?: SnapCandidate };

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
  const movingPorts = (options.resolvePorts(moving.type, moving.properties) ?? []).map((port) => ({ port, world: portToWorld(moving, port) }));
  const candidates: SnapCandidate[] = [];

  for (const other of scene.components) {
    if (other.id === moving.id) continue;
    for (const targetPort of options.resolvePorts(other.type, other.properties) ?? []) {
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
  const targetPort = options.resolvePorts(targetInstance.type, targetInstance.properties)!.find((p) => p.id === candidate.target.portId)!;
  const movingPort = options.resolvePorts(moving.type, moving.properties)!.find((p) => p.id === candidate.movingPortId)!;
  const target: WorldPort = portToWorld(targetInstance, targetPort);
  const current = portToWorld(moving, movingPort);

  const wanted: Vector3Tuple = [-target.direction[0], -target.direction[1], -target.direction[2]];
  const rotation = tupleToQuaternion(
    normalizeQuaternion(multiplyQuaternions(quaternionFromUnitVectors(current.direction, wanted), quaternionToTuple(moving.rotation))),
  );
  const anchor = portToWorld({ position: { x: 0, y: 0, z: 0 }, rotation, scale: moving.scale }, movingPort).position;
  const position = tupleToVector([target.position[0] - anchor[0], target.position[1] - anchor[1], target.position[2] - anchor[2]]);
  return {
    ok: true,
    candidate,
    position,
    rotation,
    connection: { from: { instanceId: moving.id, portId: movingPort.id }, to: candidate.target },
  };
}
