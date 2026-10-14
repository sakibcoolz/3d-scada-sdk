import { describe, expect, it } from 'vitest';
import { Object3D, Quaternion, Vector3 } from 'three';
import { portToWorld, quaternionFromEuler, type QuaternionTuple, type Vector3Tuple } from '@scada3d/core';
import { componentCatalog } from '@scada3d/components';

// The renderer places equipment with <group position quaternion>, so core's world-port math must
// agree with Three.js for the same instance transform.
const transforms: Array<{ position: Vector3Tuple; rotation: QuaternionTuple }> = [
  { position: [0, 0, 0], rotation: [0, 0, 0, 1] },
  { position: [2.4, 1.8, 0], rotation: quaternionFromEuler([0, Math.PI / 2, 0]) },
  { position: [-3, 0.5, 7], rotation: quaternionFromEuler([Math.PI, 0, Math.PI / 2]) },
  { position: [1, 2, 3], rotation: quaternionFromEuler([0.3, -1.1, 2.4]) },
  { position: [-0.5, 4, -2], rotation: quaternionFromEuler([-2.9, 0.7, 0.05]) },
];

describe('portToWorld matches Three.js object transforms', () => {
  for (const definition of Object.values(componentCatalog)) {
    for (const port of definition.ports) {
      it.each(transforms)(`${definition.type}.${port.id} at %o`, (transform) => {
        const object = new Object3D();
        object.position.set(...transform.position);
        object.quaternion.copy(new Quaternion(...transform.rotation));
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
