import { describe, expect, it } from 'vitest';
import type { PropertyState } from '@scada3d/core';
import { describeProperty, summarizeTelemetry } from './telemetryView';

const ok = (property: string, value: number | boolean, uncertain = false): PropertyState => ({
  bindingId: `b-${property}`,
  instanceId: 'tank',
  property,
  status: 'ok',
  value,
  quality: uncertain ? 'UNCERTAIN' : 'GOOD',
  source: 'MEASURED',
  sourceTimestamp: '2026-10-15T12:00:00.000Z',
  uncertain,
});
const unknown = (property: string, reason: 'NO_READING' | 'STALE' | 'BAD_QUALITY' | 'INVALID_UNIT'): PropertyState => ({
  bindingId: `b-${property}`,
  instanceId: 'tank',
  property,
  status: 'unknown',
  reason,
});

describe('describeProperty', () => {
  it('shows a value with its canonical unit and quality', () => {
    expect(describeProperty(ok('level', 62.456), 'percent')).toBe('level: 62.46 % · GOOD');
    expect(describeProperty(ok('temperature', 80), 'temperature')).toBe('temperature: 80 °C · GOOD');
    expect(describeProperty(ok('open', false), 'boolean')).toBe('open: false · GOOD');
  });

  it('marks uncertain values', () => {
    expect(describeProperty(ok('level', 10, true), 'percent')).toBe('level: 10 % · UNCERTAIN');
  });

  it('says why a value is unknown', () => {
    expect(describeProperty(unknown('level', 'STALE'), 'percent')).toBe('level: unknown (stale)');
    expect(describeProperty(unknown('temperature', 'INVALID_UNIT'), 'temperature')).toBe('temperature: unknown (invalid unit)');
  });
});

describe('summarizeTelemetry', () => {
  it('counts good, uncertain and unknown tag values with reasons', () => {
    expect(summarizeTelemetry([ok('a', 1), ok('b', 2), ok('c', 3, true), unknown('d', 'STALE'), unknown('e', 'NO_READING')])).toBe(
      'Tags: 2 good, 1 uncertain, 2 unknown (1 stale, 1 no reading)',
    );
  });

  it('omits the breakdown when nothing is unknown', () => {
    expect(summarizeTelemetry([ok('a', 1)])).toBe('Tags: 1 good, 0 uncertain, 0 unknown');
  });
});
