// Shared by the transport examples (ADR-0029 §4): the observation shape, message validation and URL
// checks. Self-contained so a host can copy this folder; transports.test.ts checks it against
// @sakibcoolz/core.

export type Quality = 'GOOD' | 'UNCERTAIN' | 'BAD' | 'STALE' | 'DISCONNECTED';
export type ValueSource = 'MEASURED' | 'SIMULATED';
export const dataTypes = ['bool', 'int16', 'uint16', 'int32', 'uint32', 'float32', 'float64', 'string'] as const;
export type DataType = (typeof dataTypes)[number];

/** Structurally the same as `Observation` in @sakibcoolz/core. */
export interface Observation {
  tagId: string;
  value: number | boolean | string;
  quality: Quality;
  sourceTimestamp: string;
  source?: ValueSource;
  dataType?: DataType;
  unit?: string;
}

/** Why a message, or one observation in it, was dropped. */
export type DropReason = 'TOO_LARGE' | 'NOT_TEXT' | 'NOT_JSON' | 'NOT_A_BATCH' | 'INVALID_OBSERVATION';

const qualities: readonly string[] = ['GOOD', 'UNCERTAIN', 'BAD', 'STALE', 'DISCONNECTED'];
const sources: readonly string[] = ['MEASURED', 'SIMULATED'];
const keys = new Set(['tagId', 'value', 'quality', 'sourceTimestamp', 'source', 'dataType', 'unit']);

/** Whether `o` has the observation shape. Meaning (timestamps, units, types) is the SDK's to judge. */
export function isObservation(o: unknown): o is Observation {
  if (typeof o !== 'object' || o === null || Array.isArray(o)) return false;
  const r = o as Record<string, unknown>;
  if (Object.keys(r).some((k) => !keys.has(k))) return false;
  if (typeof r.tagId !== 'string' || r.tagId === '') return false;
  if (!(typeof r.value === 'boolean' || typeof r.value === 'string' || (typeof r.value === 'number' && Number.isFinite(r.value)))) return false;
  if (typeof r.quality !== 'string' || !qualities.includes(r.quality)) return false;
  if (typeof r.sourceTimestamp !== 'string') return false;
  if (r.source !== undefined && (typeof r.source !== 'string' || !sources.includes(r.source))) return false;
  if (r.dataType !== undefined && (typeof r.dataType !== 'string' || !(dataTypes as readonly string[]).includes(r.dataType))) return false;
  if (r.unit !== undefined && typeof r.unit !== 'string') return false;
  return true;
}

/**
 * One message from the feed: a JSON array of observations, or `{ "observations": [...] }`.
 * Bad observations are dropped one by one; a bad message is dropped whole.
 */
export function parseBatch(data: unknown, maxChars: number): { observations: Observation[]; dropped: DropReason[] } {
  if (typeof data !== 'string') return { observations: [], dropped: ['NOT_TEXT'] };
  if (data.length > maxChars) return { observations: [], dropped: ['TOO_LARGE'] };
  let parsed: unknown;
  try {
    parsed = JSON.parse(data);
  } catch {
    return { observations: [], dropped: ['NOT_JSON'] };
  }
  const list = Array.isArray(parsed) ? parsed : typeof parsed === 'object' && parsed !== null && Array.isArray((parsed as { observations?: unknown }).observations) ? (parsed as { observations: unknown[] }).observations : undefined;
  if (!list) return { observations: [], dropped: ['NOT_A_BATCH'] };
  const observations: Observation[] = [];
  const dropped: DropReason[] = [];
  for (const o of list) {
    if (isObservation(o)) observations.push({ ...o });
    else dropped.push('INVALID_OBSERVATION');
  }
  return { observations, dropped };
}

/**
 * The feed's URL, or an error: only the given protocols, and never a user name or password in the
 * URL, where it would end up in logs and history. Authenticate with cookies or a wrapped `fetch`.
 */
export function checkFeedUrl(url: string | URL, protocols: readonly string[]): URL {
  const base = typeof location !== 'undefined' ? location.href : undefined;
  const parsed = new URL(url, base);
  if (parsed.username || parsed.password) throw new Error('Feed URL must not contain credentials.');
  if (!protocols.includes(parsed.protocol)) throw new Error(`Feed URL must use ${protocols.join(' or ')}, not ${parsed.protocol}`);
  return parsed;
}
