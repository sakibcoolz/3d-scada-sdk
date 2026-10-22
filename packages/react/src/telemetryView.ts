import { canonicalUnits, type PropertyState, type Quantity, type TelemetryUnknownReason } from '@sakibcoolz/core';

const reasonLabels: Record<TelemetryUnknownReason, string> = {
  STALE: 'stale',
  BAD_QUALITY: 'bad quality',
  DISCONNECTED: 'disconnected',
  NO_READING: 'no reading',
  INVALID_TIMESTAMP: 'invalid timestamp',
  INVALID_VALUE: 'invalid value',
  INVALID_UNIT: 'invalid unit',
};

const format = (value: number | boolean) => (typeof value === 'number' ? String(Math.round(value * 100) / 100) : String(value));

/** One line for a bound property, e.g. "level: 62.46 % · GOOD" or "level: unknown (stale)". */
export function describeProperty(state: PropertyState, quantity?: Quantity): string {
  if (state.status === 'unknown') return `${state.property}: unknown (${reasonLabels[state.reason]})`;
  const unit = quantity ? canonicalUnits[quantity] : '';
  return `${state.property}: ${format(state.value)}${unit ? ` ${unit}` : ''} · ${state.quality}`;
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
