import { describe, expect, it } from 'vitest';
import * as components from './index.js';

describe('@scada3d/components public API', () => {
  it('exports exactly the documented runtime names', () => {
    expect(Object.keys(components).sort()).toEqual(['CAPACITY_UNITS', 'DEFAULT_SIZE', 'asme', 'asmeFlange', 'capacityOf', 'catalogResolvers', 'componentCatalog', 'componentPresets', 'definitionFor', 'flangePairParts', 'flangeParts', 'formatCapacity', 'hasFlangedEnds', 'isChoiceParameter', 'isPipeSize', 'jointStyle', 'legacyCatalogResolvers', 'liquidProfile', 'nominalBore', 'outerRadiusFor', 'pipeOuterRadius', 'pipeSizes', 'segmentVolume', 'sizeOfPort', 'sizeParameterFor', 'validateProperties', 'vesselSegments', 'weldParts']);
  });
});
