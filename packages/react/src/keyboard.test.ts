import { describe, expect, it } from 'vitest';
import { quaternionFromEuler, rotateVector, type ComponentInstance } from '@scada3d/core';
import { nudge } from './keyboard';

const valve: ComponentInstance = { id: 'v', type: 'valve', position: [1, 0.2, 2], rotation: [0, 0, 0, 1], scale: [1, 1, 1], properties: {} };
const key = (k: string, shiftKey = false) => ({ key: k, shiftKey });

describe('nudge', () => {
  it.each([
    ['ArrowRight', [1.1, 0.2, 2]],
    ['ArrowLeft', [0.9, 0.2, 2]],
    ['ArrowUp', [1, 0.2, 1.9]],
    ['ArrowDown', [1, 0.2, 2.1]],
    ['PageUp', [1, 0.3, 2]],
    ['PageDown', [1, 0.1, 2]],
  ] as const)('%s moves the component by 0.1 m', (k, position) => {
    expect(nudge(valve, key(k))).toEqual({ position, rotation: valve.rotation });
  });

  it('moves 1 m with Shift and keeps positions free of float noise', () => {
    expect(nudge(valve, key('ArrowRight', true))?.position).toEqual([2, 0.2, 2]);
    let c = { ...valve, position: [0, 0, 0] as ComponentInstance['position'] };
    for (let i = 0; i < 3; i++) c = { ...c, ...nudge(c, key('ArrowRight'))! };
    expect(c.position[0]).toBe(0.3);
  });

  it('turns a quarter turn about Y with R and back with Shift+R', () => {
    const turned = nudge(valve, key('r'))!;
    const outlet = rotateVector([1, 0, 0], turned.rotation);
    [0, 0, -1].forEach((n, i) => expect(outlet[i]).toBeCloseTo(n, 12));
    const back = nudge({ ...valve, rotation: turned.rotation }, key('R', true))!;
    rotateVector([1, 0, 0], back.rotation).forEach((n, i) => expect(n).toBeCloseTo([1, 0, 0][i], 12));
    expect(turned.position).toEqual(valve.position);
  });

  it('composes the turn in world space on top of an existing rotation', () => {
    const tilted = { ...valve, rotation: quaternionFromEuler([Math.PI / 2, 0, 0]) };
    const turned = nudge(tilted, key('r'))!;
    // Local +Y was world +Z after the tilt; a world quarter turn about Y takes +Z to +X.
    rotateVector([0, 1, 0], turned.rotation).forEach((n, i) => expect(n).toBeCloseTo([1, 0, 0][i], 12));
  });

  it('ignores other keys', () => {
    expect(nudge(valve, key('a'))).toBeUndefined();
    expect(nudge(valve, key('Enter'))).toBeUndefined();
  });
});
