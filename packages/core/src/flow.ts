import { assessObservation, isNewer, qualities } from './observation';
import type { ScadaScene } from './scene';

export type Quality = 'GOOD' | 'BAD' | 'UNCERTAIN' | 'STALE';
export type ValueSource = 'MEASURED' | 'SIMULATED';

/** One flow observation supplied by the host. The SDK never fetches readings itself. */
export interface FlowReading {
  connectionId: string;
  /** Volumetric flow in m³/s, signed: positive runs from the connection's `from` port to its `to` port. */
  rate: number;
  quality: Quality;
  source: ValueSource;
  /** ISO 8601 time the value was observed at its source. */
  sourceTimestamp: string;
}

export type FlowDirection = 'forward' | 'reverse' | 'stopped' | 'unknown';
export type FlowUnknownReason = 'NO_READING' | 'BAD_QUALITY' | 'STALE' | 'INVALID_TIMESTAMP' | 'INVALID_VALUE';

export type FlowState =
  | {
      connectionId: string;
      direction: Exclude<FlowDirection, 'unknown'>;
      rate: number;
      quality: Quality;
      source: ValueSource;
      sourceTimestamp: string;
      /** The reading's quality is UNCERTAIN: show the direction, but mark it as doubtful. */
      uncertain: boolean;
      reason?: undefined;
    }
  | {
      connectionId: string;
      direction: 'unknown';
      reason: FlowUnknownReason;
      /** Present when a reading existed but could not be trusted, so the viewer can say why and since when. */
      quality?: Quality;
      source?: ValueSource;
      sourceTimestamp?: string;
      rate?: undefined;
    };

export interface FlowOptions {
  /** Current time in epoch milliseconds. Passed in so results are deterministic. */
  now: number;
  /** Which readings to use. Measured and simulated values are never mixed. Default MEASURED. */
  source?: ValueSource;
  /** Readings older than this are STALE. Default 10,000 ms. */
  staleAfterMs?: number;
  /** Timestamps further than this in the future are rejected. Default 5,000 ms. */
  maxClockSkewMs?: number;
  /** |rate| at or below this (m³/s) counts as stopped. Default 1e-6. */
  zeroThreshold?: number;
}

export interface FlowResolution {
  /** One state per scene connection, in connection order. */
  states: FlowState[];
  /** Connection ids that had readings but are not in the scene, in first-seen order. */
  unmatchedConnectionIds: string[];
}

/**
 * Decides the flow direction of every connection from host-supplied readings only. Topology and
 * valve state are never used to infer flow: no trustworthy reading means `unknown`, and a known
 * flow into a tee says nothing about its branches.
 */
export function resolveFlow(scene: ScadaScene, readings: readonly FlowReading[], options: FlowOptions): FlowResolution {
  const source = options.source ?? 'MEASURED';
  const staleAfterMs = options.staleAfterMs ?? 10_000;
  const maxClockSkewMs = options.maxClockSkewMs ?? 5_000;
  const zeroThreshold = options.zeroThreshold ?? 1e-6;

  const known = new Set(scene.connections.map((c) => c.id));
  const latest = new Map<string, FlowReading>();
  const unmatched = new Set<string>();
  for (const r of readings) {
    if (!known.has(r.connectionId)) {
      unmatched.add(r.connectionId);
      continue;
    }
    if (r.source !== source) continue;
    if (isNewer(r, latest.get(r.connectionId))) latest.set(r.connectionId, r);
  }

  const states = scene.connections.map((connection): FlowState => {
    const connectionId = connection.id;
    const r = latest.get(connectionId);
    if (!r) return { connectionId, direction: 'unknown', reason: 'NO_READING' };

    const validQuality = qualities.includes(r.quality);
    const unknown = (reason: FlowUnknownReason): FlowState => ({
      connectionId,
      direction: 'unknown',
      reason,
      ...(validQuality ? { quality: r.quality } : {}),
      source: r.source,
      sourceTimestamp: r.sourceTimestamp,
    });

    if (typeof r.rate !== 'number' || !Number.isFinite(r.rate)) return unknown('INVALID_VALUE');
    const problem = assessObservation(r, { now: options.now, staleAfterMs, maxClockSkewMs });
    if (problem) return unknown(problem);

    const direction = Math.abs(r.rate) <= zeroThreshold ? 'stopped' : r.rate > 0 ? 'forward' : 'reverse';
    return {
      connectionId,
      direction,
      rate: r.rate,
      quality: r.quality,
      source: r.source,
      sourceTimestamp: r.sourceTimestamp,
      uncertain: r.quality === 'UNCERTAIN',
    };
  });

  return { states, unmatchedConnectionIds: [...unmatched] };
}
