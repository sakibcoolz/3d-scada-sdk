// Public API of @scada3d/components. See docs/API.md; `api.test.ts` fails when the runtime surface changes.
export { componentCatalog, nominalBore, pipeOuterRadius } from './catalog';
export { catalogResolvers, definitionFor, validateProperties } from './parameters';
export { DEFAULT_SIZE, isPipeSize, outerRadiusFor, pipeSizes, sizeOfPort } from './sizes';
export type { PipeSize } from './sizes';
export { isChoiceParameter } from './geometry';
export type { Axis, Bounds, ChoiceParameterSpec, GeometryPart, IndustrialComponentDefinition, NumberParameterSpec, ParameterSpec, PartRole } from './geometry';
