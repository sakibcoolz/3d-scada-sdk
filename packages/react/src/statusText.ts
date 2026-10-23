import { alarmSeverities, type AlarmState, type ComponentStatus, type StatusResult, type TelemetryUnknownReason } from '@sakibcoolz/core';

// Words for host alarms and component status in the runtime (ADR-0028 §4). Colour is never the only cue.

const reasonText: Record<TelemetryUnknownReason, string> = { STALE: 'stale', BAD_QUALITY: 'bad quality', DISCONNECTED: 'disconnected', NO_READING: 'no reading', INVALID_TIMESTAMP: 'invalid timestamp', INVALID_VALUE: 'invalid value', INVALID_UNIT: 'invalid unit', TYPE_MISMATCH: 'type mismatch' };

/** "HIGH · Tank level high · since … · unacknowledged": an alarm exactly as the host gave it. */
export function describeAlarm(alarm: AlarmState): string {
  return `${alarm.severity.toUpperCase()} · ${alarm.message}${alarm.since ? ` · since ${alarm.since}` : ''} · ${alarm.acknowledged ? 'acknowledged' : 'unacknowledged'}`;
}

/** One line of the Attention list. */
export function describeAttention(status: ComponentStatus, name: string): string {
  const simulated = status.simulated ? ' · SIMULATED values' : '';
  if (status.status === 'alarm') {
    const [first, ...rest] = status.alarms;
    return `${name}: ${first.severity.toUpperCase()} alarm, ${first.message}${rest.length ? ` (+${rest.length} more)` : ''}${status.unacknowledged ? ' · unacknowledged' : ''}${simulated}`;
  }
  return `${name}: unknown ${status.unknown.map((u) => `${u.property} (${reasonText[u.reason]})`).join(', ')}${simulated}`;
}

/** The overlay counts, e.g. "Alarms: 1 high (1 unacknowledged) · 1 unknown · 1 not linked". */
export function summarizeStatus({ counts }: StatusResult): string {
  const alarms = alarmSeverities.filter((s) => counts[s] > 0).map((s) => `${counts[s]} ${s}`);
  const parts = [
    ...(alarms.length ? [`Alarms: ${alarms.join(', ')}${counts.unacknowledged ? ` (${counts.unacknowledged} unacknowledged)` : ''}`] : ['No alarms']),
    ...(counts.unknown ? [`${counts.unknown} unknown`] : []),
    ...(counts.uncertain ? [`${counts.uncertain} uncertain`] : []),
    ...(counts.unlinked ? [`${counts.unlinked} not linked to equipment`] : []),
  ];
  return parts.join(' · ');
}
