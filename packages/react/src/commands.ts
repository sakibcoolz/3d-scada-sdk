import { valueFitsDataType, type DataType, type Quality, type RuntimeVariable, type ScadaScene, type TelemetryUnknownReason, type ValueSource, type VariableState } from '@sakibcoolz/core';

// The command-request boundary (ADR-0029 §3): what may be requested, and the request a host receives.
// Pure. Nothing here writes, retries or queues: a confirmed request is handed to the host once.

/** What the host receives after the operator confirms. The host authorizes, audits and writes. */
export interface CommandRequest {
  /** Unique within this runtime session; the host owns idempotency. */
  requestId: string;
  tagId: string;
  componentId?: string;
  dataType: DataType;
  value: number | boolean;
  unit?: string;
  /** The value the operator saw when confirming. */
  current?: { value: number | boolean; quality: Quality; sourceTimestamp: string };
  sceneRevision: string;
  sceneDigest: string;
  /** ISO 8601, from the browser clock. */
  requestedAt: string;
}

export type CommandState = 'pending' | 'accepted' | 'rejected' | 'completed' | 'failed';
/** The host's word on a request, shown as given; the SDK draws no conclusion from it. */
export interface CommandStatus {
  state: CommandState;
  message?: string;
}

/** Shown in every confirmation, whatever the host adds. */
export const COMMAND_NOTICE = 'This sends a request to the host application. It does not change the plant by itself: the host’s authorization and the controller’s interlocks decide whether anything happens.';

const reasons: Record<TelemetryUnknownReason, string> = { STALE: 'stale', BAD_QUALITY: 'bad quality', DISCONNECTED: 'disconnected', NO_READING: 'missing', INVALID_TIMESTAMP: 'invalid (timestamp)', INVALID_VALUE: 'invalid', INVALID_UNIT: 'invalid (unit)', TYPE_MISMATCH: 'of the wrong type' };

/** The writable variables of a component: its own, and those bound to its properties, in scene order. */
export function writableVariables(scene: ScadaScene, componentId: string): RuntimeVariable[] {
  const bound = new Set((scene.tagBindings ?? []).flatMap((b) => (b.kind === 'property' && b.instanceId === componentId ? [b.tagId] : [])));
  return (scene.runtimeVariables ?? []).filter((v) => v.access === 'readWrite' && v.command && v.dataType !== 'string' && (v.componentId === componentId || bound.has(v.id)));
}

/** Whether a request may be started now, or why not: never on an unknown reading or simulated values. */
export function commandAvailability(state: VariableState | undefined, source: ValueSource | undefined): { ok: true } | { ok: false; reason: string } {
  if (source === 'SIMULATED') return { ok: false, reason: 'Not available while values are simulated: requests go to the plant, not to a simulator.' };
  if (!state || state.status === 'unknown') return { ok: false, reason: `Not available: the current reading is ${reasons[state?.reason ?? 'NO_READING']}.` };
  return { ok: true };
}

/** The value to request, checked against the variable's type and limits, or why it cannot be. */
export function checkCommandValue(variable: RuntimeVariable, input: string | boolean): { ok: true; value: number | boolean } | { ok: false; message: string } {
  if (variable.dataType === 'bool') return typeof input === 'boolean' ? { ok: true, value: input } : { ok: false, message: 'Choose on or off.' };
  const text = typeof input === 'string' ? input.trim() : '';
  if (text === '') return { ok: false, message: 'Enter a value.' };
  const value = Number(text);
  if (!Number.isFinite(value)) return { ok: false, message: 'Enter a number.' };
  const { min, max, step } = variable.command ?? {};
  if (min === undefined || max === undefined) return { ok: false, message: 'This variable has no limits, so it cannot be requested.' };
  if (value < min || value > max) return { ok: false, message: `Enter a value from ${min} to ${max}.` };
  if (step !== undefined) {
    const k = (value - min) / step;
    if (Math.abs(k - Math.round(k)) > 1e-9 * Math.max(1, Math.abs(k))) return { ok: false, message: `Enter a value in steps of ${step} from ${min}.` };
  }
  if (!valueFitsDataType(value, variable.dataType, !!variable.scaling)) return { ok: false, message: `${value} does not fit ${variable.dataType}.` };
  return { ok: true, value };
}

/** "on", "off" or "55 %". */
export function formatCommandValue(variable: RuntimeVariable, value: number | boolean | string): string {
  if (typeof value === 'boolean') return value ? 'on' : 'off';
  return `${value}${variable.unit ? ` ${variable.unit}` : ''}`;
}

/**
 * Request IDs for one runtime session: a random prefix and a counter. `crypto.randomUUID` is not
 * used: it needs a secure origin, and plant LANs are often plain HTTP.
 */
export function requestIds(): () => string {
  const prefix = Math.random().toString(36).slice(2, 10).padEnd(8, '0');
  let n = 0;
  return () => `cmd-${prefix}-${++n}`;
}

export function createCommandRequest(input: { requestId: string; variable: RuntimeVariable; value: number | boolean; current: VariableState | undefined; revision: string; digest: string; at: Date }): CommandRequest {
  const { variable, current } = input;
  return {
    requestId: input.requestId,
    tagId: variable.id,
    ...(variable.componentId !== undefined ? { componentId: variable.componentId } : {}),
    dataType: variable.dataType,
    value: input.value,
    ...(variable.unit !== undefined ? { unit: variable.unit } : {}),
    ...(current?.status === 'ok' && typeof current.value !== 'string' ? { current: { value: current.value, quality: current.quality, sourceTimestamp: current.sourceTimestamp } } : {}),
    sceneRevision: input.revision,
    sceneDigest: input.digest,
    requestedAt: input.at.toISOString(),
  };
}
