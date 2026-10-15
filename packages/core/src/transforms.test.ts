import { describe, expect, it } from 'vitest';
import {
  identityQuaternion as publicIdentity,
  portToWorld,
  quaternionFromEuler as publicEuler,
  quaternionToEuler as publicQuaternionToEuler,
  rotateVector as publicRotateVector,
  type ComponentTransform,
  type ConnectionPort,
  type QuaternionTuple,
  type Vector3Tuple,
} from './index.js';
// The maths below is written with the internal tuple helpers; the public object API is checked against them.
import { quaternionFromEuler as euler, quaternionFromUnitVectors, quaternionToEuler, rotateVector } from './quaternion.js';
import { quaternionToTuple, tupleToQuaternion, tupleToVector, vectorToTuple } from './vectors.js';

const { PI } = Math;
const identity: QuaternionTuple = [0, 0, 0, 1];

/** Builds a scene transform from tuple fixtures. */
const transform = (position: Vector3Tuple, rotation: QuaternionTuple, scale?: Vector3Tuple): ComponentTransform => ({
  position: tupleToVector(position),
  rotation: tupleToQuaternion(rotation),
  ...(scale ? { scale: tupleToVector(scale) } : {}),
});

function expectClose(actual: readonly number[], expected: readonly number[]): void {
  expect(actual).toHaveLength(expected.length);
  actual.forEach((value, i) => expect(value).toBeCloseTo(expected[i], 10));
}

const outlet: ConnectionPort = {
  id: 'outlet',
  kind: 'fluid',
  position: [1, -0.9, 0],
  direction: [1, 0, 0],
  nominalSize: 0.15,
};

describe('rotateVector', () => {
  it('leaves a vector unchanged by the identity quaternion', () => {
    expectClose(rotateVector([1, 2, 3], identity), [1, 2, 3]);
  });

  it.each<[string, Vector3Tuple, Vector3Tuple, Vector3Tuple]>([
    ['+90° about X turns +Y into +Z', [PI / 2, 0, 0], [0, 1, 0], [0, 0, 1]],
    ['+90° about Y turns +X into -Z', [0, PI / 2, 0], [1, 0, 0], [0, 0, -1]],
    ['+90° about Z turns +X into +Y', [0, 0, PI / 2], [1, 0, 0], [0, 1, 0]],
    ['180° about Y reverses +X', [0, PI, 0], [1, 0, 0], [-1, 0, 0]],
    ['180° about Z reverses +Y', [0, 0, PI], [0, 1, 0], [0, -1, 0]],
    ['-90° about Y turns +X into +Z', [0, -PI / 2, 0], [1, 0, 0], [0, 0, 1]],
    ['a full turn is the identity', [2 * PI, 0, 0], [0, 1, 0], [0, 1, 0]],
  ])('%s (right-handed)', (_, rotation, input, expected) => {
    expectClose(rotateVector(input, euler(rotation)), expected);
  });

  it('builds quaternions from Euler XYZ order: Z first, then Y, then X, in local axes', () => {
    expectClose(rotateVector([1, 0, 0], euler([PI / 2, PI / 2, PI / 2])), [0, 0, 1]);
    expectClose(rotateVector([0, 0, 1], euler([PI / 2, PI / 2, 0])), [1, 0, 0]);
  });

  it('preserves vector length', () => {
    expect(Math.hypot(...rotateVector([3, 4, 12], euler([0.3, -1.1, 2.4])))).toBeCloseTo(13, 10);
  });

  it('does not mutate its inputs', () => {
    const vector: Vector3Tuple = [1, 0, 0];
    const rotation = euler([0, PI / 2, 0]);
    const before = [...rotation];
    rotateVector(vector, rotation);
    expect(vector).toEqual([1, 0, 0]);
    expect(rotation).toEqual(before);
  });
});

describe('quaternion helpers', () => {
  it.each<[Vector3Tuple]>([
    [[0.3, -1.1, 2.4]],
    [[0, PI / 2, 0]],
    [[0, -PI / 2, 0.4]],
    [[-2.9, 0.7, 0.05]],
  ])('quaternionToEuler inverts quaternionFromEuler for %o, including ±90° about Y', (angles) => {
    const q = euler(angles);
    const back = euler(quaternionToEuler(q));
    // q and -q are the same rotation; compare the rotation they apply.
    for (const v of [[1, 0, 0], [0, 1, 0], [0, 0, 1]] as Vector3Tuple[]) expectClose(rotateVector(v, back), rotateVector(v, q));
  });

  it('quaternionFromUnitVectors turns one direction onto another, including opposite ones', () => {
    expectClose(rotateVector([1, 0, 0], quaternionFromUnitVectors([1, 0, 0], [0, 0, 1])), [0, 0, 1]);
    expectClose(rotateVector([1, 0, 0], quaternionFromUnitVectors([1, 0, 0], [-1, 0, 0])), [-1, 0, 0]);
    expectClose(rotateVector([0, 1, 0], quaternionFromUnitVectors([0, 1, 0], [0, -1, 0])), [0, -1, 0]);
  });
});

describe('public object rotation helpers', () => {
  it('match the tuple maths', () => {
    const angles: Vector3Tuple = [0.3, -1.1, 2.4];
    const q = publicEuler(tupleToVector(angles));
    expect(Object.keys(q)).toEqual(['x', 'y', 'z', 'w']);
    expectClose(quaternionToTuple(q), euler(angles));
    expectClose(vectorToTuple(publicQuaternionToEuler(q)), quaternionToEuler(euler(angles)));
    expectClose(vectorToTuple(publicRotateVector({ x: 3, y: 4, z: 12 }, q)), rotateVector([3, 4, 12], euler(angles)));
  });

  it('expose a frozen identity quaternion', () => {
    expect(publicIdentity).toEqual({ x: 0, y: 0, z: 0, w: 1 });
    expect(Object.isFrozen(publicIdentity)).toBe(true);
  });
});

describe('portToWorld', () => {
  it('translates the position but not the direction', () => {
    const world = portToWorld(transform([10, 2, -3], identity), outlet);
    expectClose(world.position, [11, 1.1, -3]);
    expectClose(world.direction, [1, 0, 0]);
  });

  it('rotates position about the component origin before translating', () => {
    const world = portToWorld(transform([5, 0, 0], euler([0, PI / 2, 0])), outlet);
    expectClose(world.position, [5, -0.9, -1]);
    expectClose(world.direction, [0, 0, -1]);
  });

  it('turns an outlet to face back toward -X after 180° about Y', () => {
    const world = portToWorld(transform([0, 0, 0], euler([0, PI, 0])), outlet);
    expectClose(world.position, [-1, -0.9, 0]);
    expectClose(world.direction, [-1, 0, 0]);
  });

  it('keeps the port id and returns a unit direction', () => {
    const tilted: ConnectionPort = { ...outlet, direction: [0, 2, 0] };
    const world = portToWorld(transform([0, 0, 0], euler([0.4, 0.2, -0.7])), tilted);
    expect(world.id).toBe('outlet');
    expect(Math.hypot(...world.direction)).toBeCloseTo(1, 10);
  });

  it('places two opposite ports on opposite sides', () => {
    const inlet: ConnectionPort = { ...outlet, id: 'in', position: [-1, -0.9, 0], direction: [-1, 0, 0] };
    const placed = transform([2, 1, 4], euler([0.5, 1.2, -0.3]));
    const a = portToWorld(placed, outlet).direction;
    const b = portToWorld(placed, inlet).direction;
    expectClose([a[0] + b[0], a[1] + b[1], a[2] + b[2]], [0, 0, 0]);
  });

  it('scales the position before rotating and translating', () => {
    const world = portToWorld(transform([1, 0, 0], euler([0, 0, PI / 2]), [2, 3, 1]), outlet);
    // Scaled local (2, -2.7, 0), turned +90° about Z to (2.7, 2, 0), then moved by (1, 0, 0).
    expectClose(world.position, [3.7, 2, 0]);
  });

  it('keeps a scaled normal perpendicular to the scaled surface', () => {
    // A port on the diagonal face x + y = 1 of a unit shape, stretched 2× along X.
    const diagonal: ConnectionPort = { ...outlet, position: [0.5, 0.5, 0], direction: [1, 1, 0] };
    const world = portToWorld(transform([0, 0, 0], identity, [2, 1, 1]), diagonal);
    // The stretched face runs along (2, -1, 0); its normal is (1, 2, 0) / √5.
    expectClose(world.direction, [1 / Math.sqrt(5), 2 / Math.sqrt(5), 0]);
  });

  it('rejects a zero-length direction', () => {
    expect(() => portToWorld(transform([0, 0, 0], identity), { ...outlet, direction: [0, 0, 0] })).toThrow(/zero-length/);
  });
});
