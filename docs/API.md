# Public API reference (MVP)

**Status:** current public surface of the three SDK packages, enforced by `api.test.ts` in each package (runtime exports) and the explicit `index` export lists (types). Anything not listed is internal and may change without notice. Packages are built to `dist/` (ES modules and declarations) and verified from packed tarballs in a stand-alone app (T-024, [RELEASE.md](RELEASE.md)); they are not published to a registry.

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
| Assemblies | `assemblyOf`, `moveAssembly`, `lockConnectedAsChildren`, `unlockFromParent` | `AssemblyResult` (`ComponentInstance.parentId`) |
| Copy and paste | `copyComponents`, `pasteComponents`, `clipboardWidth` | `ComponentClipboard` |
| Touching ports | `findTouchingPorts`, `connectTouchingPorts` | `TouchingOptions`, `TouchingMatch`, `TouchingRejection`, `TouchingResult`, `ConnectTouchingResult` |
| Open joints | `findOpenJoints`, `seatOnConnection` | `JointOptions`, `OpenJoint`, `SeatResult` |
| Collisions | `findCollisions` | `CollisionOptions`, `CollisionPair`, `CollisionResult` |
| Flow | `resolveFlow` | `FlowReading`, `FlowState`, `FlowDirection`, `FlowUnknownReason`, `FlowOptions`, `FlowResolution`, `Quality`, `ValueSource` |
| Telemetry | `resolveTelemetry`, `displayScene` | `Observation`, `PropertyState`, `TelemetryOptions`, `TelemetryResolution`, `TelemetryUnknownReason`, `FreshnessOptions` |
| Host data input | `createObservationStore`, `connectProvider` | `DataProvider`, `ObservationStore` |

Pure functions take the current time (`now`) and the catalog lookups (`resolvePorts`, `resolveBindable`) as parameters; core has no dependency on React, Three.js, the DOM or the component catalog.

## @scada3d/components

| Runtime exports | Types |
|---|---|
| `componentCatalog` (tank, pipe, elbow, tee, valve, reducer, coupler, pump, sensor, motor), `definitionFor`, `validateProperties`, `catalogResolvers`, `nominalBore` (0.15 m), `pipeOuterRadius` (0.084 m), `pipeSizes`, `DEFAULT_SIZE`, `isPipeSize`, `outerRadiusFor`, `sizeOfPort`, `isChoiceParameter` | `IndustrialComponentDefinition`, `ParameterSpec` (now `NumberParameterSpec \| ChoiceParameterSpec`), `NumberParameterSpec`, `ChoiceParameterSpec`, `PipeSize`, `GeometryPart` (adds `cone`), `PartRole`, `Bounds`, `Axis` |

### `@scada3d/simulation` (optional, ADR-0010)
| Runtime | Types |
|---|---|
| `createSimulation(scene, { model?, feeds?, pumps?, dt?, clock? })` → `{ state(), step(seconds), update(scene), configure({ feeds, pumps }), reset() }`, `MODEL` (mass-balance constants), `HYDRAULIC` (hydraulic constants: fluid, roughness, K-factors, lengths), `frictionFactor(re, ε/D)`, `TANK` (radius, height, port heights) | `Simulation`, `SimulationOptions`, `SimulationState`, `SimulationNote`, `Feed`, `PumpCurve` |

The model is deterministic, and the host owns the clock.
- **Gravity drain:** q = Cd·A·√(2 g Δh) through open paths, discharging to atmosphere.
- **Sources:** feeds at free ports, and pumps forcing their rate from the first tank upstream.
- **Tees** split equally; **closed valves** and **stopped pumps** block.
- **Integration:** explicit Euler in 0.1 s steps, levels clamped 0–100 % with overflow counted as spilled.
- **Notes:** `assumed-empty`, `overflow`, `dry`, `blocked`.

`model: 'hydraulic'` (ADR-0011) adds:
- pressure and elevation (world y);
- Darcy–Weisbach friction (Swamee–Jain; water at 20 °C, steel ε 0.045 mm);
- K-factor fitting losses;
- pumps as curves `{ shutoffHead, design: { rate, head } }`, forward only;
- tees that split by resistance;
- head-driven tank-to-tank flow and backflow;
- free ends that only let liquid out.

It solves trees only; a loop is reported as `loop` and carries no flow. It is quasi-steady, in 0.5 s steps.

Results are always `source: 'SIMULATED'`.

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

- `Scada3DViewer` props: `scene`, `viewMode?`, `viewOverrides?`, `selectedId?`, `onSelect?`, `collisions?` (default `true`: overlapping solid components are shown in red and listed), `openJoints?` (default `true`: connections whose ports do not meet get amber markers at both ends and are listed), `flow?` (`FlowInput`: readings keyed by connection), `telemetry?` (`TelemetryInput`: `observations?`, `provider?`, `source?`, `staleAfterMs?`), `ref?` (`ScadaHandle`). Editor-only props (`preview`, `onCamera`, `transformMode`, `onTransform`) are used by `Scada3DEditor` and are not part of the supported viewer contract.
- `Scada3DEditor` props: `initialScene?`, `onChange?`, `flow?`, `telemetry?`, `collisions?` (default `true`), `openJoints?` (default `true`), `defaultLocked?` (default `false`) or controlled `locked?` + `onLockedChange?` (view-only mode), `ref?`.
- Simulation (T-021, ADR-0010): `Scada3DViewer` and `Scada3DEditor` take `simulation?: SimulationInput`, with `{ levels?, flows?, model? }`. While it is set:
  - tank levels and connection flows come only from it (telemetry and `flow` are not mixed in for those values);
  - flows are drawn as SIMULATED (violet);
  - a badge reads "SIMULATED · <model> v<version>".

  The saved scene is never changed.
- Instancing (T-046): `Scada3DViewer` and `Scada3DEditor` take `instancing?: InstancingMode` (`'auto'` default, `'off'`, `'always'`). In `'auto'`, scenes with at least 100 components draw plain equipment as instanced meshes (chunks of up to 64 nearby instances). Selected, colliding, glass, X-ray and cutaway components stay individual meshes. Clicking an instanced part selects its component as before. `InstancingMode` is exported as a type.
- Rendering (T-029): port markers (yellow dots) mark **free** ports only; a connected port sits inside its joint. Flow beads, port markers and pipe runs are drawn in a few shared meshes, and equipment parts with the same definition share GPU geometry.
- Editor look (T-042): the editor root has class `scada3d-editor` and ships one scoped stylesheet (every rule starts with `.scada3d-editor`, so host pages are untouched). Colours are CSS custom properties on that root (`--s3-bg`, `--s3-raised`, `--s3-border`, `--s3-text`, `--s3-muted`, `--s3-accent`, `--s3-accent-bg`, `--s3-danger`, `--s3-input`, …); a host can retheme by overriding them. Properties are grouped in collapsible sections (Transform, Settings, Connections, Tag bindings, View, Actions); the scene file (Scene JSON, export, import) is a section in the left panel. Positions are shown to the millimetre; typed values are kept exactly.

Without `flow` and `telemetry` no live data is shown. Live values never change the scene passed to `onChange`.
