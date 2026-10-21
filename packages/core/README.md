# @sakibcoolz/core

The **framework-neutral scene model** of the [3D SCADA SDK](https://github.com/sakibcoolz/3d-scada-sdk): typed component ports and connections, validation, schema migration, snapping and attach, orthogonal pipe routing, open-joint, touching-port and collision checks, assemblies, copy/paste and telemetry bindings. No React, no Three.js, no DOM, no network — it runs in browsers, Node.js and workers.

```sh
npm install @sakibcoolz/core @sakibcoolz/components
```
ESM only · Node.js 20+ · TypeScript types included · MIT

Core knows nothing about specific equipment: you pass catalog lookups. [`@sakibcoolz/components`](https://www.npmjs.com/package/@sakibcoolz/components) provides them as `catalogResolvers`.

## Quick start

```js
import { parseScene, serializeScene, findOpenJoints, findCollisions, routeScene } from '@sakibcoolz/core';
import { catalogResolvers } from '@sakibcoolz/components';

const at = (id, type, x, properties = {}) => ({
  id, type, position: { x, y: 0.084, z: 0 }, rotation: { x: 0, y: 0, z: 0, w: 1 },
  scale: { x: 1, y: 1, z: 1 }, properties,
});
const scene = {
  schemaVersion: 3, units: 'm',
  components: [at('a', 'pipe', 0, { length: 2 }), at('b', 'pipe', 2, { length: 2 })],
  connections: [{ id: 'j', from: { instanceId: 'a', portId: 'out' }, to: { instanceId: 'b', portId: 'in' } }],
};

const result = parseScene(JSON.stringify(scene), catalogResolvers); // validates and migrates v1/v2 files
if (!result.ok) throw new Error(result.errors.map((e) => e.message).join('\n'));

findOpenJoints(result.scene, catalogResolvers);   // [] — connected ports meet face to face
findCollisions(result.scene, catalogResolvers);   // overlapping solid components
routeScene(result.scene, catalogResolvers);       // pipe centrelines for connections that do not touch
serializeScene(result.scene);                     // canonical JSON for saving
```

## Scene format (schema v3)
- `components[]`: `id`, `type`, `position {x,y,z}` (metres, Y up, right-handed), `rotation {x,y,z,w}` (unit quaternion), `scale`, `properties` (size settings and live values such as `level`, `open`), optional `parentId` (assemblies).
- `connections[]`: `{ id, from: { instanceId, portId }, to: { instanceId, portId } }` — explicit; nothing is connected implicitly.
- Optional `tagBindings[]` (tag → property / connection flow) and `underlay` (sanitized SVG drawing).

## API overview

| Area | Functions |
|---|---|
| Scene model | `createEmptyScene`, `componentKinds`, `portsCompatible`, `SCENE_SCHEMA_VERSION` |
| Validation and files | `validateScene`, `parseScene`, `serializeScene`, `defaultSceneLimits` |
| Transforms | `portToWorld`, `rotateVector`, `quaternionFromEuler`, `quaternionToEuler` |
| Placing parts | `findSnapCandidates`, `snapComponent`, `attachComponents`, `seatOnConnection` |
| Graph | `connect`, `disconnect`, `removeComponent`, `connectionsOf`, `reachableComponents`, `connectedGroups` |
| Routing | `routeConnection`, `routeScene`, `sampleRouteCenterline` |
| Checks | `findOpenJoints`, `findTouchingPorts`, `connectTouchingPorts`, `findCollisions` |
| Assemblies, clipboard | `assemblyOf`, `moveAssembly`, `lockConnectedAsChildren`, `unlockFromParent`, `copyComponents`, `pasteComponents` |
| Older files | `upgradeDimensions(scene, { ...catalogResolvers, ...legacyCatalogResolvers })` |
| Live data (read-only) | `resolveTelemetry`, `resolveFlow`, `displayScene`, `createObservationStore`, `connectProvider` |

Functions are pure: they return new scenes or result objects and never mutate their input. Time (`now`) is passed in, so results are deterministic.

## Safety
Core is **read-only with respect to plants**: it never writes tags, opens network connections or controls equipment. Live values come from the host through observations/providers.

Full API reference: [docs/API.md](https://github.com/sakibcoolz/3d-scada-sdk/blob/develop/docs/API.md) · Licence: MIT
