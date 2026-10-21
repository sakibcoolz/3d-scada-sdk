import { describe, expect, it } from 'vitest';
import * as react from './index.js';

// Editor internals (drop planning, history, visual helpers) are deliberately not exported.
describe('@sakibcoolz/react public API', () => {
  it('exports exactly the documented runtime names', () => {
    expect(Object.keys(react).sort()).toEqual([
      'MAX_SCENE_FILE_BYTES',
      'Scada3DEditor',
      'Scada3DViewer',
      'formatSceneErrors',
      'importSceneText',
      'viewModes',
    ]);
  });
});
