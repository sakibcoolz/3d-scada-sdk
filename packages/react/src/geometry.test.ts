import { describe, expect, it } from 'vitest';
import { Box3, Vector3, type BufferGeometry } from 'three';
import type { PipeRoute } from '@scada3d/core';
import { componentCatalog, pipeOuterRadius } from '@scada3d/components';
import { createEquipmentGeometries, createRouteGeometries, disposeGeometries } from './geometry';

const definitions = Object.values(componentCatalog);

describe('createEquipmentGeometries', () => {
  it.each(definitions)('$type creates one geometry per part', (definition) => {
    const geometries = createEquipmentGeometries(definition);
    expect(geometries).toHaveLength(definition.parts.length);
    disposeGeometries(geometries);
  });

  // Three stores vertices as float32, so compare to 1e-6 m.
  it.each(definitions)('$type geometry fills exactly its declared bounds', (definition) => {
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

  it.each(definitions.flatMap((d) => d.ports.filter((p) => p.kind === 'fluid').map((p) => [`${d.type}.${p.id}`, d, p] as const)))(
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

  it.each(definitions.flatMap((d) => d.ports.map((p) => [`${d.type}.${p.id}`, d, p] as const)))(
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

describe('createRouteGeometries', () => {
  const R = 0.3;
  const r = pipeOuterRadius;
  const ok = (points: [number, number, number][]): Extract<PipeRoute, { status: 'ok' }> => ({
    status: 'ok',
    connectionId: 'e1',
    kind: points.length > 2 ? 'orthogonal' : points.length === 2 ? 'straight' : 'direct',
    from: points[0],
    to: points[points.length - 1],
    points,
    bends: points.slice(1, -1).map((corner) => ({ corner, radius: R })),
    length: 0,
  });

  function bounds(geometries: BufferGeometry[]): Box3 {
    const box = new Box3();
    for (const g of geometries) {
      g.computeBoundingBox();
      box.union(g.boundingBox!);
    }
    return box;
  }

  function maxRadialInPlane(geometries: BufferGeometry[], origin: Vector3, normal: Vector3): number {
    const vertex = new Vector3();
    let max = -1;
    for (const g of geometries) {
      const positions = g.getAttribute('position');
      for (let i = 0; i < positions.count; i++) {
        vertex.fromBufferAttribute(positions, i).sub(origin);
        if (Math.abs(vertex.dot(normal)) < 1e-6) max = Math.max(max, vertex.length());
      }
    }
    return max;
  }

  it('creates nothing for a direct route', () => {
    expect(createRouteGeometries(ok([[1, 2, 3]]), r)).toEqual([]);
  });

  it('creates one pipe for a straight route, open at both ports', () => {
    const geometries = createRouteGeometries(ok([[0, 0, 0], [0, 0, 2]]), r);
    expect(geometries).toHaveLength(1);
    const box = bounds(geometries);
    box.min.toArray().forEach((n, i) => expect(n).toBeCloseTo([-r, -r, 0][i], 6));
    box.max.toArray().forEach((n, i) => expect(n).toBeCloseTo([r, r, 2][i], 6));
    disposeGeometries(geometries);
  });

  it('builds an L route from two trimmed straights and one quarter bend', () => {
    const geometries = createRouteGeometries(ok([[0, 0, 0], [2, 0, 0], [2, 2, 0]]), r);
    expect(geometries).toHaveLength(3);
    const box = bounds(geometries);
    box.min.toArray().forEach((n, i) => expect(n).toBeCloseTo([0, -r, -r][i], 6));
    box.max.toArray().forEach((n, i) => expect(n).toBeCloseTo([2 + r, 2, r][i], 6));
    // Pipe openings at both ports and where each straight meets the bend.
    expect(maxRadialInPlane(geometries, new Vector3(0, 0, 0), new Vector3(1, 0, 0))).toBeCloseTo(r, 6);
    expect(maxRadialInPlane(geometries, new Vector3(2, 2, 0), new Vector3(0, 1, 0))).toBeCloseTo(r, 6);
    expect(maxRadialInPlane([geometries[0]], new Vector3(2 - R, 0, 0), new Vector3(1, 0, 0))).toBeCloseTo(r, 6);
    expect(maxRadialInPlane([geometries[1]], new Vector3(2 - R, 0, 0), new Vector3(1, 0, 0))).toBeCloseTo(r, 6);
    expect(maxRadialInPlane([geometries[1]], new Vector3(2, R, 0), new Vector3(0, 1, 0))).toBeCloseTo(r, 6);
    disposeGeometries(geometries);
  });

  it('orients bends in any plane, including turns out of the XY plane', () => {
    const geometries = createRouteGeometries(ok([[0, 0, 0], [2, 0, 0], [2, 1, 0], [2, 1, 3]]), r);
    expect(geometries).toHaveLength(5);
    const bend = geometries[3];
    // Second bend turns +Y into +Z around corner (2, 1, 0).
    expect(maxRadialInPlane([bend], new Vector3(2, 1 - R, 0), new Vector3(0, 1, 0))).toBeCloseTo(r, 6);
    expect(maxRadialInPlane([bend], new Vector3(2, 1, R), new Vector3(0, 0, 1))).toBeCloseTo(r, 6);
    disposeGeometries(geometries);
  });
});

describe('parametric pipe geometry', () => {
  it('builds a 5 m pipe that fills its bounds with openings at both ports', async () => {
    const { definitionFor } = await import('@scada3d/components');
    const definition = definitionFor('pipe', { length: 5 });
    const geometries = createEquipmentGeometries(definition);
    const box = new Box3();
    for (const g of geometries) {
      g.computeBoundingBox();
      box.union(g.boundingBox!);
    }
    expect(box.min.x).toBeCloseTo(-2.5, 6);
    expect(box.max.x).toBeCloseTo(2.5, 6);
    disposeGeometries(geometries);
  });
});
