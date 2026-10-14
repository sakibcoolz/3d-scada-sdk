import {
  componentKinds,
  portsCompatible,
  type ComponentInstance,
  type ComponentKind,
  type ConnectionPort,
  type ScadaScene,
  type SceneConnection,
  type Vector3Tuple,
} from './scene';

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
  | 'DUPLICATE_EDGE';

export interface SceneValidationError {
  code: SceneValidationErrorCode;
  /** Location in the input, e.g. `connections[2].to.instanceId`. */
  path: string;
  message: string;
}

export type SceneValidationResult =
  | { ok: true; scene: ScadaScene }
  | { ok: false; errors: SceneValidationError[] };

export interface SceneLimits {
  maxComponents: number;
  maxConnections: number;
  maxIdLength: number;
  maxProperties: number;
  maxStringLength: number;
}

export const defaultSceneLimits: Readonly<SceneLimits> = {
  maxComponents: 10_000,
  maxConnections: 20_000,
  maxIdLength: 128,
  maxProperties: 64,
  maxStringLength: 1024,
};

export interface SceneValidationOptions {
  /** Declared ports for a component kind. Core does not import the catalog, so the caller supplies it. */
  resolvePorts: (kind: ComponentKind) => readonly ConnectionPort[] | undefined;
  limits?: Partial<SceneLimits>;
}

type Errors = SceneValidationError[];
type Json = Record<string, unknown>;

const sceneKeys = ['version', 'components', 'connections'];
const componentKeys = ['id', 'kind', 'position', 'rotation', 'properties'];
const connectionKeys = ['id', 'from', 'to'];
const endpointKeys = ['instanceId', 'portId'];

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

function readVector(value: unknown, path: string, errors: Errors): Vector3Tuple | undefined {
  if (!Array.isArray(value) || value.length !== 3 || !value.every((n) => typeof n === 'number' && Number.isFinite(n))) {
    errors.push({ code: 'INVALID_FIELD', path, message: 'Expected three finite numbers.' });
    return undefined;
  }
  return [value[0], value[1], value[2]];
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
    Object.defineProperty(properties, key, { value: v, enumerable: true, writable: true, configurable: true });
  }
  return valid ? properties : undefined;
}

function readComponent(value: unknown, path: string, limits: SceneLimits, errors: Errors): ComponentInstance | undefined {
  if (!isObject(value)) {
    errors.push({ code: 'INVALID_FIELD', path, message: 'Expected a component object.' });
    return undefined;
  }
  const before = errors.length;
  checkKeys(value, componentKeys, path, errors);
  const id = readId(value.id, `${path}.id`, limits, errors);
  const kind = value.kind;
  if (!componentKinds.includes(kind as ComponentKind)) {
    errors.push({ code: 'UNKNOWN_COMPONENT_KIND', path: `${path}.kind`, message: `Unknown component kind ${JSON.stringify(kind)}.` });
  }
  const position = readVector(value.position, `${path}.position`, errors);
  const rotation = readVector(value.rotation, `${path}.rotation`, errors);
  const properties = readProperties(value.properties, `${path}.properties`, limits, errors);
  if (errors.length > before || !id || !position || !rotation || !properties) return undefined;
  return { id, kind: kind as ComponentKind, position, rotation, properties };
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
      const port = options.resolvePorts(owner.kind)?.find((p) => p.id === endpoint.portId);
      if (!port) {
        errors.push({ code: 'UNKNOWN_PORT', path: `${path}.${side}.portId`, message: `A ${owner.kind} has no port "${endpoint.portId}".` });
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
 * Validates an untrusted value as a version 1 scene. Never mutates or repairs the input:
 * on success it returns a fresh copy, otherwise every error found, in input order.
 * Reference checks (ids, ports, compatibility, occupancy) run only once the structure is valid.
 * Each port accepts one connection.
 */
export function validateScene(input: unknown, options: SceneValidationOptions): SceneValidationResult {
  const limits: SceneLimits = { ...defaultSceneLimits, ...options.limits };
  const errors: Errors = [];
  if (!isObject(input)) {
    return { ok: false, errors: [{ code: 'NOT_AN_OBJECT', path: '', message: 'Expected a scene object.' }] };
  }
  checkKeys(input, sceneKeys, '', errors);
  if (input.version !== 1) {
    errors.push({ code: 'UNSUPPORTED_VERSION', path: 'version', message: `Unsupported scene version ${JSON.stringify(input.version)}.` });
  }
  const components = readList(input.components, 'components', limits.maxComponents, errors, (item, path) =>
    readComponent(item, path, limits, errors),
  );
  const connections = readList(input.connections, 'connections', limits.maxConnections, errors, (item, path) =>
    readConnection(item, path, limits, errors),
  );
  if (errors.length > 0 || !components || !connections) return { ok: false, errors };

  const scene: ScadaScene = { version: 1, components, connections };
  checkReferences(scene, options, errors);
  return errors.length > 0 ? { ok: false, errors } : { ok: true, scene };
}
