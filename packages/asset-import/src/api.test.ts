import { describe, expect, it } from 'vitest';
import * as assetImport from './index.js';

describe('@sakibcoolz/asset-import public API', () => {
  it('exports exactly the documented runtime names', () => {
    expect(Object.keys(assetImport).sort()).toEqual(['defaultSvgLimits', 'sanitizeSvg', 'toSvgMarkup']);
  });
});
