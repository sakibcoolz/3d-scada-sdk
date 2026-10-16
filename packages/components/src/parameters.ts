import type { ComponentInstance, ComponentKind, Quantity } from '@scada3d/core';
import { componentCatalog, couplerDefinition, elbowDefinition, pipeDefinition, reducerDefinition, tankDefinition, teeDefinition, valveDefinition } from './catalog.js';
import { isChoiceParameter, type IndustrialComponentDefinition } from './geometry.js';
import type { PipeSize } from './sizes.js';

type Properties = ComponentInstance['properties'];

/** Problems with shape parameters, e.g. `[{ property: 'length', message: 'must be between 0.2 and 20 m' }]`. */
export function validateProperties(type: ComponentKind, properties: Properties): { property: string; message: string }[] {
  const parameters = componentCatalog[type].parameters ?? {};
  const problems: { property: string; message: string }[] = [];
  for (const [name, spec] of Object.entries(parameters)) {
    if (!Object.hasOwn(properties, name)) continue; // absent means the default
    const value = properties[name];
    if (isChoiceParameter(spec)) {
      if (typeof value !== 'string' || !spec.choices.includes(value)) problems.push({ property: name, message: `must be one of ${spec.choices.join(', ')}` });
    } else if (typeof value !== 'number' || !Number.isFinite(value)) problems.push({ property: name, message: `must be a number of ${spec.unit}` });
    else if (value < spec.min || value > spec.max) problems.push({ property: name, message: `must be between ${spec.min} and ${spec.max} ${spec.unit}` });
  }
  if (type === 'reducer' && problems.length === 0) {
    const { size, outletSize } = effective(type, properties);
    if (size === outletSize) problems.push({ property: 'outletSize', message: 'must differ from size' });
  }
  return problems;
}

/** Every parameter's value, falling back to its default. */
function effective(type: ComponentKind, properties: Properties): Record<string, string | number> {
  const parameters = componentCatalog[type].parameters ?? {};
  return Object.fromEntries(Object.entries(parameters).map(([name, spec]) => [name, Object.hasOwn(properties, name) ? (properties[name] as string | number) : spec.default]));
}

type Values = Record<string, string | number>;
const builders: Partial<Record<ComponentKind, (v: Values) => IndustrialComponentDefinition>> = {
  tank: (v) => tankDefinition(v.standHeight as number),
  pipe: (v) => pipeDefinition(v.length as number, v.size as PipeSize),
  elbow: (v) => elbowDefinition(v.size as PipeSize),
  tee: (v) => teeDefinition(v.size as PipeSize),
  valve: (v) => valveDefinition(v.size as PipeSize),
  reducer: (v) => reducerDefinition(v.size as PipeSize, v.outletSize as PipeSize),
  coupler: (v) => couplerDefinition(v.size as PipeSize, v.length as number),
};

const cache = new Map<string, IndustrialComponentDefinition>();

/**
 * The definition for one component, taking its shape parameters (size, length) into account.
 * Missing values use the defaults; invalid ones fall back to the default shape (validation reports
 * them). Results are cached per value so renderers can rely on object identity.
 */
export function definitionFor(type: ComponentKind, properties: Properties = {}): IndustrialComponentDefinition {
  const base = componentCatalog[type];
  const build = builders[type];
  if (!build || validateProperties(type, properties).length > 0) return base;
  const parameters = base.parameters ?? {};
  const values = effective(type, properties);
  if (Object.entries(parameters).every(([name, spec]) => values[name] === spec.default)) return base;
  const key = `${type}:${JSON.stringify(Object.keys(parameters).map((name) => values[name]))}`;
  let definition = cache.get(key);
  if (!definition) {
    definition = build(values);
    cache.set(key, definition);
  }
  return definition;
}

/**
 * Catalog lookups ready to pass to core (`validateScene`, `parseScene`, `connect`, `snapComponent`,
 * `routeScene`, `findCollisions`, `resolveTelemetry`).
 */
export const catalogResolvers = {
  resolvePorts: (type: ComponentKind, properties?: Properties) => definitionFor(type, properties).ports,
  resolveBounds: (type: ComponentKind, properties?: Properties) => definitionFor(type, properties).bounds,
  resolveBindable: (type: ComponentKind): Readonly<Record<string, Quantity>> | undefined => componentCatalog[type].bindable,
  validateProperties,
};
