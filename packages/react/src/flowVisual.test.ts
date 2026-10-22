import { describe, expect, it } from 'vitest';
import type { FlowState } from '@sakibcoolz/core';
import { flowAppearance, markerDistances, pathLengths, pointAt, pointAtInto, summarizeFlow } from './flowVisual.js';

const known = (direction: 'forward' | 'reverse' | 'stopped', overrides: Partial<FlowState> = {}): FlowState =>
  ({
    connectionId: 'e1',
    direction,
    rate: direction === 'reverse' ? -1 : direction === 'forward' ? 1 : 0,
    quality: 'GOOD',
    source: 'MEASURED',
    sourceTimestamp: '2026-10-15T12:00:00.000Z',
    uncertain: false,
    ...overrides,
  }) as FlowState;
const unknown = (reason: 'NO_READING' | 'BAD_QUALITY' | 'DISCONNECTED' | 'STALE' | 'INVALID_TIMESTAMP' | 'INVALID_VALUE'): FlowState => ({
  connectionId: 'e1',
  direction: 'unknown',
  reason,
});

describe('flowAppearance', () => {
  it('moves markers only for known forward or reverse flow', () => {
    expect(flowAppearance(known('forward')).motion).toBe('forward');
    expect(flowAppearance(known('reverse')).motion).toBe('reverse');
    expect(flowAppearance(known('stopped')).motion).toBe('still');
    for (const reason of ['NO_READING', 'BAD_QUALITY', 'DISCONNECTED', 'STALE', 'INVALID_TIMESTAMP', 'INVALID_VALUE'] as const) {
      expect(flowAppearance(unknown(reason))).toEqual(expect.objectContaining({ motion: 'none', dashed: true }));
    }
    // A lost link is shown like a bad reading, not like a missing one.
    expect(flowAppearance(unknown('DISCONNECTED')).color).toBe(flowAppearance(unknown('BAD_QUALITY')).color);
  });

  it('colours measured and simulated flow differently', () => {
    expect(flowAppearance(known('forward')).color).not.toBe(flowAppearance(known('forward', { source: 'SIMULATED' })).color);
    expect(flowAppearance(known('forward', { source: 'SIMULATED' })).simulated).toBe(true);
  });

  it('dims uncertain flow', () => {
    expect(flowAppearance(known('forward', { uncertain: true, quality: 'UNCERTAIN' })).opacity).toBeLessThan(flowAppearance(known('forward')).opacity);
  });

  it('tells stale, bad and missing data apart', () => {
    const colours = new Set((['STALE', 'BAD_QUALITY', 'NO_READING'] as const).map((r) => flowAppearance(unknown(r)).color));
    expect(colours.size).toBe(3);
    expect(flowAppearance(unknown('INVALID_VALUE')).color).toBe(flowAppearance(unknown('NO_READING')).color);
  });
});

describe('path sampling', () => {
  const path: [number, number, number][] = [
    [0, 0, 0],
    [2, 0, 0],
    [2, 1, 0],
  ];

  it('accumulates segment lengths', () => {
    expect(pathLengths(path)).toEqual([0, 2, 3]);
  });

  it('interpolates a point at a distance along the path, clamped to the ends', () => {
    const lengths = pathLengths(path);
    expect(pointAt(path, lengths, 1)).toEqual([1, 0, 0]);
    expect(pointAt(path, lengths, 2.5)).toEqual([2, 0.5, 0]);
    expect(pointAt(path, lengths, -1)).toEqual([0, 0, 0]);
    expect(pointAt(path, lengths, 9)).toEqual([2, 1, 0]);
  });
});

describe('markerDistances', () => {
  it('spaces markers evenly so the loop is seamless', () => {
    expect(markerDistances(3, 0.5, 0)).toEqual([0, 0.5, 1, 1.5, 2, 2.5]);
    expect(markerDistances(1.2, 0.5, 0)).toEqual([0, 0.6]);
  });

  it('moves markers forward with positive travel and wraps around', () => {
    expect(markerDistances(2, 1, 0.25)).toEqual([0.25, 1.25]);
    expect(markerDistances(2, 1, 1.75)).toEqual([1.75, 0.75]);
  });

  it('moves markers backward with negative travel and wraps around', () => {
    expect(markerDistances(2, 1, -0.25)).toEqual([1.75, 0.75]);
  });

  it('places one marker on a path shorter than the spacing and none on an empty one', () => {
    expect(markerDistances(0.2, 0.5, 0)).toEqual([0]);
    expect(markerDistances(0, 0.5, 0)).toEqual([]);
  });
});

describe('summarizeFlow', () => {
  it('counts directions and explains unknowns', () => {
    expect(
      summarizeFlow([known('forward'), known('forward'), known('reverse'), unknown('STALE'), unknown('NO_READING'), unknown('BAD_QUALITY')]),
    ).toBe('Flow: 2 forward, 1 reverse, 0 stopped, 3 unknown (1 stale, 1 bad quality, 1 no reading)');
  });

  it('omits the unknown breakdown when everything is known', () => {
    expect(summarizeFlow([known('stopped')])).toBe('Flow: 0 forward, 0 reverse, 1 stopped, 0 unknown');
  });

  it('marks uncertain readings', () => {
    expect(summarizeFlow([known('forward', { uncertain: true, quality: 'UNCERTAIN' })])).toBe(
      'Flow: 1 forward (1 uncertain), 0 reverse, 0 stopped, 0 unknown',
    );
  });
});

describe('pointAtInto', () => {
  const points: [number, number, number][] = [[0, 0, 0], [2, 0, 0], [2, 3, 0]];
  const lengths = pathLengths(points);

  it.each([0, 1, 2, 3.5, 5, -1, 9])('writes the same point as pointAt for distance %p', (d) => {
    const out: [number, number, number] = [NaN, NaN, NaN];
    expect(pointAtInto(points, lengths, d, out)).toBe(out);
    expect(out).toEqual(pointAt(points, lengths, d));
  });
});
