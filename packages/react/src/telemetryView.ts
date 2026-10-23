import { canonicalUnits, type PropertyState, type Quantity, type TelemetryUnknownReason } from '@sakibcoolz/core';
import { describeLiveValue } from '@sakibcoolz/views-2d';

const reasonLabels: Record<TelemetryUnknownReason, string> = {
  STALE: 'stale',
  BAD_QUALITY: 'bad quality',
  DISCONNECTED: 'disconnected',
  NO_READING: 'no reading',
  INVALID_TIMESTAMP: 'invalid timestamp',
  INVALID_VALUE: 'invalid value',
  INVALID_UNIT: 'invalid unit',
  TYPE_MISMATCH: 'type mismatch',
};

/** One line for a bound property, e.g. "level: 62.46 % · GOOD" or "level: unknown (stale)". */
export function describeProperty(state: PropertyState, quantity?: Quantity): string {
  // One format for the 3D and 2D views (ADR-0026).
  return describeLiveValue(state, quantity ? canonicalUnits[quantity] : undefined);
}

/** Overlay summary of all bound property values. */
export function summarizeTelemetry(states: readonly PropertyState[]): string {
  const known = states.filter((s) => s.status === 'ok');
  const uncertain = known.filter((s) => s.status === 'ok' && s.uncertain).length;
  const unknown = states.filter((s) => s.status === 'unknown');
  const breakdown = (Object.keys(reasonLabels) as TelemetryUnknownReason[])
    .map((reason) => [unknown.filter((s) => s.reason === reason).length, reasonLabels[reason]] as const)
    .filter(([n]) => n > 0)
    .map(([n, label]) => `${n} ${label}`);
  return `Tags: ${known.length - uncertain} good, ${uncertain} uncertain, ${unknown.length} unknown${breakdown.length ? ` (${breakdown.join(', ')})` : ''}`;
}
