import type { FlowState, FlowUnknownReason, Vector3Tuple } from '@sakibcoolz/core';

/** Visual marker speed along a pipe, m/s. Fixed on purpose: it shows direction, not a measured velocity. */
export const FLOW_MARKER_SPEED = 0.8;
/** Target distance between flow markers, metres. */
export const FLOW_MARKER_SPACING = 0.5;

export interface FlowAppearance {
  /** Markers travel from→to, to→from, sit still, or are not drawn. */
  motion: 'forward' | 'reverse' | 'still' | 'none';
  color: string;
  opacity: number;
  /** Unknown states are drawn as a dashed line along the pipe instead of markers. */
  dashed: boolean;
  simulated: boolean;
}

const colours = {
  measured: '#30caff',
  simulated: '#b58cff',
  stopped: '#9fb3c8',
  stale: '#d6a14b',
  bad: '#e76e75',
  unknown: '#c3cdd8',
};

export function flowAppearance(state: FlowState): FlowAppearance {
  const simulated = state.source === 'SIMULATED';
  if (state.direction === 'unknown') {
    const color = state.reason === 'STALE' ? colours.stale : state.reason === 'BAD_QUALITY' || state.reason === 'DISCONNECTED' ? colours.bad : colours.unknown;
    return { motion: 'none', color, opacity: 0.9, dashed: true, simulated };
  }
  const opacity = state.uncertain ? 0.45 : 1;
  if (state.direction === 'stopped') {
    return { motion: 'still', color: simulated ? colours.simulated : colours.stopped, opacity, dashed: false, simulated };
  }
  return { motion: state.direction, color: simulated ? colours.simulated : colours.measured, opacity, dashed: false, simulated };
}

/** Cumulative distance from the first point to each point. */
export function pathLengths(points: readonly Vector3Tuple[]): number[] {
  const lengths = [0];
  for (let i = 1; i < points.length; i++) {
    const [a, b] = [points[i - 1], points[i]];
    lengths.push(lengths[i - 1] + Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]));
  }
  return lengths;
}

/** The point at `distance` along the path, clamped to its ends. */
export function pointAt(points: readonly Vector3Tuple[], lengths: readonly number[], distance: number): Vector3Tuple {
  return pointAtInto(points, lengths, distance, [0, 0, 0]);
}

/** `pointAt` written into `out` (and returned), so per-frame callers allocate nothing. */
export function pointAtInto(points: readonly Vector3Tuple[], lengths: readonly number[], distance: number, out: Vector3Tuple): Vector3Tuple {
  const total = lengths[lengths.length - 1];
  const d = Math.min(Math.max(distance, 0), total);
  let i = 0;
  while (i < lengths.length - 2 && lengths[i + 1] < d) i++;
  const span = lengths[i + 1] - lengths[i];
  const t = span > 0 ? (d - lengths[i]) / span : 0;
  const a = points[i], b = points[i + 1] ?? points[i];
  out[0] = a[0] + (b[0] - a[0]) * t;
  out[1] = a[1] + (b[1] - a[1]) * t;
  out[2] = a[2] + (b[2] - a[2]) * t;
  return out;
}

/**
 * Distances of evenly spaced markers along a path of `length`, shifted by `travelled` (negative
 * for reverse) and wrapped, so a marker leaving one end re-enters at the other without a gap.
 */
export function markerDistances(length: number, spacing: number, travelled: number): number[] {
  if (!(length > 0)) return [];
  const count = Math.max(1, Math.floor(length / spacing + 1e-9));
  const step = length / count;
  return Array.from({ length: count }, (_, i) => {
    const d = (i * step + travelled) % length;
    return d < 0 ? d + length : d;
  });
}

const unknownLabels: [FlowUnknownReason, string][] = [
  ['STALE', 'stale'],
  ['BAD_QUALITY', 'bad quality'],
  ['DISCONNECTED', 'disconnected'],
  ['NO_READING', 'no reading'],
  ['INVALID_TIMESTAMP', 'invalid timestamp'],
  ['INVALID_VALUE', 'invalid value'],
];

/** One-line text summary of flow states for the viewer overlay and assistive technology. */
export function summarizeFlow(states: readonly FlowState[]): string {
  const part = (direction: 'forward' | 'reverse' | 'stopped') => {
    const matching = states.filter((s) => s.direction === direction);
    const uncertain = matching.filter((s) => s.direction !== 'unknown' && s.uncertain).length;
    return `${matching.length} ${direction}${uncertain ? ` (${uncertain} uncertain)` : ''}`;
  };
  const unknown = states.filter((s) => s.direction === 'unknown');
  const breakdown = unknownLabels
    .map(([reason, label]) => [unknown.filter((s) => s.reason === reason).length, label] as const)
    .filter(([n]) => n > 0)
    .map(([n, label]) => `${n} ${label}`);
  const unknownPart = `${unknown.length} unknown${breakdown.length ? ` (${breakdown.join(', ')})` : ''}`;
  return `Flow: ${part('forward')}, ${part('reverse')}, ${part('stopped')}, ${unknownPart}`;
}
