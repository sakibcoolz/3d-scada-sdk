import type { FlowReading, Quality, ValueSource } from './flow.js';
import { assessObservation, isNewer, type FreshnessOptions } from './observation.js';
import type { ComponentType, Quantity, ScadaScene } from './scene.js';
import { isKnownUnit, toCanonical } from './units.js';

/** One value for a host tag. Read-only: the SDK never writes tags (ADR-0003). */
export interface Observation {
  tagId: string;
  value: number | boolean | string;
  quality: Quality;
  /** ISO 8601 time the value was observed at its source. */
  sourceTimestamp: string;
  /** Default MEASURED. */
  source?: ValueSource;
  /** Unit of `value`; when absent the binding's unit, then the canonical unit, is assumed. */
  unit?: string;
}

export type TelemetryUnknownReason = 'NO_READING' | 'BAD_QUALITY' | 'STALE' | 'INVALID_TIMESTAMP' | 'INVALID_VALUE' | 'INVALID_UNIT';

type Target = { bindingId: string; instanceId: string; property: string };

export type PropertyState =
  | (Target & {
      status: 'ok';
      /** In the canonical unit of the property's quantity. */
      value: number | boolean;
      quality: Quality;
      source: ValueSource;
      sourceTimestamp: string;
      uncertain: boolean;
      reason?: undefined;
    })
  | (Target & {
      status: 'unknown';
      reason: TelemetryUnknownReason;
      quality?: Quality;
      source?: ValueSource;
      sourceTimestamp?: string;
      value?: undefined;
    });

export interface TelemetryOptions extends FreshnessOptions {
  /** Which observations to use; measured and simulated are never mixed. Default MEASURED. */
  source?: ValueSource;
  /** Quantities of bindable properties. Without it, numbers and booleans pass through unconverted. */
  resolveBindable?: (type: ComponentType) => Readonly<Record<string, Quantity>> | undefined;
}

export interface TelemetryResolution {
  /** One state per property binding, in binding order. */
  properties: PropertyState[];
  /** Readings for flow bindings that have an observation, in m³/s, ready for `resolveFlow`. */
  flowReadings: FlowReading[];
  /** Observed tag ids that no binding uses, in first-seen order. */
  unmatchedTagIds: string[];
}

/** Value in the canonical unit, or the reason it cannot be used. */
function convert(value: Observation['value'], quantity: Quantity | undefined, unit: string | undefined): { value: number | boolean } | { reason: 'INVALID_VALUE' | 'INVALID_UNIT' } {
  if (quantity === 'boolean' || (quantity === undefined && typeof value === 'boolean')) {
    if (typeof value !== 'boolean') return { reason: 'INVALID_VALUE' };
    return unit === undefined || unit === '' ? { value } : { reason: 'INVALID_UNIT' };
  }
  if (typeof value !== 'number' || !Number.isFinite(value)) return { reason: 'INVALID_VALUE' };
  if (quantity === undefined) return { value };
  if (!isKnownUnit(quantity, unit)) return { reason: 'INVALID_UNIT' };
  return { value: toCanonical(quantity, value, unit)! };
}

/**
 * Applies host observations to the scene's tag bindings. Pure: `now` is passed in and nothing is
 * written back. Property bindings resolve to a trusted value or an unknown reason; flow bindings
 * become `FlowReading`s so `resolveFlow` stays the single rule for flow direction.
 */
export function resolveTelemetry(scene: ScadaScene, observations: readonly Observation[], options: TelemetryOptions): TelemetryResolution {
  const source = options.source ?? 'MEASURED';
  const bindings = scene.tagBindings ?? [];
  const boundTags = new Set(bindings.map((b) => b.tagId));
  const latest = new Map<string, Observation>();
  const unmatched = new Set<string>();
  for (const o of observations) {
    if (!boundTags.has(o.tagId)) {
      unmatched.add(o.tagId);
      continue;
    }
    if ((o.source ?? 'MEASURED') !== source) continue;
    if (isNewer(o, latest.get(o.tagId))) latest.set(o.tagId, o);
  }

  const components = new Map(scene.components.map((c) => [c.id, c]));
  const properties: PropertyState[] = [];
  const flowReadings: FlowReading[] = [];
  for (const binding of bindings) {
    const o = latest.get(binding.tagId);
    if (binding.kind === 'flow') {
      if (!o) continue;
      const converted = convert(o.value, 'flow', o.unit ?? binding.unit);
      flowReadings.push({
        connectionId: binding.connectionId,
        rate: 'value' in converted ? (converted.value as number) : Number.NaN,
        quality: o.quality,
        source,
        sourceTimestamp: o.sourceTimestamp,
      });
      continue;
    }
    const target: Target = { bindingId: binding.id, instanceId: binding.instanceId, property: binding.property };
    if (!o) {
      properties.push({ ...target, status: 'unknown', reason: 'NO_READING' });
      continue;
    }
    const meta = { quality: o.quality, source, sourceTimestamp: o.sourceTimestamp };
    const owner = components.get(binding.instanceId);
    const quantity = owner ? options.resolveBindable?.(owner.type)?.[binding.property] : undefined;
    const converted = convert(o.value, quantity, o.unit ?? binding.unit);
    const problem = 'reason' in converted ? converted.reason : assessObservation(o, options);
    if (problem) properties.push({ ...target, status: 'unknown', reason: problem, ...meta });
    else properties.push({ ...target, status: 'ok', value: (converted as { value: number | boolean }).value, ...meta, uncertain: o.quality === 'UNCERTAIN' });
  }
  return { properties, flowReadings, unmatchedTagIds: [...unmatched] };
}

/**
 * The scene as it should be drawn: trusted values replace authored ones, and bound properties
 * without a trusted value are removed so an authored default is never shown as if it were live.
 * For display only; never save the result.
 */
export function displayScene(scene: ScadaScene, properties: readonly PropertyState[]): ScadaScene {
  if (properties.length === 0) return scene;
  const byComponent = new Map<string, PropertyState[]>();
  for (const p of properties) byComponent.set(p.instanceId, [...(byComponent.get(p.instanceId) ?? []), p]);
  return {
    ...scene,
    components: scene.components.map((c) => {
      const states = byComponent.get(c.id);
      if (!states) return c;
      const next = { ...c.properties };
      for (const s of states) {
        if (s.status === 'ok') next[s.property] = s.value;
        else delete next[s.property];
      }
      return { ...c, properties: next };
    }),
  };
}
