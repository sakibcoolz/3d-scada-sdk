import { describe, expect, it } from 'vitest';
import { componentStatus, createEmptyScene, type ScadaScene } from '@sakibcoolz/core';
import { describeAlarm, describeAttention, summarizeStatus } from './statusText.js';
import { markerPlacement } from './statusMarkers.js';

// The runtime's words for alarms and status (ADR-0028 §4), and where the 3D marker goes.

const component = (id: string) => ({ id, type: 'tank' as const, position: { x: 0, y: 0, z: 0 }, rotation: { x: 0, y: 0, z: 0, w: 1 }, scale: { x: 1, y: 1, z: 1 }, properties: {} });
const scene: ScadaScene = { ...createEmptyScene(), components: [component('TK-1'), component('P-1')] };

describe('status text', () => {
  it('describes an alarm exactly as given, with its acknowledgement', () => {
    expect(describeAlarm({ id: 'a', severity: 'high', message: 'Tank level high', active: true, since: '2026-10-23T08:00:00Z' })).toBe('HIGH · Tank level high · since 2026-10-23T08:00:00Z · unacknowledged');
    expect(describeAlarm({ id: 'a', severity: 'low', message: 'Filter dirty', active: true, acknowledged: true })).toBe('LOW · Filter dirty · acknowledged');
  });

  it('gives one Attention line per component and a summary of the counts', () => {
    const status = componentStatus(scene, { properties: [{ bindingId: 'b', instanceId: 'P-1', property: 'speed', status: 'unknown', reason: 'DISCONNECTED' }] }, [
      { id: 'a', componentId: 'TK-1', severity: 'high', message: 'Level high', active: true },
      { id: 'b', componentId: 'TK-1', severity: 'low', message: 'Filter', active: true, acknowledged: true },
      { id: 'c', componentId: 'XV-9', severity: 'medium', message: 'Spare', active: true },
    ]);
    expect(status.attention.map((s) => describeAttention(s, s.componentId))).toEqual(['TK-1: HIGH alarm, Level high (+1 more) · unacknowledged', 'P-1: unknown speed (disconnected)']);
    expect(summarizeStatus(status)).toBe('Alarms: 1 high (1 unacknowledged) · 1 unknown · 1 not linked to equipment');
    expect(summarizeStatus(componentStatus(scene, undefined, []))).toBe('No alarms');
  });
});

describe('markerPlacement', () => {
  it('sits centred above the world-space bounds, following rotation and scale', () => {
    const bounds = { min: [-1, 0, -0.5] as [number, number, number], max: [1, 2, 0.5] as [number, number, number] };
    expect(markerPlacement({ position: { x: 3, y: 1, z: 0 }, rotation: { x: 0, y: 0, z: 0, w: 1 }, scale: { x: 1, y: 1, z: 1 } }, bounds)).toEqual({ position: [3, 3.3, 0], radius: 0.6 });
    // A quarter turn about X lays it on its side: the top is now the old +z face, scaled by 2.
    const side = markerPlacement({ position: { x: 0, y: 0, z: 0 }, rotation: { x: -Math.SQRT1_2, y: 0, z: 0, w: Math.SQRT1_2 }, scale: { x: 1, y: 1, z: 2 } }, bounds);
    expect(side.position[1]).toBeCloseTo(1.3);
    expect(side.radius).toBeCloseTo(0.6);
  });
});
