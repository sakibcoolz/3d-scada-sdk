import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { BoxGeometry, CylinderGeometry, LatheGeometry, Vector2, Matrix4, Quaternion, SphereGeometry, TorusGeometry, Vector3, type BufferGeometry } from 'three';
import type { PipeRoute } from '@scada3d/core';
import type { GeometryPart, IndustrialComponentDefinition } from '@scada3d/components';

/**
 * Low-poly geometry for joint hardware (ADR-0015): thousands of bolts and flanges must stay cheap,
 * and at their size 6-sided bolts and 16-sided flanges look the same as round ones.
 */
export function createJointPartGeometry(part: GeometryPart): BufferGeometry {
  const radial = part.role === 'bolt' ? 6 : 16;
  if (part.shape === 'cylinder' || part.shape === 'cone') {
    const [top, bottom] = part.shape === 'cylinder' ? [part.radius, part.radius] : part.axis === 'x' ? [part.radiusStart, part.radiusEnd] : [part.radiusEnd, part.radiusStart];
    const geometry = new CylinderGeometry(top, bottom, part.length, radial, 1, false);
    if (part.axis === 'x') geometry.rotateZ(Math.PI / 2);
    if (part.axis === 'z') geometry.rotateX(Math.PI / 2);
    return geometry.translate(...part.center);
  }
  if (part.shape === 'ring') {
    const geometry = new TorusGeometry(part.radius, part.tube, 3, 16);
    if (part.axis === 'x') geometry.rotateY(Math.PI / 2);
    if (part.axis === 'y') geometry.rotateX(Math.PI / 2);
    return geometry.translate(...part.center);
  }
  return createPartGeometry(part);
}

/** Builds a part's geometry with its transform baked in, so vertices are in component-local metres. */
export function createPartGeometry(part: GeometryPart): BufferGeometry {
  switch (part.shape) {
    case 'cylinder': {
      // Three cylinders run along Y; segment counts are multiples of 4 so extremes land on vertices.
      const geometry = new CylinderGeometry(part.radius, part.radius, part.length, 32, 1, part.openEnded ?? false);
      if (part.axis === 'x') geometry.rotateZ(Math.PI / 2);
      if (part.axis === 'z') geometry.rotateX(Math.PI / 2);
      return geometry.translate(...part.center);
    }
    case 'sphere':
      return new SphereGeometry(part.radius, 24, 16).translate(...part.center);
    case 'box':
      return new BoxGeometry(...part.size).translate(...part.center);
    case 'bend':
      return new TorusGeometry(part.bendRadius, part.tubeRadius, 16, 24, Math.PI / 2)
        .rotateZ(part.startAngle)
        .translate(...part.center);
    case 'ring': {
      // Torus in its own XY plane (normal +Z), turned so its axis is the part's axis.
      const geometry = new TorusGeometry(part.radius, part.tube, 8, 32);
      if (part.axis === 'x') geometry.rotateY(Math.PI / 2);
      if (part.axis === 'y') geometry.rotateX(Math.PI / 2);
      return geometry.translate(...part.center);
    }
    case 'lathe': {
      // Three lathes turn about +Y; a lathe along x or z is turned so +Y becomes that axis.
      const geometry = new LatheGeometry(part.points.map(([r, y]) => new Vector2(r, y)), 32);
      if (part.axis === 'x') geometry.rotateZ(-Math.PI / 2);
      if (part.axis === 'z') geometry.rotateX(Math.PI / 2);
      return geometry.translate(...part.center);
    }
    case 'strut': {
      const from = new Vector3(...part.from), to = new Vector3(...part.to);
      const along = to.clone().sub(from);
      const geometry = new CylinderGeometry(part.radius, part.radius, along.length(), 8, 1, false);
      geometry.applyQuaternion(new Quaternion().setFromUnitVectors(new Vector3(0, 1, 0), along.normalize()));
      return geometry.translate(...from.add(to).multiplyScalar(0.5).toArray());
    }
    case 'cone': {
      // Three's top is +Y; turning to X puts the top at -X, turning to Z puts it at +Z.
      const [top, bottom] = part.axis === 'x' ? [part.radiusStart, part.radiusEnd] : [part.radiusEnd, part.radiusStart];
      const geometry = new CylinderGeometry(top, bottom, part.length, 32, 1, part.openEnded ?? false);
      if (part.axis === 'x') geometry.rotateZ(Math.PI / 2);
      if (part.axis === 'z') geometry.rotateX(Math.PI / 2);
      return geometry.translate(...part.center);
    }
  }
}

/** One geometry per part, index-aligned with `definition.parts`. Callers own disposal. */
export function createEquipmentGeometries(definition: IndustrialComponentDefinition): BufferGeometry[] {
  return definition.parts.map(createPartGeometry);
}

export function disposeGeometries(geometries: readonly BufferGeometry[]): void {
  for (const geometry of geometries) geometry.dispose();
}

const UP = new Vector3(0, 1, 0);

/**
 * Pipe geometry for a routed connection in world metres: straights trimmed by the bend radius at
 * each corner, and a quarter-torus fitting in every corner. A direct route has no geometry.
 */
export function createRouteGeometries(route: Extract<PipeRoute, { status: 'ok' }>, outerRadius: number): BufferGeometry[] {
  const points = route.points.map((p) => new Vector3(...p));
  const last = points.length - 1;
  const geometries: BufferGeometry[] = [];
  for (let i = 0; i < last; i++) {
    const direction = points[i + 1].clone().sub(points[i]).normalize();
    const start = points[i].clone().addScaledVector(direction, i > 0 ? route.bends[i - 1].radius : 0);
    const end = points[i + 1].clone().addScaledVector(direction, i + 1 < last ? -route.bends[i].radius : 0);
    const length = start.distanceTo(end);
    if (length > 1e-9) {
      const middle = start.add(end).multiplyScalar(0.5);
      geometries.push(
        new CylinderGeometry(outerRadius, outerRadius, length, 32, 1)
          .applyQuaternion(new Quaternion().setFromUnitVectors(UP, direction))
          .translate(middle.x, middle.y, middle.z),
      );
    }
    if (i + 1 < last) {
      // Torus arc runs from angle 0 (local +X) to π/2 (local +Y); map +X to -outgoing, +Y to incoming.
      const incoming = direction;
      const outgoing = points[i + 2].clone().sub(points[i + 1]).normalize();
      const radius = route.bends[i].radius;
      const e1 = outgoing.clone().negate();
      const e3 = new Vector3().crossVectors(e1, incoming);
      const center = points[i + 1].clone().addScaledVector(incoming, -radius).addScaledVector(outgoing, radius);
      geometries.push(
        new TorusGeometry(radius, outerRadius, 16, 24, Math.PI / 2)
          .applyMatrix4(new Matrix4().makeBasis(e1, incoming, e3))
          .translate(center.x, center.y, center.z),
      );
    }
  }
  return geometries;
}

/** The route's straights and bends merged into one geometry (one draw call), or undefined if direct. */
export function createRouteGeometry(route: Extract<PipeRoute, { status: 'ok' }>, outerRadius: number): BufferGeometry | undefined {
  const parts = createRouteGeometries(route, outerRadius);
  if (parts.length <= 1) return parts[0];
  const merged = mergeGeometries(parts) ?? undefined;
  disposeGeometries(parts);
  return merged;
}
