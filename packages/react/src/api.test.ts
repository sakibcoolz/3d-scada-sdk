import { describe, expect, it } from 'vitest';
import * as react from './index';

// Editor internals (drop planning, history, visual helpers) are deliberately not exported.
describe('@scada3d/react public API', () => {
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
