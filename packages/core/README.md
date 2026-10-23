# @sakibcoolz/core

The **framework-neutral scene model** of the [3D SCADA SDK](https://github.com/sakibcoolz/3d-scada-sdk): the industrial scene document (schema version 4), typed ports in five domains, validation and migration, snapping and attach, orthogonal pipe routing, open-joint, touching-port and collision checks, connection-graph queries, assemblies, copy/paste, acquisition descriptions, tag bindings and read-only telemetry. No React, no Three.js, no DOM, no network — it runs in browsers, Node.js and workers.

```sh
npm install @sakibcoolz/core @sakibcoolz/components
```
ESM only · Node.js 20+ · TypeScript types included · MIT

Core knows nothing about specific equipment: you pass catalog lookups. [`@sakibcoolz/components`](https://www.npmjs.com/package/@sakibcoolz/components) provides them as `catalogResolvers`, or as `registry.resolvers` when you register your own types.

## Quick start

```js
import { parseScene, serializeScene, findOpenJoints, findCollisions, routeScene, neighbours, projectAcquisition, sceneDigest } from '@sakibcoolz/core';
import { catalogResolvers } from '@sakibcoolz/components';

const at = (id, type, x, properties = {}) => ({
  id, type, position: { x, y: 0.084, z: 0 }, rotation: { x: 0, y: 0, z: 0, w: 1 },
  scale: { x: 1, y: 1, z: 1 }, properties,
});
const scene = {
  schemaVersion: 4, documentType: 'industrial.scene', units: 'm',
  project: { id: 'line-2', name: 'Transfer line', revision: '1' },
  components: [at('a', 'pipe', 0, { length: 2 }), at('b', 'pipe', 2, { length: 2 })],
  connections: [{ id: 'j', from: { instanceId: 'a', portId: 'out' }, to: { instanceId: 'b', portId: 'in' } }],
  dataSources: [{ id: 'plc1', protocol: 'modbus-tcp', endpointRef: 'host:plc-1' }], // a reference, never credentials
  runtimeVariables: [{ id: 'FT-101', dataType: 'float32', unit: 'm³/h', access: 'read',
    source: { dataSourceId: 'plc1', address: { area: 'holding', address: 100, unitId: 1 } } }],
  tagBindings: [{ id: 'b1', tagId: 'FT-101', kind: 'flow', connectionId: 'j' }],
};

const result = parseScene(JSON.stringify(scene), catalogResolvers); // validates; v1–v3 files migrate on load
if (!result.ok) throw new Error(result.errors.map((e) => e.message).join('\n'));

findOpenJoints(result.scene, catalogResolvers);   // [] — connected ports meet face to face
findCollisions(result.scene, catalogResolvers);   // overlapping solid components
routeScene(result.scene, catalogResolvers);       // pipe centrelines for connections that do not touch
neighbours(result.scene, 'a');                    // ['b'] — one edge away
projectAcquisition(result.scene);                 // what the host's gateway should read; sent nowhere
sceneDigest(result.scene);                        // SHA-256 of the canonical form, for approval records
serializeScene(result.scene);                     // canonical JSON for saving (always version 4)
```

## Scene format (schema v4, `documentType: "industrial.scene"`)
- `project`: optional `{ id?, name?, revision?, description? }`.
- `components[]`: `id`, optional `name`, `type` (a built-in kind or a namespaced host type such as `com.example.press`), `position {x,y,z}` (metres, Y up, right-handed), `rotation {x,y,z,w}` (unit quaternion), `scale`, `properties`, optional `parentId` (assemblies), `labels` (string map) and `extensions`.
- `connections[]`: `{ id, domain?, relationship?, from: { instanceId, portId }, to: { instanceId, portId }, properties? }` between typed ports (`fluid`, `mechanical`, `power`, `signal`, `network`) — explicit; nothing is connected implicitly.
- `associations[]`: directed, port-less relationships between components (e.g. a PLC `controls` a drive); never drawn as wiring or routed.
- `dataSources[]` and `runtimeVariables[]`: descriptions of how a host acquires tags (protocol, opaque `endpointRef`, typed Modbus / OPC UA address, scaling). `access` is `'read'` or `'readWrite'`; a `readWrite` variable requires `command` limits.
- Optional `tagBindings[]` (tag → property / connection flow), `views` (2D process and electrical layouts), `underlay` (sanitized SVG drawing) and namespaced `extensions`.
- Files never hold live values, code or credentials; credential-like keys are rejected (`SECRET_FIELD`). Versions 1–3 migrate on load and report `migratedFrom`. JSON Schema: `@sakibcoolz/core/schema/industrial-scene.v4.schema.json`.

## API overview

| Area | Functions |
|---|---|
| Scene model | `createEmptyScene`, `componentKinds`, `isBuiltInKind`, `isNamespacedType`, `portKinds`, `checkPorts`, `portsCompatible`, `relationshipKinds`, `SCENE_SCHEMA_VERSION`, `SCENE_DOCUMENT_TYPE` |
| Validation and files | `validateScene`, `parseScene`, `serializeScene`, `defaultSceneLimits`, `sceneDigest`, `sha256Hex` |
| Units | `canonicalUnits`, `isKnownUnit`, `toCanonical` |
| Transforms | `portToWorld`, `rotateVector`, `quaternionFromEuler`, `quaternionToEuler` |
| Placing parts | `findSnapCandidates`, `snapComponent`, `attachComponents`, `seatOnConnection` |
| Graph | `connect`, `disconnect`, `removeComponent`, `addAssociation`, `removeAssociation`, `connectionsOf`, `neighbours`, `relatedComponents`, `pathBetween`, `reachableComponents`, `connectedGroups` |
| Routing | `routeConnection`, `routeScene`, `sampleRouteCenterline` |
| Checks | `findOpenJoints`, `findTouchingPorts`, `connectTouchingPorts`, `findCollisions` |
| Assemblies, clipboard | `assemblyOf`, `moveAssembly`, `lockConnectedAsChildren`, `unlockFromParent`, `copyComponents`, `pasteComponents` |
| Tags and acquisition | `projectAcquisition`, `suggestVariables`, `reviewTags`, `applyTagSuggestions`, `dataTypes`, `protocols`, `modbusAreas` |
| Older files | `upgradeDimensions(scene, { ...catalogResolvers, ...legacyCatalogResolvers })` |
| Live data (read-only) | `resolveTelemetry`, `resolveVariableValues`, `valueFitsDataType`, `resolveFlow`, `displayScene`, `createObservationStore`, `connectProvider` |
| Status | `componentStatus`, `alarmSeverities` |

Functions are pure: they return new scenes or result objects and never mutate their input. Time (`now`) is passed in, so results are deterministic.

## Safety
Core is **read-only with respect to plants**: it never writes to devices, opens network connections or holds credentials. Live values and alarms come from the host. Data sources and runtime variables only *describe* acquisition; the host's gateway does the reading. Writable (`readWrite`) variables are describe-and-request only (ADR-0029): the SDK can raise a confirmed command request, and the host authorizes, audits, enforces limits and writes. Validation is an engineering aid; it does not verify physical wiring, safe operating limits or functional safety.

Full API reference: [docs/API.md](https://github.com/sakibcoolz/3d-scada-sdk/blob/develop/docs/API.md) · Scene format: [docs/INDUSTRIAL_SCENE_SPEC.md](https://github.com/sakibcoolz/3d-scada-sdk/blob/develop/docs/INDUSTRIAL_SCENE_SPEC.md) · Host integration: [docs/RUNTIME_INTEGRATION.md](https://github.com/sakibcoolz/3d-scada-sdk/blob/develop/docs/RUNTIME_INTEGRATION.md) · Licence: MIT
