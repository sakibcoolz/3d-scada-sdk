import { describe, expect, it } from 'vitest';
import * as simulation from './index.js';

describe('@scada3d/simulation public API', () => {
  it('exports exactly the documented runtime names', () => {
    expect(Object.keys(simulation).sort()).toEqual(['MODEL', 'TANK', 'createSimulation']);
  });
});
