import type { Quality } from './flow';

/** Quality and timestamp rules shared by flow readings and tag observations. */
export const qualities: readonly Quality[] = ['GOOD', 'BAD', 'UNCERTAIN', 'STALE'];

export interface FreshnessOptions {
  /** Current time in epoch milliseconds. */
  now: number;
  /** Older observations are STALE. Default 10,000 ms. */
  staleAfterMs?: number;
  /** Timestamps further than this in the future are rejected. Default 5,000 ms. */
  maxClockSkewMs?: number;
}

export type ObservationProblem = 'BAD_QUALITY' | 'STALE' | 'INVALID_TIMESTAMP' | 'INVALID_VALUE';

/** Why an observation cannot be trusted, or undefined if it can (UNCERTAIN is trusted but flagged). */
export function assessObservation(o: { quality: Quality; sourceTimestamp: string }, options: FreshnessOptions): ObservationProblem | undefined {
  if (!qualities.includes(o.quality)) return 'INVALID_VALUE';
  const observedAt = Date.parse(o.sourceTimestamp);
  if (Number.isNaN(observedAt) || observedAt - options.now > (options.maxClockSkewMs ?? 5_000)) return 'INVALID_TIMESTAMP';
  if (o.quality === 'BAD') return 'BAD_QUALITY';
  if (o.quality === 'STALE' || options.now - observedAt > (options.staleAfterMs ?? 10_000)) return 'STALE';
  return undefined;
}

/** Newest wins; unparseable timestamps lose to any valid one; ties go to the later item. */
export function isNewer(candidate: { sourceTimestamp: string }, current: { sourceTimestamp: string } | undefined): boolean {
  if (!current) return true;
  const a = Date.parse(candidate.sourceTimestamp);
  const b = Date.parse(current.sourceTimestamp);
  if (Number.isNaN(a)) return Number.isNaN(b);
  return Number.isNaN(b) || a >= b;
}
