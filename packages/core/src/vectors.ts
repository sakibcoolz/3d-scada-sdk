import type { QuaternionLike, QuaternionTuple, Vector3Like, Vector3Tuple } from './scene';

// Conversions between the named scene form and the tuple form used internally by the maths.
export const vectorToTuple = (v: Vector3Like): Vector3Tuple => [v.x, v.y, v.z];
export const tupleToVector = ([x, y, z]: readonly number[]): Vector3Like => ({ x, y, z });
export const quaternionToTuple = (q: QuaternionLike): QuaternionTuple => [q.x, q.y, q.z, q.w];
export const tupleToQuaternion = ([x, y, z, w]: readonly number[]): QuaternionLike => ({ x, y, z, w });
