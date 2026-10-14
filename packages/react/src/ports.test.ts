import { describe, expect, it } from 'vitest';
import { Object3D, Quaternion, Vector3 } from 'three';
import { portToWorld, quaternionFromEuler, type QuaternionLike, type Vector3Like } from '@scada3d/core';
import { componentCatalog } from '@scada3d/components';

// The renderer places equipment with <group position quaternion>, so core's world-port math must
// agree with Three.js for the same instance transform.
const transforms: Array<{ position: Vector3Like; rotation: QuaternionLike }> = [
  { position: { x: 0, y: 0, z: 0 }, rotation: { x: 0, y: 0, z: 0, w: 1 } },
  { position: { x: 2.4, y: 1.8, z: 0 }, rotation: quaternionFromEuler({ x: 0, y: Math.PI / 2, z: 0 }) },
  { position: { x: -3, y: 0.5, z: 7 }, rotation: quaternionFromEuler({ x: Math.PI, y: 0, z: Math.PI / 2 }) },
  { position: { x: 1, y: 2, z: 3 }, rotation: quaternionFromEuler({ x: 0.3, y: -1.1, z: 2.4 }) },
  { position: { x: -0.5, y: 4, z: -2 }, rotation: quaternionFromEuler({ x: -2.9, y: 0.7, z: 0.05 }) },
];

describe('portToWorld matches Three.js object transforms', () => {
  for (const definition of Object.values(componentCatalog)) {
    for (const port of definition.ports) {
      it.each(transforms)(`${definition.type}.${port.id} at %o`, (transform) => {
        const object = new Object3D();
        object.position.set(transform.position.x, transform.position.y, transform.position.z);
        object.quaternion.copy(new Quaternion(transform.rotation.x, transform.rotation.y, transform.rotation.z, transform.rotation.w));
        object.updateMatrixWorld(true);

        const expectedPosition = object.localToWorld(new Vector3(...port.position));
        const expectedDirection = new Vector3(...port.direction).normalize().applyQuaternion(object.quaternion);
        const world = portToWorld(transform, port);

        expect(world.position[0]).toBeCloseTo(expectedPosition.x, 10);
        expect(world.position[1]).toBeCloseTo(expectedPosition.y, 10);
        expect(world.position[2]).toBeCloseTo(expectedPosition.z, 10);
        expect(world.direction[0]).toBeCloseTo(expectedDirection.x, 10);
        expect(world.direction[1]).toBeCloseTo(expectedDirection.y, 10);
        expect(world.direction[2]).toBeCloseTo(expectedDirection.z, 10);
      });
    }
  }
});
