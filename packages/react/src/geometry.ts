import { BoxGeometry, CylinderGeometry, Matrix4, Quaternion, SphereGeometry, TorusGeometry, Vector3, type BufferGeometry } from 'three';
import type { PipeRoute } from '@scada3d/core';
import type { GeometryPart, IndustrialComponentDefinition } from '@scada3d/components';

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
