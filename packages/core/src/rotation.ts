import * as tuples from './quaternion.js';
import type { QuaternionLike, Vector3Like } from './scene.js';
import { quaternionToTuple, tupleToQuaternion, tupleToVector, vectorToTuple } from './vectors.js';

// Public rotation helpers in the named form used by the scene model.

export const identityQuaternion: Readonly<QuaternionLike> = Object.freeze({ x: 0, y: 0, z: 0, w: 1 });

/** Euler angles in radians, intrinsic XYZ order (Three.js `Euler(x, y, z, 'XYZ')`), as a unit quaternion. */
export function quaternionFromEuler(euler: Vector3Like): QuaternionLike {
  return tupleToQuaternion(tuples.quaternionFromEuler(vectorToTuple(euler)));
}

/** Intrinsic XYZ Euler angles in radians, for display. */
export function quaternionToEuler(rotation: QuaternionLike): Vector3Like {
  return tupleToVector(tuples.quaternionToEuler(quaternionToTuple(rotation)));
}

/** Rotates a vector by a unit quaternion. */
export function rotateVector(vector: Vector3Like, rotation: QuaternionLike): Vector3Like {
  return tupleToVector(tuples.rotateVector(vectorToTuple(vector), quaternionToTuple(rotation)));
}
