import type { ComponentInstance } from '@scada3d/core';

/** Instances per mesh: small enough that off-screen chunks are culled, large enough to stay few. */
export const INSTANCE_CHUNK = 64;
/**
 * Members split into spatially compact chunks for per-chunk frustum culling: halve along the
 * longest axis at the median until each piece holds at most `size` instances.
 */
export function spatialChunks(members: readonly ComponentInstance[], size = INSTANCE_CHUNK): ComponentInstance[][] {
  const chunks: ComponentInstance[][] = [];
  const axes = ['x', 'y', 'z'] as const;
  const split = (items: ComponentInstance[]) => {
    if (items.length <= size) { if (items.length) chunks.push(items); return; }
    const extent = axes.map((a) => { let lo = Infinity, hi = -Infinity; for (const c of items) { lo = Math.min(lo, c.position[a]); hi = Math.max(hi, c.position[a]); } return hi - lo; });
    const axis = axes[extent.indexOf(Math.max(...extent))];
    const sorted = [...items].sort((p, q) => p.position[axis] - q.position[axis] || (p.id < q.id ? -1 : 1));
    const half = sorted.length >> 1;
    split(sorted.slice(0, half));
    split(sorted.slice(half));
  };
  split([...members]);
  return chunks;
}
