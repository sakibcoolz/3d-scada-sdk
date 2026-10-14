import { describe, expect, it } from 'vitest';
import { Box3, Vector3 } from 'three';
import { componentCatalog, pipeOuterRadius } from '@scada3d/components';
import { createEquipmentGeometries, disposeGeometries } from './geometry';

const definitions = Object.values(componentCatalog);

describe('createEquipmentGeometries', () => {
  it.each(definitions)('$kind creates one geometry per part', (definition) => {
    const geometries = createEquipmentGeometries(definition);
    expect(geometries).toHaveLength(definition.parts.length);
    disposeGeometries(geometries);
  });

  // Three stores vertices as float32, so compare to 1e-6 m.
  it.each(definitions)('$kind geometry fills exactly its declared bounds', (definition) => {
    const geometries = createEquipmentGeometries(definition);
    const box = new Box3();
    for (const geometry of geometries) {
      geometry.computeBoundingBox();
      box.union(geometry.boundingBox!);
    }
    box.min.toArray().forEach((n, i) => expect(n).toBeCloseTo(definition.bounds.min[i], 6));
    box.max.toArray().forEach((n, i) => expect(n).toBeCloseTo(definition.bounds.max[i], 6));
    disposeGeometries(geometries);
  });

  it.each(definitions.flatMap((d) => d.ports.filter((p) => p.kind === 'fluid').map((p) => [`${d.kind}.${p.id}`, d, p] as const)))(
    '%s is centred on a pipe opening of the outer pipe radius',
    (_, definition, port) => {
      const geometries = createEquipmentGeometries(definition);
      const origin = new Vector3(...port.position);
      const normal = new Vector3(...port.direction);
      const vertex = new Vector3();
      const radial: number[] = [];
      for (const geometry of geometries) {
        const positions = geometry.getAttribute('position');
        for (let i = 0; i < positions.count; i++) {
          vertex.fromBufferAttribute(positions, i).sub(origin);
          if (Math.abs(vertex.dot(normal)) < 1e-6) radial.push(vertex.length());
        }
      }
      expect(radial.length).toBeGreaterThan(0);
      expect(Math.max(...radial)).toBeCloseTo(pipeOuterRadius, 6);
      disposeGeometries(geometries);
    },
  );

  it.each(definitions.flatMap((d) => d.ports.map((p) => [`${d.kind}.${p.id}`, d, p] as const)))(
    '%s has no geometry beyond the port plane',
    (_, definition, port) => {
      const geometries = createEquipmentGeometries(definition);
      const origin = new Vector3(...port.position);
      const normal = new Vector3(...port.direction);
      const vertex = new Vector3();
      for (const geometry of geometries) {
        const positions = geometry.getAttribute('position');
        for (let i = 0; i < positions.count; i++) {
          expect(vertex.fromBufferAttribute(positions, i).sub(origin).dot(normal)).toBeLessThan(1e-6);
        }
      }
      disposeGeometries(geometries);
    },
  );
});

describe('disposeGeometries', () => {
  it('disposes every geometry exactly once', () => {
    const geometries = createEquipmentGeometries(componentCatalog.tank);
    const disposed = new Map(geometries.map((g) => [g, 0]));
    for (const geometry of geometries) {
      geometry.addEventListener('dispose', () => disposed.set(geometry, disposed.get(geometry)! + 1));
    }
    disposeGeometries(geometries);
    expect([...disposed.values()]).toEqual(geometries.map(() => 1));
  });
});
