import {
  componentKinds,
  portsCompatible,
  type ComponentInstance,
  type ComponentKind,
  type ConnectionPort,
  type Quantity,
  type QuaternionLike,
  type QuaternionTuple,
  type Vector3Like,
  type ScadaScene,
  type TagBinding,
  type SceneConnection,
  type Vector3Tuple,
} from './scene';
import { quaternionFromEuler } from './quaternion';
import { isKnownUnit } from './units';
import { tupleToQuaternion, tupleToVector } from './vectors';

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
  | 'DUPLICATE_BINDING_TARGET';

export interface SceneValidationError {
  code: SceneValidationErrorCode;
  /** Location in the input, e.g. `connections[2].to.instanceId`. */
  path: string;
  message: string;
}

export type SceneValidationResult =
  /** `migratedFrom` is set when the input was an older schema version that was upgraded. */
  | { ok: true; scene: ScadaScene; migratedFrom?: 1 | 2 }
  | { ok: false; errors: SceneValidationError[] };

export interface SceneLimits {
  maxComponents: number;
  maxConnections: number;
  maxBindings: number;
  maxIdLength: number;
  maxProperties: number;
  maxStringLength: number;
}

export const defaultSceneLimits: Readonly<SceneLimits> = {
  maxComponents: 10_000,
  maxConnections: 20_000,
  maxBindings: 20_000,
  maxIdLength: 128,
  maxProperties: 64,
  maxStringLength: 1024,
};

export interface SceneValidationOptions {
  /** Declared ports for a component type. Core does not import the catalog, so the caller supplies it. */
  resolvePorts: (type: ComponentKind) => readonly ConnectionPort[] | undefined;
  /**
   * Bindable properties and their quantities for a component type. When omitted, property bindings
   * are only checked for an existing component, and their units are not checked.
   */
  resolveBindable?: (type: ComponentKind) => Readonly<Record<string, Quantity>> | undefined;
  limits?: Partial<SceneLimits>;
}

type Errors = SceneValidationError[];
type Json = Record<string, unknown>;

type SchemaVersion = 1 | 2 | 3;
const sceneKeys: Record<SchemaVersion, string[]> = {
  1: ['version', 'components', 'connections'],
  2: ['schemaVersion', 'units', 'components', 'connections', 'tagBindings'],
  3: ['schemaVersion', 'units', 'components', 'connections', 'tagBindings'],
};
const componentKeys: Record<SchemaVersion, string[]> = {
  1: ['id', 'kind', 'position', 'rotation', 'properties'],
  2: ['id', 'type', 'position', 'rotation', 'scale', 'properties'],
  3: ['id', 'type', 'position', 'rotation', 'scale', 'properties'],
};
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

/**
 * Reads one component in the input's own schema version and returns it in the current model.
 * Version 3 uses named { x, y, z } / { x, y, z, w } objects. Version 2 uses arrays. Version 1 uses
 * `kind` and Euler XYZ radians and has no scale. Older versions migrate to the version 3 objects.
 */
function readComponent(
  value: unknown,
  path: string,
  version: SchemaVersion,
  limits: SceneLimits,
  errors: Errors,
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
  if (version === 3) {
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
  if (errors.length > before || !id || !position || !rotation || !scale || !properties) return undefined;
  return { id, type: type as ComponentKind, position, rotation, scale, properties };
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
  value.forEach((item, i) => {
    const parsed = read(item, `${path}[${i}]`);
    if (parsed) items.push(parsed);
  });
  return items;
}

function checkReferences(scene: ScadaScene, options: SceneValidationOptions, errors: Errors): void {
  const componentsById = new Map<string, ComponentInstance>();
  scene.components.forEach((c, i) => {
    // Scaling a part with ports would change its port positions and bore away from the catalog.
    const hasPorts = (options.resolvePorts(c.type)?.length ?? 0) > 0;
    if (hasPorts && (c.scale.x !== 1 || c.scale.y !== 1 || c.scale.z !== 1)) {
      errors.push({ code: 'UNSUPPORTED_SCALE', path: `components[${i}].scale`, message: 'Components with ports must keep scale { x: 1, y: 1, z: 1 }.' });
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
      const port = options.resolvePorts(owner.type)?.find((p) => p.id === endpoint.portId);
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

/**
 * Validates an untrusted value as a scene and returns it in the current (version 3) model.
 * Version 1 (`version: 1`) and version 2 (array vectors) input is migrated deterministically and
 * reported via `migratedFrom`.
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
    version = input.schemaVersion === 2 ? 2 : 3;
    if (input.schemaVersion !== 2 && input.schemaVersion !== 3) {
      errors.push({ code: 'UNSUPPORTED_VERSION', path: 'schemaVersion', message: `Unsupported schemaVersion ${describe(input.schemaVersion)}.` });
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
  const components = readList(input.components, 'components', limits.maxComponents, errors, (item, path) =>
    readComponent(item, path, version, limits, errors),
  );
  const connections = readList(input.connections, 'connections', limits.maxConnections, errors, (item, path) =>
    readConnection(item, path, limits, errors),
  );
  const tagBindings =
    version !== 1 && input.tagBindings !== undefined
      ? readList(input.tagBindings, 'tagBindings', limits.maxBindings, errors, (item, path) => readBinding(item, path, limits, errors))
      : undefined;
  if (errors.length > 0 || !components || !connections) return { ok: false, errors };

  const scene: ScadaScene = { schemaVersion: 3, units: 'm', components, connections, ...(tagBindings ? { tagBindings } : {}) };
  checkReferences(scene, options, errors);
  checkBindings(scene, options, errors);
  if (errors.length > 0) return { ok: false, errors };
  return version === 3 ? { ok: true, scene } : { ok: true, scene, migratedFrom: version };
}
