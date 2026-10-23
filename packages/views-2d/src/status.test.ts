import { describe, expect, it } from 'vitest';
import type { ComponentStatus } from '@sakibcoolz/core';
import { describeStatus, statusColors } from './DiagramView.js';

// One colour table and words for every status (ADR-0028 §4): colour is never the only cue.

const base: ComponentStatus = { componentId: 'TK-1', status: 'ok', unacknowledged: false, alarms: [], unknown: [], uncertain: [], simulated: false };

describe('describeStatus', () => {
  it('colours alarms by severity, unknown grey and uncertain light blue, with words', () => {
    expect(describeStatus({ ...base, status: 'alarm', severity: 'critical', unacknowledged: true })).toEqual({ color: statusColors.critical, text: 'critical alarm, unacknowledged' });
    expect(describeStatus({ ...base, status: 'alarm', severity: 'low' })).toEqual({ color: statusColors.low, text: 'low alarm' });
    expect(describeStatus({ ...base, status: 'unknown' })).toEqual({ color: statusColors.unknown, text: 'unknown value' });
    expect(describeStatus({ ...base, status: 'uncertain' })).toEqual({ color: statusColors.uncertain, text: 'uncertain value' });
    expect(describeStatus(base)).toBeUndefined();
    expect(describeStatus({ ...base, status: 'unbound' })).toBeUndefined();
    expect(new Set(Object.values(statusColors)).size).toBe(6);
  });
});
