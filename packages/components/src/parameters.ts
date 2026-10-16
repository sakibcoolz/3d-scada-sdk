import type { ComponentInstance, ComponentKind, Quantity } from '@scada3d/core';
import { componentCatalog, conicalTankDefinition, couplerDefinition, pumpDefinition, elbowDefinition, pipeDefinition, reducerDefinition, tankDefinition, teeDefinition, valveDefinition } from './catalog.js';
import { isChoiceParameter, type IndustrialComponentDefinition } from './geometry.js';
import { pipeSizes, type PipeSize } from './sizes.js';
import { asme } from './asme.js';
import type { CapacityUnit } from './vessel.js';

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

const portSizeParameters: Partial<Record<ComponentKind, Readonly<Record<string, string>>>> = {
  reducer: { in: 'size', out: 'outletSize' },
  pump: { suction: 'suctionSize', discharge: 'dischargeSize' },
};

/**
 * The choice parameter that sets one port's size: `outletSize` on the reducer outlet,
 * `suctionSize`/`dischargeSize` on the pump, `nozzleSize` on vessels, otherwise `size` where the
 * kind has one (ADR-0009, ADR-0016).
 */
export function sizeParameterFor(type: ComponentKind, portId: string): string | undefined {
  const parameters = componentCatalog[type].parameters ?? {};
  const name = portSizeParameters[type]?.[portId] ?? (parameters.nozzleSize ? 'nozzleSize' : 'size');
  return parameters[name] ? name : undefined;
}

/** Every parameter's value, falling back to its default. */
function effective(type: ComponentKind, properties: Properties): Record<string, string | number> {
  const parameters = componentCatalog[type].parameters ?? {};
  return Object.fromEntries(Object.entries(parameters).map(([name, spec]) => [name, Object.hasOwn(properties, name) ? (properties[name] as string | number) : spec.default]));
}

type Values = Record<string, string | number>;
const builders: Partial<Record<ComponentKind, (v: Values) => IndustrialComponentDefinition>> = {
  tank: (v) => tankDefinition({ standHeight: v.standHeight as number, nozzleSize: v.nozzleSize as PipeSize, diameter: v.diameter as number, height: v.height as number, head: v.head as 'flat' | 'dished', capacityUnit: v.capacityUnit as CapacityUnit }),
  conicalTank: (v) => conicalTankDefinition(v.nozzleSize as PipeSize, v.capacityUnit as CapacityUnit),
  pump: (v) => pumpDefinition(v.suctionSize as PipeSize, v.dischargeSize as PipeSize),
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
  /** Routed runs bend like ASME long-radius elbows: 1.5 × NPS for the run's size (ADR-0015). */
  bendRadiusFor: (nominalSize: number | undefined) => {
    const size = (Object.keys(pipeSizes) as PipeSize[]).find((s) => nominalSize !== undefined && Math.abs(pipeSizes[s].bore - nominalSize) < 1e-4);
    return size ? asme[size].elbowLR90 : 0.3;
  },
};
