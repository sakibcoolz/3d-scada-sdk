import { BoxGeometry, CylinderGeometry, SphereGeometry, TorusGeometry, type BufferGeometry } from 'three';
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
