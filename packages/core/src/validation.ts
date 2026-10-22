import {
  componentKinds,
  portsCompatible,
  SCENE_DOCUMENT_TYPE,
  type JsonValue,
  type SceneExtensions,
  type SceneProject,
  type ComponentInstance,
  type ComponentKind,
  type ConnectionPort,
  type Quantity,
  type SceneUnderlay,
  type QuaternionLike,
  type QuaternionTuple,
  type Vector3Like,
  type ScadaScene,
  type TagBinding,
  type SceneConnection,
  type Vector3Tuple,
} from './scene.js';
import { quaternionFromEuler } from './quaternion.js';
import { isKnownUnit } from './units.js';
import { tupleToQuaternion, tupleToVector } from './vectors.js';

export type SceneValidationErrorCode =
  | 'NOT_AN_OBJECT'
  | 'UNSUPPORTED_VERSION'
  | 'INVALID_FIELD'
  | 'UNKNOWN_FIELD'
  | 'LIMIT_EXCEEDED'
  | 'UNKNOWN_COMPONENT_KIND'
  | 'DUPLICATE_COMPONENT_ID'
  | 'DUPLICATE_CONNECTION_ID'
  | 'UNKNOWN_INSTANCE'
  | 'UNKNOWN_PORT'
  | 'SELF_CONNECTION'
  | 'INCOMPATIBLE_PORTS'
  | 'PORT_OCCUPIED'
  | 'DUPLICATE_EDGE'
  | 'UNSUPPORTED_SCALE'
  | 'INVALID_JSON'
  | 'UNKNOWN_CONNECTION'
  | 'UNBINDABLE_PROPERTY'
  | 'INVALID_UNIT'
  | 'DUPLICATE_BINDING_ID'
  | 'DUPLICATE_BINDING_TARGET'
  | 'INVALID_PROPERTY'
  | 'UNKNOWN_PARENT'
  | 'PARENT_CYCLE'
  | 'INVALID_UNDERLAY'
  | 'SECRET_FIELD';

export interface SceneValidationError {
  code: SceneValidationErrorCode;
  /** Location in the input, e.g. `connections[2].to.instanceId`. */
  path: string;
  message: string;
}

export type SceneValidationResult =
  /** `migratedFrom` is set when the input was an older schema version that was upgraded. */
  | { ok: true; scene: ScadaScene; migratedFrom?: 1 | 2 | 3 }
  | { ok: false; errors: SceneValidationError[] };

export interface SceneLimits {
  maxComponents: number;
  maxConnections: number;
  maxBindings: number;
  maxIdLength: number;
  maxProperties: number;
  maxStringLength: number;
  /** UTF-8 bytes of `underlay.svg`. */
  maxUnderlayBytes: number;
}

export const defaultSceneLimits: Readonly<SceneLimits> = {
  maxComponents: 10_000,
  maxConnections: 20_000,
  maxBindings: 20_000,
  maxIdLength: 128,
  maxProperties: 64,
  maxStringLength: 1024,
  maxUnderlayBytes: 512 * 1024,
};

export interface SceneValidationOptions {
  /**
   * Declared ports for a component type. Core does not import the catalog, so the caller supplies it.
   * `properties` lets parametric types (e.g. pipe length) return per-instance ports.
   */
  resolvePorts: (type: ComponentKind, properties?: ComponentInstance['properties']) => readonly ConnectionPort[] | undefined;
  /**
   * Bindable properties and their quantities for a component type. When omitted, property bindings
   * are only checked for an existing component, and their units are not checked.
   */
  resolveBindable?: (type: ComponentKind) => Readonly<Record<string, Quantity>> | undefined;
  /**
   * Checks authored property values (e.g. pipe length range). Each problem becomes an
   * INVALID_PROPERTY error at `components[i].properties.<property>`. Optional.
   */
  validateProperties?: (type: ComponentKind, properties: ComponentInstance['properties']) => readonly { property: string; message: string }[];
  limits?: Partial<SceneLimits>;
  /**
   * Checks the content of `underlay.svg` (e.g. `sanitizeSvg` from @sakibcoolz/asset-import) and returns a
   * reason to reject it, or undefined. Core checks only structure and size. Optional.
   */
  validateUnderlay?: (svg: string) => string | undefined;
}

type Errors = SceneValidationError[];
type Json = Record<string, unknown>;

type SchemaVersion = 1 | 2 | 3 | 4;
const sceneKeys: Record<SchemaVersion, string[]> = {
  1: ['version', 'components', 'connections'],
  2: ['schemaVersion', 'units', 'components', 'connections', 'tagBindings'],
  3: ['schemaVersion', 'units', 'components', 'connections', 'tagBindings', 'underlay'],
  4: ['schemaVersion', 'documentType', 'units', 'project', 'components', 'connections', 'tagBindings', 'underlay', 'extensions'],
};
const projectKeys = ['id', 'name', 'revision', 'description'];
const underlayKeys = ['svg', 'position', 'width', 'rotation', 'opacity'];
const componentKeys: Record<SchemaVersion, string[]> = {
  1: ['id', 'kind', 'position', 'rotation', 'properties'],
  2: ['id', 'type', 'position', 'rotation', 'scale', 'properties'],
  3: ['id', 'type', 'parentId', 'position', 'rotation', 'scale', 'properties'],
  4: ['id', 'name', 'type', 'typeVersion', 'manufacturer', 'model', 'parentId', 'position', 'rotation', 'scale', 'properties', 'labels', 'extensions'],
};
/** Deepest nesting accepted inside one extension value, and most values in all extensions of a scene (ADR-0021). */
const MAX_EXTENSION_DEPTH = 16;
const MAX_EXTENSION_VALUES = 10_000;
/** Reverse-DNS namespace for extension keys, e.g. `com.example.app`. */
const NAMESPACE = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/i;
/** Keys that would reach an object's prototype if copied naively. */
const FORBIDDEN_KEYS = new Set(['__proto__', 'constructor', 'prototype']);
const SECRET_WORDS = ['password', 'passwd', 'secret', 'credential', 'apikey', 'privatekey'];
/** True for a key that names a credential: scene documents carry references to secrets, never secrets (ADR-0021). */
export function isSecretKey(key: string): boolean {
  const k = key.toLowerCase().replace(/[-_.\s]/g, '');
  return k === 'pwd' || k.endsWith('token') || SECRET_WORDS.some((w) => k.includes(w));
}
/** Accepted deviation of a rotation quaternion's length from 1; larger values are rejected, never renormalised. */
const UNIT_TOLERANCE = 1e-6;
const connectionKeys = ['id', 'from', 'to'];
const bindingKeys = {
  property: ['id', 'tagId', 'kind', 'instanceId', 'property', 'unit'],
  flow: ['id', 'tagId', 'kind', 'connectionId', 'unit'],
};
const endpointKeys = ['instanceId', 'portId'];

/** Describes any input value for an error message without throwing (JSON.stringify throws on BigInt). */
function describe(value: unknown): string {
  if (typeof value === 'string') return JSON.stringify(value.length > 64 ? `${value.slice(0, 64)}…` : value);
  if (typeof value === 'number' || typeof value === 'boolean' || value === null || value === undefined) return String(value);
  return `a ${Array.isArray(value) ? 'array' : typeof value}`;
}

function isObject(value: unknown): value is Json {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function checkKeys(value: Json, allowed: string[], path: string, errors: Errors): void {
  for (const key of Object.keys(value)) {
    if (!allowed.includes(key)) {
      errors.push({ code: 'UNKNOWN_FIELD', path: path ? `${path}.${key}` : key, message: `Unknown field "${key}".` });
    }
  }
}

function readId(value: unknown, path: string, limits: SceneLimits, errors: Errors): string | undefined {
  if (typeof value !== 'string' || value.length === 0) {
    errors.push({ code: 'INVALID_FIELD', path, message: 'Expected a non-empty string id.' });
    return undefined;
  }
  if (value.length > limits.maxIdLength) {
    errors.push({ code: 'LIMIT_EXCEEDED', path, message: `Id is longer than ${limits.maxIdLength} characters.` });
    return undefined;
  }
  return value;
}

/**
 * True for a dense array of exactly `length` finite numbers. Checks every index: `every` would
 * skip holes in sparse arrays such as `[0, , 0]`.
 */
function isFiniteTuple(value: unknown, length: number): value is number[] {
  if (!Array.isArray(value) || value.length !== length) return false;
  for (let i = 0; i < length; i++) {
    const n: unknown = value[i];
    if (typeof n !== 'number' || !Number.isFinite(n)) return false;
  }
  return true;
}

/** -0 and 0 are the same physical value, but JSON writes both as 0; normalise so accepted scenes round-trip exactly. */
const plusZero = (n: number) => (n === 0 ? 0 : n);

function readVector(value: unknown, path: string, errors: Errors): Vector3Tuple | undefined {
  if (!isFiniteTuple(value, 3)) {
    errors.push({ code: 'INVALID_FIELD', path, message: 'Expected three finite numbers.' });
    return undefined;
  }
  return [plusZero(value[0]), plusZero(value[1]), plusZero(value[2])];
}

function readQuaternion(value: unknown, path: string, errors: Errors): QuaternionTuple | undefined {
  // Written as "not within tolerance" so a NaN length can never pass.
  if (!isFiniteTuple(value, 4) || !(Math.abs(Math.hypot(...value) - 1) <= UNIT_TOLERANCE)) {
    errors.push({ code: 'INVALID_FIELD', path, message: 'Expected a unit quaternion [x, y, z, w].' });
    return undefined;
  }
  return [plusZero(value[0]), plusZero(value[1]), plusZero(value[2]), plusZero(value[3])];
}

function readScale(value: unknown, path: string, errors: Errors): Vector3Tuple | undefined {
  if (!isFiniteTuple(value, 3) || !value.every((n) => n > 0)) {
    errors.push({ code: 'INVALID_FIELD', path, message: 'Expected three positive finite numbers.' });
    return undefined;
  }
  return [value[0], value[1], value[2]];
}

/**
 * Reads a named-axis object (version 3) such as { x, y, z }. Extra keys are UNKNOWN_FIELD; a
 * missing, non-number or non-finite axis (or a non-positive one when `positive`) is INVALID_FIELD.
 */
function readAxes(value: unknown, axes: readonly string[], path: string, errors: Errors, positive = false): number[] | undefined {
  const expected = `Expected an object with finite${positive ? ' positive' : ''} ${axes.join(', ')}.`;
  if (!isObject(value)) {
    errors.push({ code: 'INVALID_FIELD', path, message: expected });
    return undefined;
  }
  const before = errors.length;
  checkKeys(value, [...axes], path, errors);
  const numbers: number[] = [];
  for (const axis of axes) {
    const n: unknown = value[axis];
    if (typeof n !== 'number' || !Number.isFinite(n) || (positive && !(n > 0))) {
      errors.push({ code: 'INVALID_FIELD', path, message: expected });
      return undefined;
    }
    numbers.push(plusZero(n));
  }
  return errors.length > before ? undefined : numbers;
}

function readVectorObject(value: unknown, path: string, errors: Errors, positive = false): Vector3Like | undefined {
  const axes = readAxes(value, ['x', 'y', 'z'], path, errors, positive);
  return axes && tupleToVector(axes);
}

function readQuaternionObject(value: unknown, path: string, errors: Errors): QuaternionLike | undefined {
  const axes = readAxes(value, ['x', 'y', 'z', 'w'], path, errors);
  if (!axes) return undefined;
  if (!(Math.abs(Math.hypot(...axes) - 1) <= UNIT_TOLERANCE)) {
    errors.push({ code: 'INVALID_FIELD', path, message: 'Expected a unit quaternion { x, y, z, w }.' });
    return undefined;
  }
  return tupleToQuaternion(axes);
}

function readProperties(
  value: unknown,
  path: string,
  limits: SceneLimits,
  errors: Errors,
): ComponentInstance['properties'] | undefined {
  if (!isObject(value)) {
    errors.push({ code: 'INVALID_FIELD', path, message: 'Expected an object of properties.' });
    return undefined;
  }
  const entries = Object.entries(value);
  if (entries.length > limits.maxProperties) {
    errors.push({ code: 'LIMIT_EXCEEDED', path, message: `More than ${limits.maxProperties} properties.` });
    return undefined;
  }
  const properties: ComponentInstance['properties'] = {};
  let valid = true;
  for (const [key, v] of entries) {
    const propertyPath = `${path}.${key}`;
    if (typeof v === 'string') {
      if (v.length > limits.maxStringLength) {
        errors.push({ code: 'LIMIT_EXCEEDED', path: propertyPath, message: `String longer than ${limits.maxStringLength} characters.` });
        valid = false;
        continue;
      }
    } else if (typeof v !== 'boolean' && !(typeof v === 'number' && Number.isFinite(v))) {
      errors.push({ code: 'INVALID_FIELD', path: propertyPath, message: 'Expected a string, boolean or finite number.' });
      valid = false;
      continue;
    }
    // defineProperty keeps keys such as "__proto__" as plain data instead of touching the prototype.
    Object.defineProperty(properties, key, { value: typeof v === 'number' ? plusZero(v) : v, enumerable: true, writable: true, configurable: true });
  }
  return valid ? properties : undefined;
}

/** A non-empty string no longer than the string limit. */
function readText(value: unknown, path: string, limits: SceneLimits, errors: Errors): string | undefined {
  if (typeof value !== 'string' || value.length === 0) {
    errors.push({ code: 'INVALID_FIELD', path, message: 'Expected a non-empty string.' });
    return undefined;
  }
  if (value.length > limits.maxStringLength) {
    errors.push({ code: 'LIMIT_EXCEEDED', path, message: `String longer than ${limits.maxStringLength} characters.` });
    return undefined;
  }
  return value;
}

/** Defines a key as plain data, so keys such as "__proto__" never touch the prototype. */
function put<T>(target: Record<string, T>, key: string, value: T): void {
  Object.defineProperty(target, key, { value, enumerable: true, writable: true, configurable: true });
}

function readProject(value: unknown, limits: SceneLimits, errors: Errors): SceneProject | undefined {
  if (!isObject(value)) {
    errors.push({ code: 'INVALID_FIELD', path: 'project', message: 'Expected a project object.' });
    return undefined;
  }
  checkKeys(value, projectKeys, 'project', errors);
  const project: SceneProject = {};
  if (value.id !== undefined) {
    const id = readId(value.id, 'project.id', limits, errors);
    if (id !== undefined) project.id = id;
  }
  for (const key of ['name', 'revision', 'description'] as const) {
    if (value[key] !== undefined) {
      const text = readText(value[key], `project.${key}`, limits, errors);
      if (text !== undefined) project[key] = text;
    }
  }
  return project;
}

/** Identification labels: string keys to string values, no credentials (ADR-0021). */
function readLabels(value: unknown, path: string, limits: SceneLimits, errors: Errors): Record<string, string> | undefined {
  if (!isObject(value)) {
    errors.push({ code: 'INVALID_FIELD', path, message: 'Expected an object of labels.' });
    return undefined;
  }
  const entries = Object.entries(value);
  if (entries.length > limits.maxProperties) {
    errors.push({ code: 'LIMIT_EXCEEDED', path, message: `More than ${limits.maxProperties} labels.` });
    return undefined;
  }
  const labels: Record<string, string> = {};
  for (const [key, v] of entries) {
    const labelPath = `${path}.${key}`;
    if (key.length === 0 || key.length > limits.maxIdLength) {
      errors.push({ code: 'INVALID_FIELD', path: labelPath, message: `Label names must be 1 to ${limits.maxIdLength} characters.` });
      continue;
    }
    if (isSecretKey(key)) {
      errors.push({ code: 'SECRET_FIELD', path: labelPath, message: `"${key}" looks like a credential; store a reference in the host instead.` });
      continue;
    }
    if (typeof v !== 'string') {
      errors.push({ code: 'INVALID_FIELD', path: labelPath, message: 'Expected a string label.' });
      continue;
    }
    if (v.length > limits.maxStringLength) {
      errors.push({ code: 'LIMIT_EXCEEDED', path: labelPath, message: `String longer than ${limits.maxStringLength} characters.` });
      continue;
    }
    put(labels, key, v);
  }
  return labels;
}

/**
 * Extensions: reverse-DNS namespaces to plain JSON, bounded in depth and size, with no prototype
 * keys and no credentials anywhere inside (ADR-0021). Returns a fresh copy.
 */
function readExtensions(value: unknown, path: string, budget: { left: number }, limits: SceneLimits, errors: Errors): SceneExtensions | undefined {
  if (!isObject(value)) {
    errors.push({ code: 'INVALID_FIELD', path, message: 'Expected an object keyed by namespace.' });
    return undefined;
  }
  const out: SceneExtensions = {};
  for (const [key, v] of Object.entries(value)) {
    if (!NAMESPACE.test(key)) {
      errors.push({ code: 'INVALID_FIELD', path: `${path}.${key}`, message: 'Extension keys must be reverse-DNS namespaces such as "com.example.app".' });
      continue;
    }
    const copy = readJson(v, `${path}.${key}`, 1, budget, limits, errors);
    if (copy !== undefined) put(out, key, copy);
  }
  return out;
}

function readJson(value: unknown, path: string, depth: number, budget: { left: number }, limits: SceneLimits, errors: Errors): JsonValue | undefined {
  if (--budget.left < 0) {
    if (budget.left === -1) errors.push({ code: 'LIMIT_EXCEEDED', path, message: `Extensions hold more than ${MAX_EXTENSION_VALUES} values.` });
    return undefined;
  }
  if (depth > MAX_EXTENSION_DEPTH) {
    errors.push({ code: 'LIMIT_EXCEEDED', path, message: `Extension values nest deeper than ${MAX_EXTENSION_DEPTH} levels.` });
    return undefined;
  }
  if (value === null || typeof value === 'boolean') return value;
  if (typeof value === 'number') {
    if (Number.isFinite(value)) return plusZero(value);
    errors.push({ code: 'INVALID_FIELD', path, message: 'Expected a finite number.' });
    return undefined;
  }
  if (typeof value === 'string') {
    if (value.length <= limits.maxStringLength) return value;
    errors.push({ code: 'LIMIT_EXCEEDED', path, message: `String longer than ${limits.maxStringLength} characters.` });
    return undefined;
  }
  if (Array.isArray(value)) {
    const out: JsonValue[] = [];
    for (let i = 0; i < value.length; i++) {
      const item = readJson(value[i], `${path}[${i}]`, depth + 1, budget, limits, errors);
      if (item === undefined) return undefined;
      out.push(item);
    }
    return out;
  }
  if (isObject(value)) {
    const out: { [key: string]: JsonValue } = {};
    for (const [key, v] of Object.entries(value)) {
      const keyPath = `${path}.${key}`;
      if (FORBIDDEN_KEYS.has(key)) {
        errors.push({ code: 'INVALID_FIELD', path: keyPath, message: `"${key}" is not allowed as a key.` });
        return undefined;
      }
      if (isSecretKey(key)) {
        errors.push({ code: 'SECRET_FIELD', path: keyPath, message: `"${key}" looks like a credential; store a reference in the host instead.` });
        return undefined;
      }
      const item = readJson(v, keyPath, depth + 1, budget, limits, errors);
      if (item === undefined) return undefined;
      put(out, key, item);
    }
    return out;
  }
  errors.push({ code: 'INVALID_FIELD', path, message: 'Expected plain JSON.' });
  return undefined;
}

/**
 * Reads one component in the input's own schema version and returns it in the current model.
 * Versions 3 and 4 use named { x, y, z } / { x, y, z, w } objects; version 4 adds identity, labels and
 * extensions. Version 2 uses arrays. Version 1 uses `kind` and Euler XYZ radians and has no scale.
 * Older versions migrate to the current model.
 */
function readComponent(
  value: unknown,
  path: string,
  version: SchemaVersion,
  limits: SceneLimits,
  errors: Errors,
  extensionBudget: { left: number },
): ComponentInstance | undefined {
  if (!isObject(value)) {
    errors.push({ code: 'INVALID_FIELD', path, message: 'Expected a component object.' });
    return undefined;
  }
  const before = errors.length;
  checkKeys(value, componentKeys[version], path, errors);
  const id = readId(value.id, `${path}.id`, limits, errors);
  const typeField = version === 1 ? 'kind' : 'type';
  const type = value[typeField];
  if (!componentKinds.includes(type as ComponentKind)) {
    errors.push({ code: 'UNKNOWN_COMPONENT_KIND', path: `${path}.${typeField}`, message: `Unknown component type ${describe(type)}.` });
  }
  let position: Vector3Like | undefined;
  let rotation: QuaternionLike | undefined;
  let scale: Vector3Like | undefined;
  const parentId = version >= 3 && value.parentId !== undefined ? readId(value.parentId, `${path}.parentId`, limits, errors) : undefined;
  if (version >= 3) {
    position = readVectorObject(value.position, `${path}.position`, errors);
    rotation = readQuaternionObject(value.rotation, `${path}.rotation`, errors);
    scale = readVectorObject(value.scale, `${path}.scale`, errors, true);
  } else {
    const p = readVector(value.position, `${path}.position`, errors);
    position = p && tupleToVector(p);
    if (version === 1) {
      const euler = readVector(value.rotation, `${path}.rotation`, errors);
      rotation = euler && tupleToQuaternion(quaternionFromEuler(euler));
      scale = { x: 1, y: 1, z: 1 };
    } else {
      const q = readQuaternion(value.rotation, `${path}.rotation`, errors);
      rotation = q && tupleToQuaternion(q);
      const sc = readScale(value.scale, `${path}.scale`, errors);
      scale = sc && tupleToVector(sc);
    }
  }
  const properties = readProperties(value.properties, `${path}.properties`, limits, errors);
  const identity: Pick<ComponentInstance, 'name' | 'typeVersion' | 'manufacturer' | 'model' | 'labels' | 'extensions'> = {};
  if (version === 4) {
    for (const key of ['name', 'typeVersion', 'manufacturer', 'model'] as const) {
      if (value[key] !== undefined) {
        const text = readText(value[key], `${path}.${key}`, limits, errors);
        if (text !== undefined) identity[key] = text;
      }
    }
    if (value.labels !== undefined) identity.labels = readLabels(value.labels, `${path}.labels`, limits, errors);
    if (value.extensions !== undefined) identity.extensions = readExtensions(value.extensions, `${path}.extensions`, extensionBudget, limits, errors);
  }
  if (errors.length > before || !id || !position || !rotation || !scale || !properties) return undefined;
  return {
    id,
    type: type as ComponentKind,
    ...(parentId ? { parentId } : {}),
    position,
    rotation,
    scale,
    properties,
    ...identity,
  };
}

function readEndpoint(value: unknown, path: string, limits: SceneLimits, errors: Errors): SceneConnection['from'] | undefined {
  if (!isObject(value)) {
    errors.push({ code: 'INVALID_FIELD', path, message: 'Expected an endpoint object.' });
    return undefined;
  }
  const before = errors.length;
  checkKeys(value, endpointKeys, path, errors);
  const instanceId = readId(value.instanceId, `${path}.instanceId`, limits, errors);
  const portId = readId(value.portId, `${path}.portId`, limits, errors);
  if (errors.length > before || !instanceId || !portId) return undefined;
  return { instanceId, portId };
}

function readConnection(value: unknown, path: string, limits: SceneLimits, errors: Errors): SceneConnection | undefined {
  if (!isObject(value)) {
    errors.push({ code: 'INVALID_FIELD', path, message: 'Expected a connection object.' });
    return undefined;
  }
  const before = errors.length;
  checkKeys(value, connectionKeys, path, errors);
  const id = readId(value.id, `${path}.id`, limits, errors);
  const from = readEndpoint(value.from, `${path}.from`, limits, errors);
  const to = readEndpoint(value.to, `${path}.to`, limits, errors);
  if (errors.length > before || !id || !from || !to) return undefined;
  return { id, from, to };
}

function readBinding(value: unknown, path: string, limits: SceneLimits, errors: Errors): TagBinding | undefined {
  if (!isObject(value)) {
    errors.push({ code: 'INVALID_FIELD', path, message: 'Expected a binding object.' });
    return undefined;
  }
  const before = errors.length;
  const kind = value.kind;
  if (kind !== 'property' && kind !== 'flow') {
    errors.push({ code: 'INVALID_FIELD', path: `${path}.kind`, message: 'Expected kind "property" or "flow".' });
    return undefined;
  }
  checkKeys(value, bindingKeys[kind], path, errors);
  const id = readId(value.id, `${path}.id`, limits, errors);
  const tagId = readId(value.tagId, `${path}.tagId`, limits, errors);
  if (value.unit !== undefined && typeof value.unit !== 'string') {
    errors.push({ code: 'INVALID_FIELD', path: `${path}.unit`, message: 'Expected a unit string.' });
  }
  const unit = typeof value.unit === 'string' ? { unit: value.unit } : {};
  if (kind === 'property') {
    const instanceId = readId(value.instanceId, `${path}.instanceId`, limits, errors);
    const property = readId(value.property, `${path}.property`, limits, errors);
    if (errors.length > before || !id || !tagId || !instanceId || !property) return undefined;
    return { id, tagId, kind, instanceId, property, ...unit };
  }
  const connectionId = readId(value.connectionId, `${path}.connectionId`, limits, errors);
  if (errors.length > before || !id || !tagId || !connectionId) return undefined;
  return { id, tagId, kind, connectionId, ...unit };
}

function checkBindings(scene: ScadaScene, options: SceneValidationOptions, errors: Errors): void {
  const components = new Map(scene.components.map((c) => [c.id, c]));
  const connections = new Set(scene.connections.map((c) => c.id));
  const ids = new Set<string>();
  const targets = new Set<string>();
  scene.tagBindings?.forEach((binding, i) => {
    const path = `tagBindings[${i}]`;
    if (ids.has(binding.id)) {
      errors.push({ code: 'DUPLICATE_BINDING_ID', path: `${path}.id`, message: `Duplicate binding id "${binding.id}".` });
      return;
    }
    ids.add(binding.id);
    let quantity: Quantity | undefined;
    let target: string;
    if (binding.kind === 'property') {
      const owner = components.get(binding.instanceId);
      if (!owner) {
        errors.push({ code: 'UNKNOWN_INSTANCE', path: `${path}.instanceId`, message: `No component "${binding.instanceId}".` });
        return;
      }
      if (options.resolveBindable) {
        quantity = options.resolveBindable(owner.type)?.[binding.property];
        if (!quantity) {
          errors.push({ code: 'UNBINDABLE_PROPERTY', path: `${path}.property`, message: `A ${owner.type} has no bindable property "${binding.property}".` });
          return;
        }
      }
      target = JSON.stringify(['property', binding.instanceId, binding.property]);
    } else {
      if (!connections.has(binding.connectionId)) {
        errors.push({ code: 'UNKNOWN_CONNECTION', path: `${path}.connectionId`, message: `No connection "${binding.connectionId}".` });
        return;
      }
      quantity = 'flow';
      target = JSON.stringify(['flow', binding.connectionId]);
    }
    if (quantity && !isKnownUnit(quantity, binding.unit)) {
      errors.push({ code: 'INVALID_UNIT', path: `${path}.unit`, message: `Unit "${binding.unit}" is not accepted for ${quantity}.` });
      return;
    }
    if (targets.has(target)) {
      errors.push({ code: 'DUPLICATE_BINDING_TARGET', path, message: 'Another binding already drives this target.' });
      return;
    }
    targets.add(target);
  });
}

function readList<T>(
  value: unknown,
  path: string,
  max: number,
  errors: Errors,
  read: (item: unknown, itemPath: string) => T | undefined,
): T[] | undefined {
  if (!Array.isArray(value)) {
    errors.push({ code: 'INVALID_FIELD', path, message: 'Expected an array.' });
    return undefined;
  }
  if (value.length > max) {
    errors.push({ code: 'LIMIT_EXCEEDED', path, message: `More than ${max} entries.` });
    return undefined;
  }
  const items: T[] = [];
  // Every index, not forEach: a hole in a sparse array (`[, x]`) is an invalid entry, as `null` is in JSON.
  for (let i = 0; i < value.length; i++) {
    const parsed = read(value[i], `${path}[${i}]`);
    if (parsed) items.push(parsed);
  }
  return items;
}

function checkReferences(scene: ScadaScene, options: SceneValidationOptions, errors: Errors): void {
  const componentsById = new Map<string, ComponentInstance>();
  scene.components.forEach((c, i) => {
    // Scaling a part with ports would change its port positions and bore away from the catalog.
    for (const problem of options.validateProperties?.(c.type, c.properties) ?? []) {
      errors.push({ code: 'INVALID_PROPERTY', path: `components[${i}].properties.${problem.property}`, message: problem.message });
    }
    const hasPorts = (options.resolvePorts(c.type, c.properties)?.length ?? 0) > 0;
    if (hasPorts && (c.scale.x !== 1 || c.scale.y !== 1 || c.scale.z !== 1)) {
      errors.push({ code: 'UNSUPPORTED_SCALE', path: `components[${i}].scale`, message: 'Components with ports must keep scale { x: 1, y: 1, z: 1 }.' });
    }
    if (c.parentId !== undefined && !scene.components.some((p) => p.id === c.parentId)) {
      errors.push({ code: 'UNKNOWN_PARENT', path: `components[${i}].parentId`, message: `No component "${c.parentId}" to be the parent.` });
    } else if (c.parentId !== undefined) {
      // Walk up the parent chain; coming back to this component means a cycle.
      const parents = new Map(scene.components.map((p) => [p.id, p.parentId]));
      let at: string | undefined = c.parentId;
      for (let steps = 0; at !== undefined && steps <= scene.components.length; steps++) {
        if (at === c.id) {
          errors.push({ code: 'PARENT_CYCLE', path: `components[${i}].parentId`, message: 'A component cannot be its own ancestor.' });
          break;
        }
        at = parents.get(at);
      }
    }
    if (componentsById.has(c.id)) {
      errors.push({ code: 'DUPLICATE_COMPONENT_ID', path: `components[${i}].id`, message: `Duplicate component id "${c.id}".` });
    } else {
      componentsById.set(c.id, c);
    }
  });

  const connectionIds = new Set<string>();
  const occupied = new Set<string>();
  const pairs = new Set<string>();
  const endpointKey = (e: SceneConnection['from']) => JSON.stringify([e.instanceId, e.portId]);

  scene.connections.forEach((connection, i) => {
    const path = `connections[${i}]`;
    if (connectionIds.has(connection.id)) {
      errors.push({ code: 'DUPLICATE_CONNECTION_ID', path: `${path}.id`, message: `Duplicate connection id "${connection.id}".` });
      return;
    }
    connectionIds.add(connection.id);

    const resolve = (side: 'from' | 'to'): ConnectionPort | undefined => {
      const endpoint = connection[side];
      const owner = componentsById.get(endpoint.instanceId);
      if (!owner) {
        errors.push({ code: 'UNKNOWN_INSTANCE', path: `${path}.${side}.instanceId`, message: `No component "${endpoint.instanceId}".` });
        return undefined;
      }
      const port = options.resolvePorts(owner.type, owner.properties)?.find((p) => p.id === endpoint.portId);
      if (!port) {
        errors.push({ code: 'UNKNOWN_PORT', path: `${path}.${side}.portId`, message: `A ${owner.type} has no port "${endpoint.portId}".` });
      }
      return port;
    };
    const fromPort = resolve('from');
    const toPort = resolve('to');
    if (!fromPort || !toPort) return;

    if (connection.from.instanceId === connection.to.instanceId) {
      errors.push({ code: 'SELF_CONNECTION', path, message: 'A component cannot connect to itself.' });
      return;
    }
    if (!portsCompatible(fromPort, toPort)) {
      errors.push({ code: 'INCOMPATIBLE_PORTS', path, message: 'Port domains or nominal sizes do not match.' });
      return;
    }
    const fromKey = endpointKey(connection.from);
    const toKey = endpointKey(connection.to);
    const pair = [fromKey, toKey].sort().join('|');
    if (pairs.has(pair)) {
      errors.push({ code: 'DUPLICATE_EDGE', path, message: 'These ports are already connected.' });
      return;
    }
    let free = true;
    for (const [side, key] of [['from', fromKey], ['to', toKey]] as const) {
      if (occupied.has(key)) {
        errors.push({ code: 'PORT_OCCUPIED', path: `${path}.${side}`, message: 'Port already has a connection.' });
        free = false;
      }
    }
    if (!free) return;
    pairs.add(pair);
    occupied.add(fromKey);
    occupied.add(toKey);
  });
}

/** Reads the optional reference drawing (ADR-0012); sanitizing is the host's `validateUnderlay`. */
function readUnderlay(value: unknown, limits: SceneLimits, options: SceneValidationOptions, errors: Errors): SceneUnderlay | undefined {
  if (!isObject(value)) {
    errors.push({ code: 'INVALID_FIELD', path: 'underlay', message: 'Expected an underlay object.' });
    return undefined;
  }
  checkKeys(value, underlayKeys, 'underlay', errors);
  const before = errors.length;
  const finite = (v: unknown, path: string, ok: (n: number) => boolean, rule: string): number => {
    if (typeof v !== 'number' || !Number.isFinite(v) || !ok(v)) errors.push({ code: 'INVALID_FIELD', path, message: `Expected ${rule}.` });
    return v as number;
  };
  let svg = '';
  if (typeof value.svg !== 'string') errors.push({ code: 'INVALID_FIELD', path: 'underlay.svg', message: 'Expected SVG markup as a string.' });
  else if (new TextEncoder().encode(value.svg).length > limits.maxUnderlayBytes) errors.push({ code: 'LIMIT_EXCEEDED', path: 'underlay.svg', message: `Underlay larger than ${limits.maxUnderlayBytes} bytes.` });
  else svg = value.svg;
  const position = isObject(value.position) ? value.position : undefined;
  if (!position) errors.push({ code: 'INVALID_FIELD', path: 'underlay.position', message: 'Expected { x, z } in metres.' });
  else checkKeys(position, ['x', 'z'], 'underlay.position', errors);
  const x = position ? finite(position.x, 'underlay.position.x', () => true, 'a finite number of metres') : 0;
  const z = position ? finite(position.z, 'underlay.position.z', () => true, 'a finite number of metres') : 0;
  const width = finite(value.width, 'underlay.width', (n) => n > 0 && n <= 1000, 'a width in metres above 0 and at most 1000');
  const rotation = finite(value.rotation, 'underlay.rotation', () => true, 'a finite angle in degrees');
  const opacity = finite(value.opacity, 'underlay.opacity', (n) => n >= 0 && n <= 1, 'an opacity from 0 to 1');
  if (errors.length > before) return undefined;
  const reason = options.validateUnderlay?.(svg);
  if (reason !== undefined) {
    errors.push({ code: 'INVALID_UNDERLAY', path: 'underlay.svg', message: reason });
    return undefined;
  }
  return { svg, position: { x, z }, width, rotation, opacity };
}

/**
 * Validates an untrusted value as a scene and returns it in the current (version 4) model.
 * Version 1 (`version: 1`), version 2 (array vectors) and version 3 input is migrated
 * deterministically and reported via `migratedFrom` (ADR-0021).
 * Never mutates or repairs the input: on success it returns a fresh copy, otherwise every error
 * found, in input order, with paths in the input's own field names. Reference checks (ids, ports,
 * compatibility, occupancy, scale policy) run only once the structure is valid. Each port accepts
 * one connection.
 */
export function validateScene(input: unknown, options: SceneValidationOptions): SceneValidationResult {
  const limits: SceneLimits = { ...defaultSceneLimits, ...options.limits };
  const errors: Errors = [];
  if (!isObject(input)) {
    return { ok: false, errors: [{ code: 'NOT_AN_OBJECT', path: '', message: 'Expected a scene object.' }] };
  }
  let version: SchemaVersion;
  if ('schemaVersion' in input) {
    // Unsupported numbers are reported and read with the newest rules.
    version = input.schemaVersion === 2 || input.schemaVersion === 3 ? input.schemaVersion : 4;
    if (input.schemaVersion !== 2 && input.schemaVersion !== 3 && input.schemaVersion !== 4) {
      errors.push({ code: 'UNSUPPORTED_VERSION', path: 'schemaVersion', message: `Unsupported schemaVersion ${describe(input.schemaVersion)}.` });
    }
    if (input.schemaVersion === 4 && input.documentType !== SCENE_DOCUMENT_TYPE) {
      errors.push({ code: 'INVALID_FIELD', path: 'documentType', message: `Expected documentType "${SCENE_DOCUMENT_TYPE}".` });
    }
    if (input.units !== 'm') {
      errors.push({ code: 'INVALID_FIELD', path: 'units', message: 'Expected units "m".' });
    }
  } else {
    version = 1;
    if (input.version !== 1) {
      errors.push({ code: 'UNSUPPORTED_VERSION', path: 'version', message: `Unsupported scene version ${describe(input.version)}.` });
    }
  }
  checkKeys(input, sceneKeys[version], '', errors);
  const extensionBudget = { left: MAX_EXTENSION_VALUES };
  const project = version === 4 && input.project !== undefined ? readProject(input.project, limits, errors) : undefined;
  const components = readList(input.components, 'components', limits.maxComponents, errors, (item, path) =>
    readComponent(item, path, version, limits, errors, extensionBudget),
  );
  const connections = readList(input.connections, 'connections', limits.maxConnections, errors, (item, path) =>
    readConnection(item, path, limits, errors),
  );
  const tagBindings =
    version !== 1 && input.tagBindings !== undefined
      ? readList(input.tagBindings, 'tagBindings', limits.maxBindings, errors, (item, path) => readBinding(item, path, limits, errors))
      : undefined;
  const underlay = version >= 3 && input.underlay !== undefined ? readUnderlay(input.underlay, limits, options, errors) : undefined;
  const extensions = version === 4 && input.extensions !== undefined ? readExtensions(input.extensions, 'extensions', extensionBudget, limits, errors) : undefined;
  if (errors.length > 0 || !components || !connections) return { ok: false, errors };

  const scene: ScadaScene = {
    schemaVersion: 4,
    documentType: SCENE_DOCUMENT_TYPE,
    units: 'm',
    ...(project ? { project } : {}),
    components,
    connections,
    ...(tagBindings ? { tagBindings } : {}),
    ...(underlay ? { underlay } : {}),
    ...(extensions ? { extensions } : {}),
  };
  checkReferences(scene, options, errors);
  checkBindings(scene, options, errors);
  if (errors.length > 0) return { ok: false, errors };
  return version === 4 ? { ok: true, scene } : { ok: true, scene, migratedFrom: version };
}
