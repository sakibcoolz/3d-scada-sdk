import type { Intersection, Object3D } from 'three';

/** Roles drawn on equipment that are not the equipment itself: markers and helpers. */
const NOT_EQUIPMENT = new Set(['open-joint', 'floor', 'underlay', 'xr-ray', 'xr-target']);

/**
 * The component a ray first meets, from three.js intersections sorted nearest first. Parts are
 * tagged `userData.componentId` (instanced ones `userData.componentIds[instanceId]`), possibly on
 * an ancestor. Hits on untagged geometry (grid, routed pipes, rays) are looked through; ids not in
 * `ids` (for example open-joint markers, tagged with a connection id) are ignored.
 */
export function componentHit(hits: readonly Intersection[], ids: ReadonlySet<string>): { id: string; distance: number } | undefined {
  for (const hit of hits) {
    for (let o: Object3D | null = hit.object; o; o = o.parent) {
      const data = o.userData as { componentId?: unknown; componentIds?: unknown; role?: unknown };
      if (typeof data.role === 'string' && NOT_EQUIPMENT.has(data.role)) break;
      const id = Array.isArray(data.componentIds) && hit.instanceId !== undefined ? data.componentIds[hit.instanceId] : data.componentId;
      if (typeof id === 'string') {
        if (ids.has(id)) return { id, distance: hit.distance };
        break;
      }
    }
  }
  return undefined;
}
