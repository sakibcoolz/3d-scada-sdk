import { rotateVector, type ScadaScene } from '@sakibcoolz/core';
import { builtInRegistry, type ComponentRegistry } from '@sakibcoolz/components';

/** Clear floor around the outermost equipment, metres. */
export const FLOOR_MARGIN = 3;
/** Smallest floor side, metres: an empty or small scene still stands on a usable slab. */
export const FLOOR_MIN_SIDE = 20;
/** Slab thickness below y = 0, metres. */
export const FLOOR_THICKNESS = 0.2;

export interface FloorSlab {
  centre: { x: number; z: number };
  width: number;
  depth: number;
}

/**
 * The floor slab under a scene: the plan extent of every component's rotated bounds, plus a margin,
 * rounded outward to whole metres so small moves do not resize it. Display only; it is not stored in the scene.
 */
export function floorSlab(scene: ScadaScene, margin = FLOOR_MARGIN, minSide = FLOOR_MIN_SIDE, registry: ComponentRegistry = builtInRegistry): FloorSlab {
  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
  for (const c of scene.components) {
    const b = registry.resolvers.resolveBounds(c.type, c.properties);
    if (!b) continue;
    for (const cx of [b.min[0], b.max[0]]) for (const cy of [b.min[1], b.max[1]]) for (const cz of [b.min[2], b.max[2]]) {
      const p = rotateVector({ x: cx * c.scale.x, y: cy * c.scale.y, z: cz * c.scale.z }, c.rotation);
      minX = Math.min(minX, c.position.x + p.x); maxX = Math.max(maxX, c.position.x + p.x);
      minZ = Math.min(minZ, c.position.z + p.z); maxZ = Math.max(maxZ, c.position.z + p.z);
    }
  }
  if (minX > maxX) return { centre: { x: 0, z: 0 }, width: minSide, depth: minSide };
  const span = (lo: number, hi: number) => {
    let a = Math.floor(lo - margin), b = Math.ceil(hi + margin);
    const grow = minSide - (b - a);
    if (grow > 0) { a -= Math.floor(grow / 2); b += Math.ceil(grow / 2); }
    return [a, b] as const;
  };
  const [x0, x1] = span(minX, maxX);
  const [z0, z1] = span(minZ, maxZ);
  return { centre: { x: (x0 + x1) / 2, z: (z0 + z1) / 2 }, width: x1 - x0, depth: z1 - z0 };
}
