# Public API reference (MVP)

**Status:** current public surface of the three SDK packages, enforced by `api.test.ts` in each package (runtime exports) and the explicit `index` export lists (types). Anything not listed is internal and may change without notice. Packages are not published yet (T-024).

All geometry is right-handed, Y-up, metres. Scene components use named vectors (ADR-0007): `position`/`scale` are `Vector3Like` `{ x, y, z }` and `rotation` is a unit `QuaternionLike` `{ x, y, z, w }`; `THREE.Vector3`/`THREE.Quaternion` satisfy these types. Derived geometry (catalog ports, world ports, routes) uses tuples `[x, y, z]`. The SDK is read-only: it never writes tags or opens network connections (ADR-0003).

## @scada3d/core (framework-neutral)

| Area | Runtime exports | Main types |
|---|---|---|
| Scene model | `SCENE_SCHEMA_VERSION`, `componentKinds`, `createEmptyScene`, `portsCompatible` | `ScadaScene`, `ComponentInstance`, `ComponentKind`, `ComponentDefinition`, `ConnectionPort`, `PortKind`, `SceneConnection`, `TagBinding`, `Quantity`, `Vector3Like`, `QuaternionLike`, `Vector3Tuple`, `QuaternionTuple` |
| Units | `canonicalUnits`, `isKnownUnit`, `toCanonical` | |
| Validation and persistence | `validateScene`, `defaultSceneLimits`, `serializeScene`, `parseScene` | `SceneValidationOptions`, `SceneValidationResult`, `SceneValidationError`, `SceneValidationErrorCode`, `SceneLimits`, `ParseSceneOptions` |
| Transforms | `portToWorld`, `rotateVector`, `quaternionFromEuler`, `quaternionToEuler`, `identityQuaternion` | `WorldPort`, `ComponentTransform` |
| Snapping | `findSnapCandidates`, `snapComponent` | `SnapCandidate`, `SnapOptions`, `SnapResult`, `SnapStatus` |
| Graph | `connect`, `disconnect`, `removeComponent`, `connectionsOf`, `reachableComponents`, `connectedGroups` | `GraphResult`, `GraphError`, `GraphErrorCode`, `GraphOptions` |
| Routing | `routeConnection`, `routeScene`, `sampleRouteCenterline` | `PipeRoute`, `RouteBend`, `RouteKind`, `RouteFailure`, `RoutingOptions` |
| Collisions | `findCollisions` | `CollisionOptions`, `CollisionPair`, `CollisionResult` |
| Flow | `resolveFlow` | `FlowReading`, `FlowState`, `FlowDirection`, `FlowUnknownReason`, `FlowOptions`, `FlowResolution`, `Quality`, `ValueSource` |
| Telemetry | `resolveTelemetry`, `displayScene` | `Observation`, `PropertyState`, `TelemetryOptions`, `TelemetryResolution`, `TelemetryUnknownReason`, `FreshnessOptions` |
| Host data input | `createObservationStore`, `connectProvider` | `DataProvider`, `ObservationStore` |

Pure functions take the current time (`now`) and the catalog lookups (`resolvePorts`, `resolveBindable`) as parameters; core has no dependency on React, Three.js, the DOM or the component catalog.

## @scada3d/components

| Runtime exports | Types |
|---|---|
| `componentCatalog` (tank, pipe, elbow, tee, valve, pump, sensor, motor), `definitionFor`, `validateProperties`, `catalogResolvers`, `nominalBore` (0.15 m), `pipeOuterRadius` (0.084 m) | `IndustrialComponentDefinition`, `ParameterSpec`, `GeometryPart`, `PartRole`, `Bounds`, `Axis` |

Pass `catalogResolvers` to core functions (`validateScene(input, catalogResolvers)`, `routeScene(scene, catalogResolvers)`, `findCollisions(scene, catalogResolvers)` …). It resolves ports and bounds per instance, so parametric parts such as pipe length are respected, and validates their properties (`INVALID_PROPERTY`).

## @scada3d/react

| Runtime exports | Types |
|---|---|
| `Scada3DViewer`, `Scada3DEditor`, `viewModes`, `importSceneText`, `formatSceneErrors`, `MAX_SCENE_FILE_BYTES` | `ScadaHandle`, `FlowInput`, `TelemetryInput`, `TransformMode`, `TransformHandler`, `ViewMode`, `SceneImport` |

```tsx
<Scada3DViewer scene={scene} viewMode="glass" telemetry={{ provider }} />
<Scada3DEditor initialScene={scene} onChange={save} telemetry={{ observations }} ref={handle} />
handle.current?.setTagValues([{ tagId: 'LT-101', value: 62, quality: 'GOOD', sourceTimestamp: new Date().toISOString() }]);
```

- `Scada3DViewer` props: `scene`, `viewMode?`, `viewOverrides?`, `selectedId?`, `onSelect?`, `collisions?` (default `true`: overlapping solid components are shown in red and listed), `flow?` (`FlowInput`: readings keyed by connection), `telemetry?` (`TelemetryInput`: `observations?`, `provider?`, `source?`, `staleAfterMs?`), `ref?` (`ScadaHandle`). Editor-only props (`preview`, `onCamera`, `transformMode`, `onTransform`) are used by `Scada3DEditor` and are not part of the supported viewer contract.
- `Scada3DEditor` props: `initialScene?`, `onChange?`, `flow?`, `telemetry?`, `collisions?` (default `true`), `defaultLocked?` (default `false`) or controlled `locked?` + `onLockedChange?` (view-only mode), `ref?`.

Without `flow` and `telemetry` no live data is shown. Live values never change the scene passed to `onChange`.
