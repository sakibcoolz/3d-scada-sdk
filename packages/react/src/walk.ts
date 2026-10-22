import { rotateVector, type ScadaScene } from '@sakibcoolz/core';
import { builtInRegistry, type ComponentRegistry } from '@sakibcoolz/components';
import type { FloorSlab } from './floor.js';

/** Eye height of the desktop walker, metres. */
export const EYE_HEIGHT = 1.7;
/** Walking and running speeds, m/s. */
export const WALK_SPEED = 1.4;
export const RUN_SPEED = 3.5;
/** The walker's body radius in plan, metres: how close they get to equipment. */
export const BODY_RADIUS = 0.3;
/** Equipment wholly below this height is stepped over, metres. */
export const STEP_HEIGHT = 0.25;
/** Lowest eye height (a crouch) and highest (above the plant), metres. */
export const MIN_EYE = 0.6;
export const MAX_EYE = 50;
/** Height of the body below the eye that bumps into equipment: from step height to the eye when standing. */
const BODY_BELOW_EYE = EYE_HEIGHT - STEP_HEIGHT;
/** Radians of turn per pixel of mouse movement. */
export const LOOK_SENSITIVITY = 0.0025;
/** Steepest look up or down, radians (85°). */
export const MAX_PITCH = (85 * Math.PI) / 180;

/** A box the walker cannot enter: a component's rotated bounds, world-aligned. */
export interface Obstacle {
  id: string;
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  minZ: number;
  maxZ: number;
}

/** Which movement keys are held. */
export interface MoveKeys {
  forward: boolean;
  back: boolean;
  left: boolean;
  right: boolean;
  run: boolean;
  up: boolean;
  down: boolean;
}

/**
 * The equipment a walker can bump into: each component's rotated bounds. Which of them block
 * depends on the eye height (`blocksAt`): at standing height, overhead racks and floor-level details do not.
 */
export function walkObstacles(scene: ScadaScene, registry: ComponentRegistry = builtInRegistry): Obstacle[] {
  const out: Obstacle[] = [];
  for (const c of scene.components) {
    const b = registry.resolvers.resolveBounds(c.type, c.properties);
    if (!b) continue;
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity, minZ = Infinity, maxZ = -Infinity;
    for (const x of [b.min[0], b.max[0]]) for (const y of [b.min[1], b.max[1]]) for (const z of [b.min[2], b.max[2]]) {
      const p = rotateVector({ x: x * c.scale.x, y: y * c.scale.y, z: z * c.scale.z }, c.rotation);
      minX = Math.min(minX, c.position.x + p.x); maxX = Math.max(maxX, c.position.x + p.x);
      minY = Math.min(minY, c.position.y + p.y); maxY = Math.max(maxY, c.position.y + p.y);
      minZ = Math.min(minZ, c.position.z + p.z); maxZ = Math.max(maxZ, c.position.z + p.z);
    }
    out.push({ id: c.id, minX, maxX, minY, maxY, minZ, maxZ });
  }
  return out;
}

/** The plan step for the held keys over `dt` seconds, facing `yaw` (0 looks along −Z, as in xr.ts). */
export function walkStep(yaw: number, keys: MoveKeys, dt: number): { x: number; z: number } {
  const ahead = (keys.forward ? 1 : 0) - (keys.back ? 1 : 0);
  const side = (keys.right ? 1 : 0) - (keys.left ? 1 : 0);
  const length = Math.hypot(ahead, side);
  if (length === 0) return { x: 0, z: 0 };
  const d = ((keys.run ? RUN_SPEED : WALK_SPEED) * dt) / length;
  // Forward is (−sin yaw, −cos yaw); right is (cos yaw, −sin yaw).
  const s = Math.sin(yaw), c = Math.cos(yaw);
  return { x: d * (-s * ahead + c * side), z: d * (-c * ahead - s * side) };
}

/** Whether equipment reaches into the walker's body (from step height below a standing eye up to the eye). */
export function blocksAt(o: Obstacle, eye: number): boolean {
  return o.maxY > eye - BODY_BELOW_EYE && o.minY < eye;
}

const inPlan = (o: Obstacle, x: number, z: number, r: number) => x > o.minX - r && x < o.maxX + r && z > o.minZ - r && z < o.maxZ + r;
const blocked = (x: number, z: number, obstacles: Obstacle[], r: number, eye: number) =>
  obstacles.some((o) => blocksAt(o, eye) && inPlan(o, x, z, r));

/**
 * Moves the walker by `step`, sliding along equipment and the floor edge instead of stopping dead:
 * each axis is tried on its own. A walker who starts inside equipment may always walk out.
 */
export function moveWalker(from: { x: number; z: number }, step: { x: number; z: number }, obstacles: Obstacle[], slab?: FloorSlab, eye = EYE_HEIGHT, r = BODY_RADIUS): { x: number; z: number } {
  const inside = obstacles.filter((o) => blocked(from.x, from.z, [o], r, eye));
  const solid = obstacles.filter((o) => !inside.includes(o));
  const onFloor = (x: number, z: number) => !slab || (Math.abs(x - slab.centre.x) <= slab.width / 2 - r && Math.abs(z - slab.centre.z) <= slab.depth / 2 - r);
  const free = (x: number, z: number) => !blocked(x, z, solid, r, eye) && (onFloor(x, z) || !onFloor(from.x, from.z));
  let { x, z } = from;
  if (free(x + step.x, z)) x += step.x;
  if (free(x, z + step.z)) z += step.z;
  return { x, z };
}

/**
 * Rises (Space) or sinks (Alt) by the climbing speed, between a crouch and `MAX_EYE`, stopping
 * short of equipment overhead or underfoot. Equipment the walker is already in never holds them.
 */
export function climb(at: { x: number; z: number }, eye: number, keys: MoveKeys, dt: number, obstacles: Obstacle[], r = BODY_RADIUS): number {
  const dir = (keys.up ? 1 : 0) - (keys.down ? 1 : 0);
  if (dir === 0) return eye;
  let next = Math.max(MIN_EYE, Math.min(MAX_EYE, eye + dir * (keys.run ? RUN_SPEED : WALK_SPEED) * dt));
  for (const o of obstacles) {
    if (!inPlan(o, at.x, at.z, r) || blocksAt(o, eye)) continue;
    // Rising, the eye stops under the equipment; sinking, the body stops on top of it.
    if (dir > 0 && o.minY >= eye) next = Math.min(next, o.minY);
    if (dir < 0 && o.maxY <= eye - BODY_BELOW_EYE) next = Math.max(next, o.maxY + BODY_BELOW_EYE);
  }
  return next;
}

/** Mouse look: turn by the movement, keeping the pitch short of straight up or down. Right turns right. */
export function look(yaw: number, pitch: number, dx: number, dy: number): { yaw: number; pitch: number } {
  return { yaw: yaw - dx * LOOK_SENSITIVITY, pitch: Math.max(-MAX_PITCH, Math.min(MAX_PITCH, pitch - dy * LOOK_SENSITIVITY)) };
}

/** Maps a keyboard code to a movement key, or undefined for other keys. */
export function moveKeyOf(code: string): keyof MoveKeys | undefined {
  switch (code) {
    case 'KeyW': case 'ArrowUp': return 'forward';
    case 'KeyS': case 'ArrowDown': return 'back';
    case 'KeyA': case 'ArrowLeft': return 'left';
    case 'KeyD': case 'ArrowRight': return 'right';
    case 'ShiftLeft': case 'ShiftRight': return 'run';
    case 'Space': return 'up';
    case 'AltLeft': case 'AltRight': return 'down';
    default: return undefined;
  }
}
