import type { FlowReading, Quality, ValueSource } from './flow.js';
import { assessObservation, isNewer, type FreshnessOptions } from './observation.js';
import { dataTypes, type ComponentType, type DataType, type Quantity, type ScadaScene } from './scene.js';
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
  /**
   * The value's data type as the gateway reports it (ADR-0029). When the tag's runtime variable
   * declares another type, the value is unknown (TYPE_MISMATCH).
   */
  dataType?: DataType;
  /** Unit of `value`; when absent the binding's unit, then the runtime variable's unit, then the canonical unit, is assumed. */
  unit?: string;
}

export type TelemetryUnknownReason = 'NO_READING' | 'BAD_QUALITY' | 'DISCONNECTED' | 'STALE' | 'INVALID_TIMESTAMP' | 'INVALID_VALUE' | 'INVALID_UNIT' | 'TYPE_MISMATCH';

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

const integerRanges: Partial<Record<DataType, readonly [number, number]>> = {
  int16: [-32768, 32767],
  uint16: [0, 65535],
  int32: [-2147483648, 2147483647],
  uint32: [0, 4294967295],
};
const FLOAT32_MAX = 3.4028234663852886e38;

/**
 * Whether `value` fits a tag's data type (ADR-0029): a boolean for `bool`, an integer in range for the
 * integer types, a finite number for the float types, a string for `string`. A `scaled` variable
 * carries the host's engineering value, not the raw register, so any finite number fits.
 */
export function valueFitsDataType(value: unknown, dataType: DataType, scaled = false): boolean {
  if (dataType === 'bool') return typeof value === 'boolean';
  if (dataType === 'string') return typeof value === 'string';
  if (typeof value !== 'number' || !Number.isFinite(value)) return false;
  if (scaled || dataType === 'float64') return true;
  if (dataType === 'float32') return Math.abs(value) <= FLOAT32_MAX;
  const range = integerRanges[dataType];
  return !!range && Number.isInteger(value) && value >= range[0] && value <= range[1];
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
  // A runtime variable's unit applies when neither the observation nor the binding gives one (ADR-0024).
  const variableUnits = new Map((scene.runtimeVariables ?? []).filter((v) => v.unit !== undefined).map((v) => [v.id, v.unit]));
  const variables = new Map((scene.runtimeVariables ?? []).map((v) => [v.id, v]));
  /** The declared type wins; a gateway's stated type must match it, and the value must fit (ADR-0029). */
  const typeProblem = (o: Observation): 'TYPE_MISMATCH' | 'INVALID_VALUE' | undefined => {
    const variable = variables.get(o.tagId);
    if (o.dataType !== undefined && (!dataTypes.includes(o.dataType) || (variable && o.dataType !== variable.dataType))) return 'TYPE_MISMATCH';
    const declared = variable?.dataType ?? o.dataType;
    return declared && !valueFitsDataType(o.value, declared, !!variable?.scaling) ? 'INVALID_VALUE' : undefined;
  };
  const properties: PropertyState[] = [];
  const flowReadings: FlowReading[] = [];
  for (const binding of bindings) {
    const o = latest.get(binding.tagId);
    if (binding.kind === 'flow') {
      if (!o) continue;
      const converted = convert(o.value, 'flow', o.unit ?? binding.unit ?? variableUnits.get(binding.tagId));
      flowReadings.push({
        connectionId: binding.connectionId,
        rate: 'value' in converted && !typeProblem(o) ? (converted.value as number) : Number.NaN,
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
    const converted = convert(o.value, quantity, o.unit ?? binding.unit ?? variableUnits.get(binding.tagId));
    const problem = typeProblem(o) ?? ('reason' in converted ? converted.reason : assessObservation(o, options));
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
