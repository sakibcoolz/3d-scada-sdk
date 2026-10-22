import { isBuiltInKind, isNamespacedType, portKinds, powerKinds, signalTypes, type ComponentInstance, type ConnectionPort, type ComponentType, type Quantity, type Vector3Tuple } from '@sakibcoolz/core';
import { componentCatalog } from './catalog.js';
import { isChoiceParameter, type IndustrialComponentDefinition } from './geometry.js';
import { catalogResolvers, checkParameters, definitionFor as builtInDefinitionFor, sizeParameterFor as builtInSizeParameterFor, validateProperties as builtInValidateProperties } from './parameters.js';

type Properties = ComponentInstance['properties'];
type Values = Record<string, string | number>;
type Problems = { property: string; message: string }[];

/**
 * A host- or library-defined component type (ADR-0022): the same building blocks as the built-in
 * catalog (primitive parts, ports, bounds, parameters, bindable properties), under a namespaced id.
 */
export interface ComponentTypeDefinition extends Omit<IndustrialComponentDefinition, 'defaultSize'> {
  /** Namespaced id, e.g. `com.acme.press-200`. Bare names are reserved for the built-in kinds. */
  type: string;
  /** Definition version; instances record the version they were authored against in `typeVersion`. */
  version?: string;
  /** Free grouping for palettes, e.g. `vessel`, `electrical`, `control`. */
  category?: string;
  /** Computed from `bounds` when absent. */
  defaultSize?: Vector3Tuple;
  /**
   * Parametric shape: given every parameter's value (defaults filled in), returns the ports, parts
   * and bounds that differ from the base definition. Only called with valid values.
   */
  build?: (values: Values) => Partial<Pick<IndustrialComponentDefinition, 'ports' | 'parts' | 'bounds'>>;
}

/** Lookups a viewer, editor or core function needs, for built-in and registered types alike. */
export interface ComponentRegistry {
  has(type: ComponentType): boolean;
  /** The base definition (default parameters), or undefined for an unknown type. */
  get(type: ComponentType): IndustrialComponentDefinition | undefined;
  /** Every type, built-ins first, in registration order. */
  list(): readonly IndustrialComponentDefinition[];
  /**
   * The definition for given properties (parametric shape). An unknown type gets a labelled,
   * port-less placeholder box (`unknownTypeDefinition`), so renderers never break; validation still
   * rejects unknown types, so only hosts that bypass it ever see one.
   */
  definitionFor(type: ComponentType, properties?: Properties): IndustrialComponentDefinition;
  validateProperties(type: ComponentType, properties: Properties): Problems;
  /** The choice parameter that sets one port's size, if any. */
  sizeParameterFor(type: ComponentType, portId: string): string | undefined;
  /** Ready to pass to core: `validateScene`, `parseScene`, `connect`, `routeScene`, `findCollisions`, … */
  readonly resolvers: typeof catalogResolvers;
}

/** A labelled, port-less 0.5 m box standing on the floor, for a type with no definition (ADR-0022). */
export function unknownTypeDefinition(type: ComponentType): IndustrialComponentDefinition {
  let d = placeholders.get(type);
  if (!d) {
    const definition: IndustrialComponentDefinition = {
      type,
      label: String(type),
      ports: [],
      bounds: { min: [-0.25, -0.25, -0.25], max: [0.25, 0.25, 0.25] },
      defaultSize: [0.5, 0.5, 0.5],
      parts: [{ shape: 'box', role: 'shell', center: [0, 0, 0], size: [0.5, 0.5, 0.5], text: String(type) }],
    };
    d = Object.freeze(definition);
    placeholders.set(type, d);
  }
  return d;
}
const placeholders = new Map<string, IndustrialComponentDefinition>();

const sizeOf = (b: IndustrialComponentDefinition['bounds']): Vector3Tuple => [b.max[0] - b.min[0], b.max[1] - b.min[1], b.max[2] - b.min[2]];
const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const isTuple = (v: unknown): v is Vector3Tuple => Array.isArray(v) && v.length === 3 && v.every(finite);
const isText = (v: unknown): v is string => typeof v === 'string' && v.length > 0;

/** Problems with a port's domain metadata (ADR-0023). */
function portMetadataProblems(port: ConnectionPort, label: string): string[] {
  const problems: string[] = [];
  const blocks = { signal: port.signal, power: port.power, network: port.network } as const;
  for (const [domain, block] of Object.entries(blocks)) {
    if (block !== undefined && port.kind !== domain) problems.push(`${label} has ${domain} details but is a ${port.kind} port`);
  }
  if (port.name !== undefined && !isText(port.name)) problems.push(`${label} needs a non-empty name`);
  if (port.terminal !== undefined && !isText(port.terminal)) problems.push(`${label} needs a non-empty terminal`);
  if (port.flow !== undefined && !['in', 'out', 'bidirectional'].includes(port.flow)) problems.push(`${label} has an unknown flow`);
  if (port.signal !== undefined) {
    const { type, range, unit } = port.signal;
    if (!(signalTypes as readonly string[]).includes(type)) problems.push(`${label} has an unknown signal type`);
    if (range !== undefined && !(Array.isArray(range) && range.length === 2 && range.every(finite) && range[0] < range[1])) problems.push(`${label} needs a signal range with min < max`);
    if (unit !== undefined && !isText(unit)) problems.push(`${label} needs a non-empty signal unit`);
  }
  if (port.power !== undefined) {
    const { kind, voltage, phases } = port.power;
    if (!(powerKinds as readonly string[]).includes(kind)) problems.push(`${label} has an unknown power kind`);
    if (voltage !== undefined && !(finite(voltage) && voltage > 0)) problems.push(`${label} needs a positive voltage`);
    if (phases !== undefined && phases !== 1 && phases !== 3) problems.push(`${label} needs 1 or 3 phases`);
  }
  if (port.network !== undefined) {
    const { medium, protocols } = port.network;
    if (!isText(medium)) problems.push(`${label} needs a network medium`);
    if (protocols !== undefined && !(Array.isArray(protocols) && protocols.every(isText))) problems.push(`${label} needs protocols as non-empty strings`);
  }
  if (port.maxConnections !== undefined) {
    if (!(Number.isInteger(port.maxConnections) && port.maxConnections >= 1)) problems.push(`${label} needs maxConnections as a whole number of at least 1`);
    else if (port.kind === 'fluid' && port.maxConnections !== 1) problems.push(`${label} is a fluid port, which takes exactly one connection`);
  }
  return problems;
}

/** Everything wrong with one definition, as readable sentences; empty when it can be registered. */
function definitionProblems(d: ComponentTypeDefinition): string[] {
  const problems: string[] = [];
  const name = typeof d?.type === 'string' ? `"${d.type}"` : 'a definition';
  if (!d || typeof d !== 'object') return ['a definition must be an object'];
  if (isBuiltInKind(d.type)) problems.push(`${name} is a built-in kind`);
  else if (!isNamespacedType(d.type)) problems.push(`${name} must be namespaced, such as "com.example.part"`);
  if (typeof d.label !== 'string' || d.label.length === 0) problems.push(`${name} needs a label`);
  if (!d.bounds || !isTuple(d.bounds.min) || !isTuple(d.bounds.max) || d.bounds.min.some((v, i) => v > d.bounds.max[i])) problems.push(`${name} needs finite bounds with min ≤ max`);
  if (!Array.isArray(d.parts)) problems.push(`${name} needs a parts array`);
  if (!Array.isArray(d.ports)) problems.push(`${name} needs a ports array`);
  else {
    const ids = new Set<string>();
    for (const port of d.ports) {
      if (typeof port?.id !== 'string' || port.id.length === 0) { problems.push(`${name} has a port without an id`); continue; }
      if (ids.has(port.id)) problems.push(`${name} has two ports "${port.id}"`);
      ids.add(port.id);
      if (!(portKinds as readonly string[]).includes(port.kind)) problems.push(`${name} port "${port.id}" has an unknown kind`);
      else problems.push(...portMetadataProblems(port, `${name} port "${port.id}"`));
      if (!isTuple(port.position)) problems.push(`${name} port "${port.id}" needs a finite position`);
      if (!isTuple(port.direction) || Math.abs(Math.hypot(...port.direction) - 1) > 1e-6) problems.push(`${name} port "${port.id}" needs a unit direction`);
      if (port.nominalSize !== undefined && !(finite(port.nominalSize) && port.nominalSize > 0)) problems.push(`${name} port "${port.id}" needs a positive nominal size`);
    }
  }
  for (const [param, spec] of Object.entries(d.parameters ?? {})) {
    const ok = isChoiceParameter(spec) ? spec.choices.includes(spec.default) : finite(spec.default) && spec.default >= spec.min && spec.default <= spec.max;
    if (!ok) problems.push(`${name} parameter "${param}" has a default outside its range or choices`);
  }
  return problems;
}

/**
 * A registry of the built-in kinds plus the given host or library types (ADR-0022). Throws with every
 * problem listed when a definition is invalid, duplicated or not namespaced. Definitions are copied
 * and frozen, so later changes to the inputs do not leak in.
 */
export function createComponentRegistry(...definitions: ComponentTypeDefinition[]): ComponentRegistry {
  const problems = definitions.flatMap(definitionProblems);
  const seen = new Set<string>();
  for (const d of definitions) {
    if (typeof d?.type === 'string' && seen.has(d.type)) problems.push(`"${d.type}" is registered twice`);
    if (typeof d?.type === 'string') seen.add(d.type);
  }
  if (problems.length > 0) throw new Error(`Cannot register component types: ${problems.join('; ')}.`);

  const custom = new Map<string, { base: IndustrialComponentDefinition; build?: ComponentTypeDefinition['build'] }>();
  for (const d of definitions) {
    const { build, ...rest } = d;
    const base = Object.freeze({ ...rest, defaultSize: rest.defaultSize ?? sizeOf(rest.bounds) }) as IndustrialComponentDefinition;
    custom.set(d.type, { base, build });
  }
  const cache = new Map<string, IndustrialComponentDefinition>();

  const validate = (type: ComponentType, properties: Properties): Problems => {
    if (isBuiltInKind(type)) return builtInValidateProperties(type, properties);
    const entry = custom.get(type);
    return entry ? checkParameters(entry.base.parameters ?? {}, properties) : [];
  };
  const definitionFor = (type: ComponentType, properties: Properties = {}): IndustrialComponentDefinition => {
    if (isBuiltInKind(type)) return builtInDefinitionFor(type, properties);
    const entry = custom.get(type);
    if (!entry) return unknownTypeDefinition(type);
    const parameters = entry.base.parameters ?? {};
    if (!entry.build || checkParameters(parameters, properties).length > 0) return entry.base;
    const values: Values = Object.fromEntries(Object.entries(parameters).map(([n, spec]) => [n, Object.hasOwn(properties, n) ? (properties[n] as string | number) : spec.default]));
    if (Object.entries(parameters).every(([n, spec]) => values[n] === spec.default)) return entry.base;
    const key = `${type}:${JSON.stringify(Object.keys(parameters).map((n) => values[n]))}`;
    let built = cache.get(key);
    if (!built) {
      built = Object.freeze({ ...entry.base, ...entry.build(values) }) as IndustrialComponentDefinition;
      cache.set(key, built);
    }
    return built;
  };
  const has = (type: ComponentType) => isBuiltInKind(type) || custom.has(type);
  const resolvers: typeof catalogResolvers = {
    ...catalogResolvers,
    resolveType: has,
    resolvePorts: (type, properties) => (has(type) ? definitionFor(type, properties).ports : undefined),
    resolveBounds: (type, properties) => (has(type) ? definitionFor(type, properties).bounds : undefined),
    resolveBindable: (type): Readonly<Record<string, Quantity>> | undefined => (isBuiltInKind(type) ? componentCatalog[type].bindable : custom.get(type)?.base.bindable),
    validateProperties: validate,
  };
  return {
    has,
    get: (type) => (isBuiltInKind(type) ? componentCatalog[type] : custom.get(type)?.base),
    list: () => [...Object.values(componentCatalog), ...[...custom.values()].map((e) => e.base)],
    definitionFor,
    validateProperties: validate,
    sizeParameterFor: (type, portId) => {
      if (isBuiltInKind(type)) return builtInSizeParameterFor(type, portId);
      return custom.get(type)?.base.parameters?.size ? 'size' : undefined;
    },
    resolvers,
  };
}

/** The 14 built-in kinds only; its `resolvers` behave exactly as `catalogResolvers`. */
export const builtInRegistry: ComponentRegistry = createComponentRegistry();
