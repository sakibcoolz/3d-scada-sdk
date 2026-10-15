import { describe, expect, it } from 'vitest';
import * as components from './index';

describe('@scada3d/components public API', () => {
  it('exports exactly the documented runtime names', () => {
    expect(Object.keys(components).sort()).toEqual(['DEFAULT_SIZE', 'catalogResolvers', 'componentCatalog', 'definitionFor', 'isChoiceParameter', 'isPipeSize', 'nominalBore', 'outerRadiusFor', 'pipeOuterRadius', 'pipeSizes', 'sizeOfPort', 'validateProperties']);
  });
});
