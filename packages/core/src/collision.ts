import { rotateVector } from './quaternion';
import type { ComponentInstance, ComponentKind, ScadaScene, Vector3Tuple } from './scene';
import { quaternionToTuple } from './vectors';

/**
 * Solid-body overlap between components. Each component is treated as its catalog bounding box,
 * placed by its position, rotation and scale (an oriented box). This is conservative: hollow or
 * curved parts (an elbow's inside corner, a tank's rounded side) count as their full box.
 */
export interface CollisionOptions {
  /** Local bounds of a component type; types without bounds are skipped. */
  resolveBounds: (type: ComponentKind, properties?: ComponentInstance['properties']) => { min: Vector3Tuple; max: Vector3Tuple } | undefined;
  /** Overlap up to this depth (metres) is treated as touching, so joined ports never collide. Default 0.001. */
  tolerance?: number;
}

export interface CollisionPair {
  /** Lower of the two component ids (string order). */
  a: string;
  b: string;
}

export interface CollisionResult {
  /** Each colliding pair once, sorted by `a` then `b`. */
  pairs: CollisionPair[];
  collidingIds: Set<string>;
}

interface Box {
  id: string;
  centre: Vector3Tuple;
  /** Unit axes of the box in world space. */
  axes: [Vector3Tuple, Vector3Tuple, Vector3Tuple];
  half: Vector3Tuple;
  /** World-aligned extent, for the broad phase. */
  min: Vector3Tuple;
  max: Vector3Tuple;
}

const dot = (a: Vector3Tuple, b: Vector3Tuple) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: Vector3Tuple, b: Vector3Tuple): Vector3Tuple => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];

function orientedBox(component: ScadaScene['components'][number], local: { min: Vector3Tuple; max: Vector3Tuple }): Box {
  const q = quaternionToTuple(component.rotation);
  const s = [component.scale.x, component.scale.y, component.scale.z];
  const localCentre = [0, 1, 2].map((i) => ((local.min[i] + local.max[i]) / 2) * s[i]) as Vector3Tuple;
  const offset = rotateVector(localCentre, q);
  const centre: Vector3Tuple = [component.position.x + offset[0], component.position.y + offset[1], component.position.z + offset[2]];
  const axes: Box['axes'] = [rotateVector([1, 0, 0], q), rotateVector([0, 1, 0], q), rotateVector([0, 0, 1], q)];
  const half = [0, 1, 2].map((i) => ((local.max[i] - local.min[i]) / 2) * s[i]) as Vector3Tuple;
  const reach = [0, 1, 2].map((w) => Math.abs(axes[0][w]) * half[0] + Math.abs(axes[1][w]) * half[1] + Math.abs(axes[2][w]) * half[2]);
  return {
    id: component.id,
    centre,
    axes,
    half,
    min: [centre[0] - reach[0], centre[1] - reach[1], centre[2] - reach[2]],
    max: [centre[0] + reach[0], centre[1] + reach[1], centre[2] + reach[2]],
  };
}

/** Separating-axis test: the boxes collide only if they overlap by more than `tolerance` on all 15 axes. */
function overlaps(a: Box, b: Box, tolerance: number): boolean {
  const between: Vector3Tuple = [b.centre[0] - a.centre[0], b.centre[1] - a.centre[1], b.centre[2] - a.centre[2]];
  const candidates: Vector3Tuple[] = [...a.axes, ...b.axes];
  for (const u of a.axes) for (const v of b.axes) candidates.push(cross(u, v));
  for (const axis of candidates) {
    const length = Math.hypot(...axis);
    if (length < 1e-9) continue; // parallel edges: already covered by the face axes
    const n: Vector3Tuple = [axis[0] / length, axis[1] / length, axis[2] / length];
    const ra = a.half[0] * Math.abs(dot(a.axes[0], n)) + a.half[1] * Math.abs(dot(a.axes[1], n)) + a.half[2] * Math.abs(dot(a.axes[2], n));
    const rb = b.half[0] * Math.abs(dot(b.axes[0], n)) + b.half[1] * Math.abs(dot(b.axes[1], n)) + b.half[2] * Math.abs(dot(b.axes[2], n));
    if (ra + rb - Math.abs(dot(between, n)) <= tolerance) return false;
  }
  return true;
}

/**
 * Pairs of components whose solid boxes overlap by more than the tolerance. Display information
 * only: nothing is blocked or saved. A sweep along X skips pairs whose world boxes are disjoint.
 */
export function findCollisions(scene: ScadaScene, options: CollisionOptions): CollisionResult {
  const tolerance = options.tolerance ?? 0.001;
  const boxes: Box[] = [];
  for (const c of scene.components) {
    const local = options.resolveBounds(c.type, c.properties);
    if (local) boxes.push(orientedBox(c, local));
  }
  boxes.sort((p, q) => p.min[0] - q.min[0]);

  const pairs: CollisionPair[] = [];
  const active: Box[] = [];
  for (const box of boxes) {
    // Drop boxes that end before this one starts along X.
    for (let i = active.length - 1; i >= 0; i--) if (active[i].max[0] <= box.min[0]) active.splice(i, 1);
    for (const other of active) {
      if (other.max[1] <= box.min[1] || box.max[1] <= other.min[1] || other.max[2] <= box.min[2] || box.max[2] <= other.min[2]) continue;
      if (overlaps(other, box, tolerance)) pairs.push(other.id < box.id ? { a: other.id, b: box.id } : { a: box.id, b: other.id });
    }
    active.push(box);
  }
  pairs.sort((p, q) => (p.a < q.a ? -1 : p.a > q.a ? 1 : p.b < q.b ? -1 : p.b > q.b ? 1 : 0));
  return { pairs, collidingIds: new Set(pairs.flatMap((p) => [p.a, p.b])) };
}
