import { describe, expect, it } from 'vitest';
import { quaternionFromEuler, rotateVector, type ComponentInstance, type Vector3Like } from '@scada3d/core';
import { nudge } from './keyboard';

const valve: ComponentInstance = { id: 'v', type: 'valve', position: { x: 1, y: 0.2, z: 2 }, rotation: { x: 0, y: 0, z: 0, w: 1 }, scale: { x: 1, y: 1, z: 1 }, properties: {} };
const key = (k: string, shiftKey = false) => ({ key: k, shiftKey });

function expectVectorClose(actual: Vector3Like, expected: Vector3Like): void {
  expect(actual.x).toBeCloseTo(expected.x, 12);
  expect(actual.y).toBeCloseTo(expected.y, 12);
  expect(actual.z).toBeCloseTo(expected.z, 12);
}

describe('nudge', () => {
  it.each([
    ['ArrowRight', { x: 1.1, y: 0.2, z: 2 }],
    ['ArrowLeft', { x: 0.9, y: 0.2, z: 2 }],
    ['ArrowUp', { x: 1, y: 0.2, z: 1.9 }],
    ['ArrowDown', { x: 1, y: 0.2, z: 2.1 }],
    ['PageUp', { x: 1, y: 0.3, z: 2 }],
    ['PageDown', { x: 1, y: 0.1, z: 2 }],
  ] as const)('%s moves the component by 0.1 m', (k, position) => {
    expect(nudge(valve, key(k))).toEqual({ position, rotation: valve.rotation });
  });

  it('moves 1 m with Shift and keeps positions free of float noise', () => {
    expect(nudge(valve, key('ArrowRight', true))?.position).toEqual({ x: 2, y: 0.2, z: 2 });
    let c = { ...valve, position: { x: 0, y: 0, z: 0 } as ComponentInstance['position'] };
    for (let i = 0; i < 3; i++) c = { ...c, ...nudge(c, key('ArrowRight'))! };
    expect(c.position.x).toBe(0.3);
  });

  it('turns a quarter turn about Y with R and back with Shift+R', () => {
    const turned = nudge(valve, key('r'))!;
    const outlet = rotateVector({ x: 1, y: 0, z: 0 }, turned.rotation);
    expectVectorClose(outlet, { x: 0, y: 0, z: -1 });
    const back = nudge({ ...valve, rotation: turned.rotation }, key('R', true))!;
    expectVectorClose(rotateVector({ x: 1, y: 0, z: 0 }, back.rotation), { x: 1, y: 0, z: 0 });
    expect(turned.position).toEqual(valve.position);
  });

  it('composes the turn in world space on top of an existing rotation', () => {
    const tilted = { ...valve, rotation: quaternionFromEuler({ x: Math.PI / 2, y: 0, z: 0 }) };
    const turned = nudge(tilted, key('r'))!;
    // Local +Y was world +Z after the tilt; a world quarter turn about Y takes +Z to +X.
    expectVectorClose(rotateVector({ x: 0, y: 1, z: 0 }, turned.rotation), { x: 1, y: 0, z: 0 });
  });

  it('ignores other keys', () => {
    expect(nudge(valve, key('a'))).toBeUndefined();
    expect(nudge(valve, key('Enter'))).toBeUndefined();
  });
});
