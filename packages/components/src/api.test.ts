import { describe, expect, it } from 'vitest';
import * as components from './index.js';

describe('@scada3d/components public API', () => {
  it('exports exactly the documented runtime names', () => {
    expect(Object.keys(components).sort()).toEqual(['DEFAULT_SIZE', 'asme', 'asmeFlange', 'catalogResolvers', 'componentCatalog', 'definitionFor', 'flangePairParts', 'flangeParts', 'hasFlangedEnds', 'isChoiceParameter', 'isPipeSize', 'jointStyle', 'legacyCatalogResolvers', 'liquidProfile', 'nominalBore', 'outerRadiusFor', 'pipeOuterRadius', 'pipeSizes', 'sizeOfPort', 'sizeParameterFor', 'validateProperties', 'weldParts']);
  });
});
