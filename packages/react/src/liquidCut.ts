import { BufferGeometry, Float32BufferAttribute, Vector3 } from 'three';

/**
 * The part of a closed convex mesh below the plane y = `level`, capped with a flat top (ADR-0018):
 * the liquid in a horizontal or spherical tank. Undefined when the level is below the mesh.
 */
export function cutBelow(source: BufferGeometry, level: number): BufferGeometry | undefined {
  const geometry = source.index ? source.toNonIndexed() : source;
  const p = geometry.getAttribute('position');
  const out: number[] = [];
  const cap: Vector3[] = [];
  const corner = [new Vector3(), new Vector3(), new Vector3()];
  let below = 0;
  for (let i = 0; i < p.count; i += 3) {
    corner.forEach((v, k) => v.fromBufferAttribute(p, i + k));
    // Sutherland–Hodgman against y ≤ level, keeping the triangle's winding.
    const kept: Vector3[] = [];
    for (let k = 0; k < 3; k++) {
      const [a, b] = [corner[k], corner[(k + 1) % 3]];
      const [ina, inb] = [a.y <= level, b.y <= level];
      if (ina) kept.push(a.clone());
      if (ina !== inb) {
        const hit = a.clone().lerp(b, (level - a.y) / (b.y - a.y));
        hit.y = level;
        kept.push(hit);
        cap.push(hit);
      }
    }
    if (corner.some((v) => v.y <= level)) below++;
    for (let k = 1; k + 1 < kept.length; k++) for (const v of [kept[0], kept[k], kept[k + 1]]) out.push(v.x, v.y, v.z);
  }
  if (geometry !== source) geometry.dispose();
  if (below === 0) return undefined;
  if (cap.length >= 3) {
    // The cut of a convex mesh is a convex polygon: fan it from its centre, facing up.
    const centre = cap.reduce((c, v) => c.add(v), new Vector3()).divideScalar(cap.length);
    const ring = cap.map((v) => ({ v, angle: Math.atan2(v.z - centre.z, v.x - centre.x) })).sort((a, b) => a.angle - b.angle);
    const unique = ring.filter((r, k) => k === 0 || r.v.distanceToSquared(ring[k - 1].v) > 1e-12);
    for (let k = 0; k < unique.length; k++) {
      const [a, b] = [unique[k].v, unique[(k + 1) % unique.length].v];
      out.push(centre.x, level, centre.z, b.x, level, b.z, a.x, level, a.z);
    }
  }
  const result = new BufferGeometry();
  result.setAttribute('position', new Float32BufferAttribute(out, 3));
  result.computeVertexNormals();
  return result;
}
