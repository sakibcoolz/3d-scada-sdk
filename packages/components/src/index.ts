// Public API of @scada3d/components. See docs/API.md; `api.test.ts` fails when the runtime surface changes.
export { componentCatalog, nominalBore, pipeOuterRadius } from './catalog.js';
export { catalogResolvers, definitionFor, sizeParameterFor, validateProperties } from './parameters.js';
export { DEFAULT_SIZE, isPipeSize, outerRadiusFor, pipeSizes, sizeOfPort } from './sizes.js';
export { asme } from './asme.js';
export { legacyCatalogResolvers } from './legacy.js';
export { asmeFlange, flangePairParts, flangeParts, hasFlangedEnds, jointStyle, weldParts } from './jointStyle.js';
export type { AsmeFlange } from './jointStyle.js';
export type { AsmeSize } from './asme.js';
export type { PipeSize } from './sizes.js';
export { isChoiceParameter, liquidProfile } from './geometry.js';
export type { Axis, Bounds, ChoiceParameterSpec, GeometryPart, IndustrialComponentDefinition, NumberParameterSpec, ParameterSpec, PartRole } from './geometry.js';
