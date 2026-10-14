import { describe, expect, it } from 'vitest';
import { rotateVector, type QuaternionLike, type Vector3Like } from '@scada3d/core';
import { degreesFromRotation, rotationFromDegrees, turnAboutWorldAxis } from './rotationForm';

const expectSameRotation = (a: QuaternionLike, b: QuaternionLike) => {
  for (const v of [{ x: 1, y: 0, z: 0 }, { x: 0, y: 1, z: 0 }, { x: 0, y: 0, z: 1 }] as Vector3Like[]) {
    const [p, q] = [rotateVector(v, a), rotateVector(v, b)];
    expect(p.x).toBeCloseTo(q.x, 9);
    expect(p.y).toBeCloseTo(q.y, 9);
    expect(p.z).toBeCloseTo(q.z, 9);
  }
};

describe('rotation form', () => {
  it('shows no rotation as zeros', () => {
    expect(degreesFromRotation({ x: 0, y: 0, z: 0, w: 1 })).toEqual({ x: 0, y: 0, z: 0 });
  });

  it.each([
    { x: 0, y: 90, z: 0 },
    { x: 30, y: 45, z: -60 },
    { x: -120, y: 10, z: 170 },
    { x: 15, y: -30, z: 0 },
  ])('round-trips %o degrees', (degrees) => {
    expect(degreesFromRotation(rotationFromDegrees(degrees))).toEqual(degrees);
  });

  it('rounds display values to 0.01° and never shows negative zero', () => {
    const shown = degreesFromRotation(rotationFromDegrees({ x: 12.3456, y: -0.0001, z: 0 }));
    expect(shown).toEqual({ x: 12.35, y: 0, z: 0 });
    expect(Object.is(shown.y, -0)).toBe(false);
  });

  it('turns +90° about world Y so local +X points to world −Z', () => {
    const turned = turnAboutWorldAxis({ x: 0, y: 0, z: 0, w: 1 }, 'y', 90);
    const outlet = rotateVector({ x: 1, y: 0, z: 0 }, turned);
    expect(outlet.x).toBeCloseTo(0, 12);
    expect(outlet.z).toBeCloseTo(-1, 12);
  });

  it('composes turns on top of the current rotation and undoes with the opposite turn', () => {
    const start = rotationFromDegrees({ x: 20, y: 0, z: 35 });
    const back = turnAboutWorldAxis(turnAboutWorldAxis(start, 'x', 90), 'x', -90);
    expectSameRotation(back, start);
  });

  it('always returns unit quaternions', () => {
    const q = turnAboutWorldAxis(rotationFromDegrees({ x: 33, y: 77, z: -12 }), 'z', 90);
    expect(Math.hypot(q.x, q.y, q.z, q.w)).toBeCloseTo(1, 12);
  });
});
