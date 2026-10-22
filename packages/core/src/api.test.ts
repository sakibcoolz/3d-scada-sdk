import { describe, expect, it } from 'vitest';
import * as core from './index.js';

// The public runtime surface of @sakibcoolz/core. Changing it is an API change: update docs/API.md
// and the changelog together with this list.
const publicApi = [
  'SCENE_DOCUMENT_TYPE',
  'SCENE_SCHEMA_VERSION',
  'assemblyOf',
  'attachComponents',
  'canonicalUnits',
  'checkPorts',
  'clipboardWidth',
  'componentKinds',
  'connect',
  'connectProvider',
  'connectTouchingPorts',
  'connectedGroups',
  'connectionsOf',
  'copyComponents',
  'createEmptyScene',
  'createObservationStore',
  'defaultSceneLimits',
  'disconnect',
  'displayScene',
  'findCollisions',
  'findOpenJoints',
  'findSnapCandidates',
  'findTouchingPorts',
  'identityQuaternion',
  'isBuiltInKind',
  'isKnownUnit',
  'isNamespacedType',
  'lockConnectedAsChildren',
  'matesPhysically',
  'moveAssembly',
  'parseScene',
  'pasteComponents',
  'portCapacity',
  'portKinds',
  'portToWorld',
  'portsCompatible',
  'powerKinds',
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
  'seatOnConnection',
  'serializeScene',
  'signalTypes',
  'snapComponent',
  'toCanonical',
  'unlockFromParent',
  'upgradeDimensions',
  'validateScene',
];

describe('@sakibcoolz/core public API', () => {
  it('exports exactly the documented runtime names', () => {
    expect(Object.keys(core).sort()).toEqual(publicApi);
  });
});
