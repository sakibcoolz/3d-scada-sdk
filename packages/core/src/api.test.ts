import { describe, expect, it } from 'vitest';
import * as core from './index';

// The public runtime surface of @scada3d/core. Changing it is an API change: update docs/API.md
// and the changelog together with this list.
const publicApi = [
  'SCENE_SCHEMA_VERSION',
  'canonicalUnits',
  'componentKinds',
  'connect',
  'connectProvider',
  'connectedGroups',
  'connectionsOf',
  'createEmptyScene',
  'createObservationStore',
  'defaultSceneLimits',
  'disconnect',
  'displayScene',
  'findCollisions',
  'findSnapCandidates',
  'identityQuaternion',
  'isKnownUnit',
  'parseScene',
  'portToWorld',
  'portsCompatible',
  'quaternionFromEuler',
  'quaternionToEuler',
  'reachableComponents',
  'removeComponent',
  'resolveFlow',
  'resolveTelemetry',
  'rotateVector',
  'routeConnection',
  'routeScene',
  'sampleRouteCenterline',
  'serializeScene',
  'snapComponent',
  'toCanonical',
  'validateScene',
];

describe('@scada3d/core public API', () => {
  it('exports exactly the documented runtime names', () => {
    expect(Object.keys(core).sort()).toEqual(publicApi);
  });
});
