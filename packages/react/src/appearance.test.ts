import { describe, expect, it } from 'vitest';
import { effectiveViewMode, heatColor, HEAT_RANGE_C, liquidFill, shellLook, viewModes } from './appearance';

describe('view modes', () => {
  it('lists the four modes in menu order', () => {
    expect(viewModes).toEqual(['normal', 'glass', 'xray', 'cutaway']);
  });

  it('lets a per-component override win over the global mode', () => {
    expect(effectiveViewMode('normal')).toBe('normal');
    expect(effectiveViewMode('normal', 'xray')).toBe('xray');
    expect(effectiveViewMode('cutaway', 'glass')).toBe('glass');
  });

  it('keeps normal shells opaque and solid', () => {
    expect(shellLook('normal')).toEqual({ opacity: 1, transparent: false, depthWrite: true, metalness: 0.65, edges: false, clip: false });
  });

  it('makes glass see-through without writing depth, so contents stay visible', () => {
    expect(shellLook('glass')).toEqual(expect.objectContaining({ transparent: true, depthWrite: false, edges: false, clip: false }));
    expect(shellLook('glass').opacity).toBeLessThan(0.5);
  });

  it('makes x-ray fainter than glass and outlines the edges', () => {
    expect(shellLook('xray').opacity).toBeLessThan(shellLook('glass').opacity);
    expect(shellLook('xray')).toEqual(expect.objectContaining({ transparent: true, depthWrite: false, edges: true }));
  });

  it('keeps cutaway shells solid but clipped', () => {
    expect(shellLook('cutaway')).toEqual(expect.objectContaining({ opacity: 1, transparent: false, clip: true }));
  });
});

describe('liquidFill', () => {
  it.each([
    [0, 0],
    [45, 0.45],
    [100, 1],
  ])('fills %p%% as fraction %p', (level, fraction) => {
    expect(liquidFill(level)).toEqual({ status: 'ok', fraction });
  });

  it.each([
    [-10, 0],
    [130, 1],
  ])('clamps out-of-range level %p and says so', (level, fraction) => {
    expect(liquidFill(level)).toEqual({ status: 'clamped', fraction });
  });

  it('draws no liquid for a missing level instead of assuming one', () => {
    expect(liquidFill(undefined)).toEqual({ status: 'missing' });
  });

  it.each([Number.NaN, Number.POSITIVE_INFINITY, '45', true])('draws no liquid for invalid level %p', (level) => {
    expect(liquidFill(level)).toEqual({ status: 'invalid' });
  });
});

describe('heatColor', () => {
  it('is blue at the cold end and red at the hot end', () => {
    expect(heatColor(HEAT_RANGE_C.min)).toBe('#3399ff');
    expect(heatColor(HEAT_RANGE_C.max)).toBe('#ff3333');
  });

  it('clamps temperatures outside the legend range', () => {
    expect(heatColor(-40)).toBe(heatColor(HEAT_RANGE_C.min));
    expect(heatColor(250)).toBe(heatColor(HEAT_RANGE_C.max));
  });

  it('moves steadily from blue towards red as temperature rises', () => {
    const red = (c: string) => parseInt(c.slice(1, 3), 16);
    const blue = (c: string) => parseInt(c.slice(5, 7), 16);
    const samples = [0, 25, 50, 75, 100].map((t) => heatColor(t)!);
    for (let i = 1; i < samples.length; i++) {
      expect(red(samples[i])).toBeGreaterThanOrEqual(red(samples[i - 1]));
      expect(blue(samples[i])).toBeLessThanOrEqual(blue(samples[i - 1]));
    }
  });

  it.each([undefined, Number.NaN, '80'])('gives no tint for a missing or invalid temperature %p', (t) => {
    expect(heatColor(t)).toBeUndefined();
  });
});
