# Public API reference (MVP)

**Status:** current public surface of the three SDK packages, enforced by `api.test.ts` in each package (runtime exports) and the explicit `index` export lists (types). Anything not listed is internal and may change without notice. Packages are built to `dist/` (ES modules and declarations) and verified from packed tarballs in a stand-alone app (T-024, [RELEASE.md](RELEASE.md)); they are not published to a registry.

All geometry is right-handed, Y-up, metres. Scene components use named vectors (ADR-0007): `position`/`scale` are `Vector3Like` `{ x, y, z }` and `rotation` is a unit `QuaternionLike` `{ x, y, z, w }`; `THREE.Vector3`/`THREE.Quaternion` satisfy these types. Derived geometry (catalog ports, world ports, routes) uses tuples `[x, y, z]`. The SDK is read-only: it never writes tags or opens network connections (ADR-0003).

## @sakibcoolz/core (framework-neutral)

| Area | Runtime exports | Main types |
|---|---|---|
| Scene model | `SCENE_SCHEMA_VERSION` (4), `SCENE_DOCUMENT_TYPE` (`"industrial.scene"`), `componentKinds`, `createEmptyScene`, `portsCompatible` | `ScadaScene`, `SceneProject`, `SceneExtensions`, `JsonValue`, `ComponentInstance`, `ComponentKind`, `ComponentDefinition`, `ConnectionPort`, `PortKind`, `SceneConnection`, `TagBinding`, `Quantity`, `Vector3Like`, `QuaternionLike`, `Vector3Tuple`, `QuaternionTuple` |
| Units | `canonicalUnits`, `isKnownUnit`, `toCanonical` | |
| Validation and persistence | `validateScene`, `defaultSceneLimits`, `serializeScene`, `parseScene` | `SceneValidationOptions`, `SceneValidationResult`, `SceneValidationError`, `SceneValidationErrorCode`, `SceneLimits`, `ParseSceneOptions` |
| Transforms | `portToWorld`, `rotateVector`, `quaternionFromEuler`, `quaternionToEuler`, `identityQuaternion` | `WorldPort`, `ComponentTransform` |
| Snapping | `findSnapCandidates`, `snapComponent` | `SnapCandidate`, `SnapOptions`, `SnapResult`, `SnapStatus` |
| Graph | `connect`, `disconnect`, `removeComponent`, `connectionsOf`, `reachableComponents`, `connectedGroups` | `GraphResult`, `GraphError`, `GraphErrorCode`, `GraphOptions` |
| Routing | `routeConnection`, `routeScene`, `sampleRouteCenterline` | `PipeRoute`, `RouteBend`, `RouteKind`, `RouteFailure`, `RoutingOptions` |
| Attach | `attachComponents` | `AttachOptions`, `AttachResult` |
| Upgrade (hosts loading older scenes must call it; see RELEASE.md) | `upgradeDimensions` | `UpgradeOptions`, `UpgradeResult` |
| Assemblies | `assemblyOf`, `moveAssembly`, `lockConnectedAsChildren`, `unlockFromParent` | `AssemblyResult` (`ComponentInstance.parentId`) |
| Copy and paste | `copyComponents`, `pasteComponents`, `clipboardWidth` | `ComponentClipboard` |
| Touching ports | `findTouchingPorts`, `connectTouchingPorts` | `TouchingOptions`, `TouchingMatch`, `TouchingRejection`, `TouchingResult`, `ConnectTouchingResult` |
| Open joints | `findOpenJoints`, `seatOnConnection` | `JointOptions`, `OpenJoint`, `SeatResult` |
| Collisions | `findCollisions` | `CollisionOptions`, `CollisionPair`, `CollisionResult` |
| Flow | `resolveFlow` | `FlowReading`, `FlowState`, `FlowDirection`, `FlowUnknownReason`, `FlowOptions`, `FlowResolution`, `Quality`, `ValueSource` |
| Telemetry | `resolveTelemetry`, `displayScene` | `Observation`, `PropertyState`, `TelemetryOptions`, `TelemetryResolution`, `TelemetryUnknownReason`, `FreshnessOptions` |
| Host data input | `createObservationStore`, `connectProvider` | `DataProvider`, `ObservationStore` |

Pure functions take the current time (`now`) and the catalog lookups (`resolvePorts`, `resolveBindable`) as parameters; core has no dependency on React, Three.js, the DOM or the component catalog.

## @sakibcoolz/components

| Runtime exports | Types |
|---|---|
| `componentCatalog` (tank, conicalTank, pipe, elbow, tee, valve, reducer, coupler, pump, sensor, motor), `liquidProfile`, `definitionFor`, `validateProperties`, `catalogResolvers`, `nominalBore` (0.15 m), `pipeOuterRadius` (0.084 m), `pipeSizes`, `asme` (ASME dimensions per size), `legacyCatalogResolvers` (pre-ASME fitting ports for upgrades), `sizeParameterFor` (choice parameter sizing a port, ADR-0016), `vesselSegments`, `segmentVolume`, `vesselProfile` (any vessel's volume below a height), `capacityOf`, `formatCapacity`, `CAPACITY_UNITS`, `componentPresets` (tank family, ADR-0017), `asmeFlange`, `jointStyle`, `hasFlangedEnds`, `flangePairParts`, `flangeParts`, `weldParts` (joint hardware, ADR-0015), `DEFAULT_SIZE`, `isPipeSize`, `outerRadiusFor`, `sizeOfPort`, `isChoiceParameter` | `IndustrialComponentDefinition`, `ParameterSpec` (now `NumberParameterSpec \| ChoiceParameterSpec`), `NumberParameterSpec`, `ChoiceParameterSpec`, `PipeSize`, `GeometryPart` (adds `cone`), `PartRole`, `Bounds`, `Axis` |

### `@sakibcoolz/asset-import` (ADR-0012)
| Runtime | Types |
|---|---|
| `sanitizeSvg(text, limits?)` → `{ ok, svg, markup, notes }` or `{ ok: false, errors }`; `toSvgMarkup(model)`; `defaultSvgLimits` (512 KiB, 5,000 elements, depth 32, 20,000 path commands) | `SanitizedSvg`, `SvgShape`, `SvgMatrix`, `SanitizeResult`, `SvgError`, `SvgErrorCode`, `SvgNote`, `SvgLimits` |

It needs no DOM and runs in Node and browsers. It is an allow-list:
- **Kept:** shapes, paths, groups, transforms and presentation styles.
- **Dropped, with notes:** text, metadata, unknown elements and attributes.
- **Rejected:** scripts, event handlers, `href`, `url()`/`data:`/`javascript:` values, `image`/`use`/`foreignObject`, DOCTYPE and entities, malformed XML or paths, and anything over the limits.

`toSvgMarkup` writes clean markup from the model only.

### `@sakibcoolz/simulation` (optional, ADR-0010)
| Runtime | Types |
|---|---|
| `createSimulation(scene, { model?, feeds?, pumps?, dt?, clock? })` → `{ state(), step(seconds), update(scene), configure({ feeds, pumps }), reset() }`, `MODEL` (mass-balance constants), `vesselOf(type, properties?)` (vessel shape from the component's definition, following its dimensions: `volumeAt`, `heightAt`, `portHeight`, `percentAt`, `volumeAtPercent`), `HYDRAULIC` (hydraulic constants: fluid, roughness, K-factors; flow lengths come from geometry), `frictionFactor(re, ε/D)`, `TANK` (radius, height, port heights) | `Simulation`, `SimulationOptions`, `SimulationState`, `SimulationNote`, `Feed`, `PumpCurve`, `Vessel` |

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

## @sakibcoolz/react

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
- Joints (T-051, ADR-0015): `Scada3DViewer`/`Scada3DEditor` `joints?: boolean` (default true) draws flanges, bolts and weld beads. `RoutingOptions.bendRadiusFor?(nominalSize)` sets a bend radius per pipe size; `catalogResolvers` provides the ASME long-radius value.
- Floor (T-061): `Scada3DViewer`/`Scada3DEditor` `floor?: boolean` (default false) draws a concrete slab just below y = 0 under the equipment: the plan extent of every component's rotated bounds plus 3 m, at least 20 m × 20 m, rounded to whole metres. Display only: it is not written to the scene and clicks pass through it.
- Walkthrough (T-062, ADR-0020): `Scada3DViewer`/`Scada3DEditor` `walkthrough?: boolean` (default false) adds two buttons. Moving around is view only; editing goes through `onSelect` (see Picking).
  - **Walk** (desktop): first person at 1.7 m eye height. The mouse looks around (pointer lock, or drag), WASD or the arrows walk, Space rises and Alt sinks (0.6–50 m), Shift goes faster and Esc leaves. Equipment blocks, overhead racks can be walked under, and the orbit view is restored on exit.
  - **Enter VR** (WebXR headset): you stand on the floor at true scale, teleport with the trigger (aim at the floor, release) and snap-turn 30° with the thumbstick. The host page must be HTTPS and the browser must support `immersive-vr`; otherwise the button is disabled and says why.
  - **Picking (T-063):** when the view has `onSelect` (the editor always does), Walk's click selects the part under the crosshair and **C** connects it to the selected one. In VR, the trigger on a part selects it and the grip connects it. These go through `onSelect(id, { additive })`, which is the editor's Shift+click attach.
  - **Editing while walking (T-064):** in the editor, the selected part's shortcuts keep working in Walk: R / Shift+R turn, Delete removes, PageUp/PageDown raise and lower, Ctrl/Cmd+Z undoes. The arrows, Space, Alt, plain C and Esc belong to the walk.
  - **Placing (T-065):** in the editor, **P** opens a parts menu while walking. The chosen part follows the crosshair on the floor as a ghost that snaps to nearby ports, a **click** places it (and you keep holding it), and **X** or right-click stops. `Scada3DViewer` takes `walkPlacing?: WalkPlacing` (`parts`, `holding`, `onHold`, `onAimFloor`, `onPlace`) for hosts that build their own editor; `Scada3DEditor` supplies it.
- Selection (T-049): `Scada3DViewer.onSelect?: SelectHandler`, i.e. `(id, { additive }?) => void`; `additive` is true when Shift was held. The editor attaches the Shift-clicked part to the selected one with `attachComponents`. Hosts using a one-argument handler are unaffected.
- Underlay (T-019a, ADR-0012):
  - `ScadaScene.underlay` (`SceneUnderlay`) is drawn by the viewer flat on the ground, sanitized again and painted through an `<img>` onto a texture. It cannot be picked.
  - The editor's **Underlay** section imports an `.svg` (≤ 512 KiB), sets width, X/Z, rotation and opacity, and removes it. Each change is undoable, and the section is disabled when locked.
  - `importSceneText` rejects unsafe underlays. `SceneValidationOptions.validateUnderlay` is the core hook.
- Simulation (T-021, ADR-0010): `Scada3DViewer` and `Scada3DEditor` take `simulation?: SimulationInput`, with `{ levels?, flows?, model? }`. While it is set:
  - tank levels and connection flows come only from it (telemetry and `flow` are not mixed in for those values);
  - flows are drawn as SIMULATED (violet);
  - a badge reads "SIMULATED · <model> v<version>".

  The saved scene is never changed.
- Instancing (T-046): `Scada3DViewer` and `Scada3DEditor` take `instancing?: InstancingMode` (`'auto'` default, `'off'`, `'always'`). In `'auto'`, scenes with at least 100 components draw plain equipment as instanced meshes (chunks of up to 64 nearby instances). Selected, colliding, glass, X-ray and cutaway components stay individual meshes. Clicking an instanced part selects its component as before. `InstancingMode` is exported as a type.
- Rendering (T-029): port markers (yellow dots) mark **free** ports only; a connected port sits inside its joint. Flow beads, port markers and pipe runs are drawn in a few shared meshes, and equipment parts with the same definition share GPU geometry.
- Editor look (T-042): the editor root has class `scada3d-editor` and ships one scoped stylesheet (every rule starts with `.scada3d-editor`, so host pages are untouched). Colours are CSS custom properties on that root (`--s3-bg`, `--s3-raised`, `--s3-border`, `--s3-text`, `--s3-muted`, `--s3-accent`, `--s3-accent-bg`, `--s3-danger`, `--s3-input`, …); a host can retheme by overriding them. Properties are grouped in collapsible sections (Transform, Settings, Connections, Tag bindings, View, Actions); the scene file (Scene JSON, export, import) is a section in the left panel. Positions are shown to the millimetre; typed values are kept exactly.

Without `flow` and `telemetry` no live data is shown. Live values never change the scene passed to `onChange`.

## Scene version 4 (T-068, ADR-0021)
- **What v4 adds:**
  - Files are written as `schemaVersion: 4` with `documentType: "industrial.scene"`.
  - Optional root `project {id?, name?, revision?, description?}` and `extensions`.
  - Optional component `name`, `typeVersion`, `manufacturer`, `model`, `labels` (string map) and `extensions`.
- **Older files:** v1, v2 and v3 files still load; `validateScene`/`parseScene` report `migratedFrom: 1 | 2 | 3`.
- **Extensions** are keyed by reverse-DNS namespace and hold plain JSON, at most 16 levels deep and 10,000 values per document. They are preserved with sorted keys and never interpreted by core.
- **New error code `SECRET_FIELD`:** a label or extension key that names a credential (password, secret, API key, private key, `…token`) is rejected. Store a reference to the secret in your host instead.

### JSON Schema (T-069)
- **Where it is:** `@sakibcoolz/core/schema/industrial-scene.v4.schema.json`, a draft 2020-12 schema for version 4 files, published with the package.
- **Examples:** `schema/fixtures/` holds `valid/`, `invalid/` and `validator-only/` documents, each with its expected `validateScene` error.
- **Use it for:** editors, other languages and pipelines that cannot run the TypeScript validator.
- **Authority:** `validateScene` stays authoritative. The schema cannot check:
  - unit-length rotations;
  - references and ports;
  - port compatibility and occupancy;
  - the scale policy and assembly cycles;
  - units per quantity;
  - credential-like key names;
  - extension depth and value budgets.
- **Guarantee:** anything `validateScene` accepts with the default limits passes the schema. A test proves this on every example and on 1500 seeded mutations.

## Component registry (T-071, ADR-0022)
- **Registering a type:** `createComponentRegistry(...definitions)` returns a registry of the built-in kinds plus your types. Each type is a namespaced id such as `com.acme.press-200` (bare names are reserved for the SDK), described with the catalog's own building blocks:
  - `label`, `ports`, `bounds`, primitive `parts`;
  - optional `parameters`, `bindable`, `version`, `category`;
  - an optional `build(values)` for parametric shapes.
- **What a registry offers:** `has`, `get`, `list`, `definitionFor`, `validateProperties` and `sizeParameterFor`.
  - `registry.resolvers` can be passed to `validateScene`, `parseScene`, `connect`, `routeScene`, `findCollisions` and the other core functions.
  - `builtInRegistry.resolvers` behaves like `catalogResolvers`, which stays exported.
- **React:** pass the same registry to `Scada3DViewer` and `Scada3DEditor` as `registry`. Palette, rendering, editing and import then know your types.
- **Unknown types:** files using an unregistered type are rejected (`UNKNOWN_COMPONENT_KIND`). `unknownTypeDefinition(type)` is the placeholder renderers fall back to.
- **Core:**
  - `ComponentInstance.type` is now `ComponentType` (`ComponentKind | string`).
  - New exports `isBuiltInKind` and `isNamespacedType`.
  - `validateScene` takes `resolveType`.
