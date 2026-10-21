import type { FloorSlab } from './floor.js';

/** Furthest a controller ray reaches for a teleport, metres. */
export const TELEPORT_RANGE = 30;
/** One flick of the thumbstick turns the view by this much, radians (30°). */
export const SNAP_TURN = Math.PI / 6;
/** Thumbstick deflection that counts as a flick; it must return under the reset value before the next. */
export const SNAP_THRESHOLD = 0.7;
export const SNAP_RESET = 0.3;

type Vec3 = { x: number; y: number; z: number };

/** Where a walker stands on the floor and which way they face: yaw about +Y, 0 looking along −Z. */
export interface StandPose {
  x: number;
  z: number;
  yaw: number;
}

/**
 * The pose a VR session starts in: standing on the floor under the desktop camera, facing what it
 * looked at. The headset adds the walker's own eye height (`local-floor`), so the plant is at true scale.
 */
export function startPose(camera: Vec3, target: Vec3): StandPose {
  const dx = target.x - camera.x, dz = target.z - camera.z;
  // Looking straight down gives no heading; keep facing −Z.
  const yaw = Math.hypot(dx, dz) < 1e-9 ? 0 : Math.atan2(-dx, -dz);
  return { x: camera.x, z: camera.z, yaw };
}

/**
 * The floor point a controller ray lands on, or undefined when it points up, reaches past
 * `range`, or lands off the slab (when one is given).
 */
export function teleportTarget(origin: Vec3, direction: Vec3, slab?: FloorSlab, range = TELEPORT_RANGE): { x: number; z: number } | undefined {
  if (direction.y >= -1e-6 || origin.y <= 0) return undefined;
  const t = -origin.y / direction.y;
  const length = Math.hypot(direction.x, direction.y, direction.z);
  if (t * length > range) return undefined;
  const x = origin.x + direction.x * t, z = origin.z + direction.z * t;
  if (slab && (Math.abs(x - slab.centre.x) > slab.width / 2 || Math.abs(z - slab.centre.z) > slab.depth / 2)) return undefined;
  return { x, z };
}

/**
 * The offset for `XRReferenceSpace.getOffsetReferenceSpace` that puts the tracking origin at `pose`:
 * the inverse of "turn by yaw, then move to (x, 0, z)", as a position and a unit quaternion.
 */
export function referenceOffset(pose: StandPose): { position: Vec3; orientation: { x: number; y: number; z: number; w: number } } {
  const c = Math.cos(pose.yaw), s = Math.sin(pose.yaw);
  // R(−yaw) applied to (−x, 0, −z).
  return {
    position: { x: s * pose.z - c * pose.x, y: 0, z: -(s * pose.x + c * pose.z) },
    orientation: { x: 0, y: Math.sin(-pose.yaw / 2), z: 0, w: Math.cos(-pose.yaw / 2) },
  };
}

/** Where a point of the tracking space lands in the scene under `pose`: turn by yaw, then move. */
export function trackedToScene(pose: StandPose, p: Vec3): Vec3 {
  const c = Math.cos(pose.yaw), s = Math.sin(pose.yaw);
  return { x: pose.x + c * p.x + s * p.z, y: p.y, z: pose.z - s * p.x + c * p.z };
}

/** The inverse of `trackedToScene`: where a scene point sits in tracking space under `pose`. */
export function sceneToTracked(pose: StandPose, p: Vec3): Vec3 {
  const c = Math.cos(pose.yaw), s = Math.sin(pose.yaw), dx = p.x - pose.x, dz = p.z - pose.z;
  return { x: c * dx - s * dz, y: p.y, z: s * dx + c * dz };
}

/** The pose that puts the head (in tracking space) over `target`, keeping the heading. */
export function teleportHead(pose: StandPose, head: Vec3, target: { x: number; z: number }): StandPose {
  return poseKeepingHead(pose.yaw, { x: target.x, y: 0, z: target.z }, head);
}

/** The pose turned to `yaw` about the head, so the walker turns in place. */
export function turnAboutHead(pose: StandPose, head: Vec3, yaw: number): StandPose {
  return poseKeepingHead(yaw, trackedToScene(pose, head), head);
}

function poseKeepingHead(yaw: number, headInScene: Vec3, head: Vec3): StandPose {
  const turned = trackedToScene({ x: 0, z: 0, yaw }, head);
  return { x: headInScene.x - turned.x, z: headInScene.z - turned.z, yaw };
}

/**
 * Snap turn from a thumbstick: returns the new yaw and whether the stick is armed for the next flick.
 * Pushing right turns right (clockwise seen from above).
 */
export function snapTurn(yaw: number, stickX: number, armed: boolean): { yaw: number; armed: boolean } {
  if (armed && Math.abs(stickX) >= SNAP_THRESHOLD) return { yaw: yaw - Math.sign(stickX) * SNAP_TURN, armed: false };
  return { yaw, armed: armed || Math.abs(stickX) < SNAP_RESET };
}
