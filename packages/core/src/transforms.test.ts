import { describe, expect, it } from 'vitest';
import { portToWorld, rotateVector, type ConnectionPort, type Vector3Tuple } from './index';

const { PI } = Math;

function expectClose(actual: Vector3Tuple, expected: Vector3Tuple): void {
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
  it('leaves a vector unchanged without rotation', () => {
    expectClose(rotateVector([1, 2, 3], [0, 0, 0]), [1, 2, 3]);
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
    expectClose(rotateVector(input, rotation), expected);
  });

  it('applies Euler XYZ order: Z first, then Y, then X, in local axes', () => {
    // Rz(90°) maps +X to +Y, then Ry(90°) keeps +Y, then Rx(90°) maps +Y to +Z.
    expectClose(rotateVector([1, 0, 0], [PI / 2, PI / 2, PI / 2]), [0, 0, 1]);
    // Order matters: the same angles do not commute for +Z.
    expectClose(rotateVector([0, 0, 1], [PI / 2, PI / 2, 0]), [1, 0, 0]);
  });

  it('preserves vector length', () => {
    const v = rotateVector([3, 4, 12], [0.3, -1.1, 2.4]);
    expect(Math.hypot(...v)).toBeCloseTo(13, 10);
  });

  it('does not mutate its inputs', () => {
    const vector: Vector3Tuple = [1, 0, 0];
    const rotation: Vector3Tuple = [0, PI / 2, 0];
    rotateVector(vector, rotation);
    expect(vector).toEqual([1, 0, 0]);
    expect(rotation).toEqual([0, PI / 2, 0]);
  });
});

describe('portToWorld', () => {
  it('translates the position but not the direction', () => {
    const world = portToWorld({ position: [10, 2, -3], rotation: [0, 0, 0] }, outlet);
    expectClose(world.position, [11, 1.1, -3]);
    expectClose(world.direction, [1, 0, 0]);
  });

  it('rotates position about the component origin before translating', () => {
    const world = portToWorld({ position: [5, 0, 0], rotation: [0, PI / 2, 0] }, outlet);
    expectClose(world.position, [5, -0.9, -1]);
    expectClose(world.direction, [0, 0, -1]);
  });

  it('turns an outlet to face back toward -X after 180° about Y', () => {
    const world = portToWorld({ position: [0, 0, 0], rotation: [0, PI, 0] }, outlet);
    expectClose(world.position, [-1, -0.9, 0]);
    expectClose(world.direction, [-1, 0, 0]);
  });

  it('keeps the port id and returns a unit direction', () => {
    const tilted: ConnectionPort = { ...outlet, direction: [0, 2, 0] };
    const world = portToWorld({ position: [0, 0, 0], rotation: [0.4, 0.2, -0.7] }, tilted);
    expect(world.id).toBe('outlet');
    expect(Math.hypot(...world.direction)).toBeCloseTo(1, 10);
  });

  it('places two opposite ports on opposite sides at the same distance', () => {
    const inlet: ConnectionPort = { ...outlet, id: 'in', position: [-1, -0.9, 0], direction: [-1, 0, 0] };
    const transform = { position: [2, 1, 4] as Vector3Tuple, rotation: [0.5, 1.2, -0.3] as Vector3Tuple };
    const a = portToWorld(transform, outlet).direction;
    const b = portToWorld(transform, inlet).direction;
    expectClose([a[0] + b[0], a[1] + b[1], a[2] + b[2]], [0, 0, 0]);
  });

  it('rejects a zero-length direction', () => {
    expect(() => portToWorld({ position: [0, 0, 0], rotation: [0, 0, 0] }, { ...outlet, direction: [0, 0, 0] })).toThrow(
      /zero-length/,
    );
  });
});
