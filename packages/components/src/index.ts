// Public API of @scada3d/components. See docs/API.md; `api.test.ts` fails when the runtime surface changes.
export { componentCatalog, nominalBore, pipeOuterRadius } from './catalog';
export { catalogResolvers, definitionFor, validateProperties } from './parameters';
export type { Axis, Bounds, GeometryPart, IndustrialComponentDefinition, ParameterSpec, PartRole } from './geometry';
