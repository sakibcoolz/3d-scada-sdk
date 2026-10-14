import { describe, expect, it } from 'vitest';
import { Euler, Object3D, Vector3 } from 'three';
import { portToWorld, type Vector3Tuple } from '@scada3d/core';
import { componentCatalog } from '@scada3d/components';

// The renderer places equipment with <group position rotation>, so core's world-port math must
// agree with Three.js for the same instance transform.
const transforms: Array<{ position: Vector3Tuple; rotation: Vector3Tuple }> = [
  { position: [0, 0, 0], rotation: [0, 0, 0] },
  { position: [2.4, 1.8, 0], rotation: [0, Math.PI / 2, 0] },
  { position: [-3, 0.5, 7], rotation: [Math.PI, 0, Math.PI / 2] },
  { position: [1, 2, 3], rotation: [0.3, -1.1, 2.4] },
  { position: [-0.5, 4, -2], rotation: [-2.9, 0.7, 0.05] },
];

describe('portToWorld matches Three.js object transforms', () => {
  for (const definition of Object.values(componentCatalog)) {
    for (const port of definition.ports) {
      it.each(transforms)(`${definition.kind}.${port.id} at %o`, (transform) => {
        const object = new Object3D();
        object.position.set(...transform.position);
        object.rotation.copy(new Euler(...transform.rotation, 'XYZ'));
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
