import type { ComponentInstance, ComponentKind, Quantity } from '@scada3d/core';
import { componentCatalog, pipeDefinition } from './catalog';
import type { IndustrialComponentDefinition } from './geometry';

type Properties = ComponentInstance['properties'];

/** Problems with shape parameters, e.g. `[{ property: 'length', message: 'must be between 0.2 and 20 m' }]`. */
export function validateProperties(type: ComponentKind, properties: Properties): { property: string; message: string }[] {
  const parameters = componentCatalog[type].parameters ?? {};
  const problems: { property: string; message: string }[] = [];
  for (const [name, spec] of Object.entries(parameters)) {
    if (!(name in properties)) continue; // absent means the default
    const value = properties[name];
    if (typeof value !== 'number' || !Number.isFinite(value)) problems.push({ property: name, message: `must be a number of ${spec.unit}` });
    else if (value < spec.min || value > spec.max) problems.push({ property: name, message: `must be between ${spec.min} and ${spec.max} ${spec.unit}` });
  }
  return problems;
}

const pipes = new Map<number, IndustrialComponentDefinition>();

/**
 * The definition for one component, taking its shape parameters into account. Missing or invalid
 * values use the default shape (validation reports invalid ones). Results are cached per value so
 * renderers can rely on object identity.
 */
export function definitionFor(type: ComponentKind, properties: Properties = {}): IndustrialComponentDefinition {
  const base = componentCatalog[type];
  if (type !== 'pipe' || validateProperties(type, properties).length > 0 || typeof properties.length !== 'number') return base;
  const length = properties.length;
  if (length === base.parameters!.length.default) return base;
  let definition = pipes.get(length);
  if (!definition) {
    definition = pipeDefinition(length);
    pipes.set(length, definition);
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
