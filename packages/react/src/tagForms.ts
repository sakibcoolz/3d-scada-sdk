import { validateScene, type DataType, type JsonValue, type RuntimeVariable, type ScadaScene, type SceneDataSource, type SceneValidationError, type SceneValidationOptions } from '@sakibcoolz/core';

// The tag editor's form models (ADR-0027, T-089): text fields in, typed data sources and read-only
// runtime variables out, and validation errors mapped back to the field that caused them. Core's
// `validateScene` decides; nothing here relaxes a rule. Pure; no rendering.

export interface DataSourceForm {
  id: string;
  name: string;
  /** opcua, modbus-tcp, modbus-rtu, host, or a namespaced host protocol. */
  protocol: string;
  /** A component id, or empty. */
  deviceId: string;
  /** An opaque host reference such as `host:gateway-1/plc-01`; never credentials. */
  endpointRef: string;
}

export interface VariableForm {
  id: string;
  name: string;
  componentId: string;
  dataType: DataType;
  unit: string;
  /** Empty for a variable with no source. */
  dataSourceId: string;
  variable: string;
  // Modbus address
  area: string;
  address: string;
  unitId: string;
  byteOrder: string;
  wordOrder: string;
  bit: string;
  // OPC UA address
  nodeId: string;
  namespaceUri: string;
  /** Address as JSON, for a namespaced host protocol. */
  rawAddress: string;
  scaling: boolean;
  rawMin: string;
  rawMax: string;
  min: string;
  max: string;
}

export type AddressKind = 'modbus' | 'opcua' | 'none' | 'json';

/** Which address form a protocol takes. */
export function addressKind(protocol: string | undefined): AddressKind {
  if (protocol === 'modbus-tcp' || protocol === 'modbus-rtu') return 'modbus';
  if (protocol === 'opcua') return 'opcua';
  if (!protocol || protocol === 'host') return 'none';
  return 'json';
}

export const emptyDataSource = (): DataSourceForm => ({ id: '', name: '', protocol: 'modbus-tcp', deviceId: '', endpointRef: '' });
export const emptyVariable = (): VariableForm => ({
  id: '', name: '', componentId: '', dataType: 'float32', unit: '', dataSourceId: '', variable: '',
  area: 'holding', address: '', unitId: '1', byteOrder: '', wordOrder: '', bit: '', nodeId: '', namespaceUri: '', rawAddress: '',
  scaling: false, rawMin: '', rawMax: '', min: '', max: '',
});

export function dataSourceForm(s: SceneDataSource): DataSourceForm {
  return { id: s.id, name: s.name ?? '', protocol: s.protocol, deviceId: s.deviceId ?? '', endpointRef: s.endpointRef ?? '' };
}

/** The data source a form describes; empty optional fields are left out, and any `properties` are kept. */
export function toDataSource(form: DataSourceForm, previous?: SceneDataSource): SceneDataSource {
  return {
    id: form.id.trim(),
    ...(form.name.trim() ? { name: form.name.trim() } : {}),
    protocol: form.protocol.trim(),
    ...(form.deviceId ? { deviceId: form.deviceId } : {}),
    ...(form.endpointRef.trim() ? { endpointRef: form.endpointRef.trim() } : {}),
    ...(previous?.properties ? { properties: previous.properties } : {}),
  };
}

const text = (v: unknown) => (v === undefined || v === null ? '' : String(v));

export function variableForm(v: RuntimeVariable): VariableForm {
  const a = (v.source?.address ?? {}) as Record<string, JsonValue>;
  return {
    ...emptyVariable(),
    id: v.id,
    name: v.name ?? '',
    componentId: v.componentId ?? '',
    dataType: v.dataType,
    unit: v.unit ?? '',
    dataSourceId: v.source?.dataSourceId ?? '',
    variable: v.source?.variable ?? '',
    area: text(a.area) || 'holding',
    address: text(a.address),
    unitId: text(a.unitId) || '1',
    byteOrder: text(a.byteOrder),
    wordOrder: text(a.wordOrder),
    bit: text(a.bit),
    nodeId: text(a.nodeId),
    namespaceUri: text(a.namespaceUri),
    rawAddress: v.source?.address ? JSON.stringify(v.source.address) : '',
    scaling: !!v.scaling,
    rawMin: text(v.scaling?.rawMin),
    rawMax: text(v.scaling?.rawMax),
    min: text(v.scaling?.min),
    max: text(v.scaling?.max),
  };
}

/** A typed number, or the text itself so validation names the field (an empty field is undefined). */
const num = (s: string): number | string | undefined => (s.trim() === '' ? undefined : Number.isFinite(Number(s)) ? Number(s) : s);

/**
 * The read-only variable a form describes, given its data source's protocol. The address takes the
 * protocol's form; empty optional fields are left out. A raw JSON address that does not parse is an
 * error on `rawAddress`.
 */
export function toVariable(form: VariableForm, protocol: string | undefined): { variable: RuntimeVariable } | { field: keyof VariableForm; message: string } {
  let address: Record<string, unknown> | undefined;
  const kind = addressKind(protocol);
  if (form.dataSourceId && kind === 'modbus') {
    address = { area: form.area, address: num(form.address), unitId: num(form.unitId) };
    if (form.byteOrder) address.byteOrder = form.byteOrder;
    if (form.wordOrder) address.wordOrder = form.wordOrder;
    if (form.bit.trim()) address.bit = num(form.bit);
  } else if (form.dataSourceId && kind === 'opcua' && (form.nodeId.trim() || form.namespaceUri.trim())) {
    address = { nodeId: form.nodeId.trim(), ...(form.namespaceUri.trim() ? { namespaceUri: form.namespaceUri.trim() } : {}) };
  } else if (form.dataSourceId && kind === 'json' && form.rawAddress.trim()) {
    try {
      address = JSON.parse(form.rawAddress);
    } catch {
      return { field: 'rawAddress', message: 'Expected an address as JSON, e.g. {"register": 4}.' };
    }
  }
  const variable = {
    id: form.id.trim(),
    ...(form.name.trim() ? { name: form.name.trim() } : {}),
    ...(form.componentId ? { componentId: form.componentId } : {}),
    dataType: form.dataType,
    ...(form.unit.trim() ? { unit: form.unit.trim() } : {}),
    access: 'read' as const,
    ...(form.dataSourceId ? { source: { dataSourceId: form.dataSourceId, ...(form.variable.trim() ? { variable: form.variable.trim() } : {}), ...(address ? { address } : {}) } } : {}),
    ...(form.scaling ? { scaling: { kind: 'linear', rawMin: num(form.rawMin), rawMax: num(form.rawMax), min: num(form.min), max: num(form.max) } } : {}),
  };
  return { variable: variable as RuntimeVariable };
}

/**
 * The form field an error's path points at, below `prefix` (e.g. `runtimeVariables[2]`): the last
 * path segment, so `….source.address.unitId` is `unitId`; the whole address maps to its first field.
 */
export function errorField(error: SceneValidationError, prefix: string): string | undefined {
  if (error.path !== prefix && !error.path.startsWith(`${prefix}.`)) return undefined;
  const rest = error.path.slice(prefix.length + 1);
  if (rest === '') return 'id';
  const last = rest.split('.').at(-1)!;
  if (rest === 'source.address') return 'address';
  if (rest === 'source.dataSourceId') return 'dataSourceId';
  if (rest === 'source') return 'dataSourceId';
  return last;
}

/**
 * Puts `item` at `index` of a scene list (or appends it), validates the whole scene, and returns it, or
 * the errors for that entry keyed by form field (anything else under `_`).
 */
export function commitEntry<K extends 'dataSources' | 'runtimeVariables'>(
  scene: ScadaScene,
  list: K,
  index: number | undefined,
  item: NonNullable<ScadaScene[K]>[number],
  options: SceneValidationOptions,
): { ok: true; scene: ScadaScene } | { ok: false; errors: Record<string, string> } {
  const entries = [...((scene[list] ?? []) as NonNullable<ScadaScene[K]>[number][])];
  const at = index ?? entries.length;
  entries[at] = item;
  const candidate = { ...scene, [list]: entries } as ScadaScene;
  const result = validateScene(candidate, options);
  if (result.ok) return { ok: true, scene: candidate };
  const errors: Record<string, string> = {};
  for (const e of result.errors) {
    const field = errorField(e, `${list}[${at}]`) ?? '_';
    errors[field] ??= e.message;
  }
  return { ok: false, errors };
}

/** The scene without one entry of a list; the field is left out when the list becomes empty. */
export function removeEntry(scene: ScadaScene, list: 'dataSources' | 'runtimeVariables', index: number): ScadaScene {
  const entries = (scene[list] ?? []).filter((_, i) => i !== index);
  const { [list]: _, ...rest } = scene;
  return entries.length > 0 ? ({ ...rest, [list]: entries } as ScadaScene) : (rest as ScadaScene);
}
