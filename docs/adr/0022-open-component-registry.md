# ADR-0022: Open component registry

Status: Accepted (owner, 2026-10-22); implemented in T-071. M9 Phase 2 of docs/INDUSTRIAL_SDK_PLAN.md (§5.1).

## Context
The 14 built-in kinds are a closed list, wired through four places:
- `componentKinds` in core: `scene.ts:26`, with `UNKNOWN_COMPONENT_KIND` at `validation.ts:298`;
- `componentCatalog: Record<ComponentKind, …>` in components;
- `componentCatalog[...]` lookups throughout the react editor and viewer;
- `vesselOf` in simulation.

As a result, an integrator cannot add equipment, such as a VFD, a press or a conveyor, without editing the SDK. This contradicts PRD persona 5 and FR-01/FR-12, and blocks every later M9 phase (ports, control equipment, views).

## Decision
1. **Type IDs are strings.**
   - The 14 built-in kinds keep their bare names (`tank`, `valve`, …). These names stay valid in every existing file, with no migration.
   - Bare names (no dot) are **reserved for SDK built-ins**.
   - Third-party and host types must be namespaced, at least two dot-separated segments: `com.acme.press-200`, `vendor.vfd`. This is the same shape as extension keys (ADR-0021), so types from different libraries cannot collide.
2. **Core stays geometry-free and catalog-free.**
   - `validateScene` gains one optional resolver, `resolveType?: (type: string) => boolean`. It answers whether the host knows a type.
   - Without it, core accepts only the built-in names, which is today's behaviour, so existing hosts are unaffected.
   - `resolvePorts` and the other resolvers already take the type as an argument. Their parameter type widens from `ComponentKind` to `string`.
   - `ComponentInstance.type` becomes `ComponentType = ComponentKind | (string & {})`. `ComponentKind` stays exported for the built-ins.
3. **The registry lives in `@sakibcoolz/components`**, next to the catalog.
   - `createComponentRegistry(...definitions)` returns an object with:
     - `get(type)` and `list()`, for palettes;
     - `resolvers`: the same shape as today's `catalogResolvers`, plus `resolveType`. It can be passed straight to `validateScene`, `parseScene`, `connect`, `routeScene` and the other core functions.
   - `builtInRegistry` wraps today's catalog. `catalogResolvers` stays exported and equals `builtInRegistry.resolvers`, so current code keeps working.
   - A **component definition** is the existing `IndustrialComponentDefinition`:
     - fields: label, ports, bounds, primitive `parts`, `parameters`, optional `bindable`;
     - plus `type`, `version` and an optional `category`;
     - plus an optional `build(properties)` for parametric geometry and ports.
   - Definitions use the same primitive shapes the catalog uses: cylinder, box, sphere, cone, lathe, bend, strut, ring. A custom type renders, snaps, routes, collides and selects like a built-in one, with no new renderer code.
   - **Registration rules:** duplicates are refused; a bare (non-namespaced) custom ID is refused; ports must be unique and have unit directions.
4. **React uses the registry.**
   - `Scada3DViewer` and `Scada3DEditor` take an optional `registry` prop, defaulting to `builtInRegistry`.
   - The palette, property panel, drop, Walk parts menu, import (`importSceneText`) and rendering use it instead of `componentCatalog` directly.
   - A file with a type the registry does not know is rejected on import with `UNKNOWN_COMPONENT_KIND`, as today.
   - **Not in this ADR:** an opt-in placeholder rendering for unknown types.
5. **Simulation** treats types it has no model for as passive. They neither hold nor move liquid. This is already the case for sensors and motors.
6. **Scene file:** `components[].type` accepts built-in names or namespaced IDs.
   - The JSON Schema's `type` becomes "built-in enum, or the namespaced pattern".
   - No schema version change is needed. Version 4 files that use only built-ins are unchanged. A file with a custom type needs a host that registers it.
   - `typeVersion` (ADR-0021) records the definition version the instance was authored against. Comparing it with the registered `version` is out of scope here.
7. **Not in this ADR**, planned in later Phase 2 steps or later phases:
   - data-only definitions embedded in the scene (`componentDefinitions`);
   - placeholder rendering of unknown types;
   - version-mismatch warnings;
   - new port domains (Phase 3);
   - control-equipment libraries (Phase 6).

## Options considered
- **Registry in core.** Rejected: core would have to hold geometry types, or the definitions would split across packages.
- **Plugins that ship code inside the scene file.** Rejected: executable content in documents is forbidden (SECURITY, ADR-0021).
- **Prefix the built-ins (`sdk.tank`).** Rejected: it would force a migration of every saved file for no gain. Bare names are simply reserved instead.

## Consequences
- **Type-level change for TypeScript hosts:** `ComponentInstance.type` widens to a string-based type. Code that switches exhaustively on `ComponentKind` must handle "other". This ships in 0.2.0 (D7), with a migration note.
- **No runtime change for hosts that use only built-ins.** All 14 kinds, their files and the default resolvers behave identically.
- The react package stops importing `componentCatalog` in its rendering and editing paths. This is the main implementation work.

## Tests (planned)
- **Core:**
  - `resolveType` accepts a custom type, and without it only built-ins are accepted;
  - unknown types are still rejected;
  - connections between a custom part and a built-in one validate through `resolvePorts`.
- **Components:**
  - registry rules (duplicate, bare ID, bad ports);
  - `builtInRegistry` resolvers equal to today's `catalogResolvers` for all 14 kinds, as a regression check;
  - a parametric custom definition.
- **Integration:** a test package registers `com.example.press` with no SDK change. It validates, round-trips, routes to a pipe, and computes collisions.
- **React e2e:** a playground with a custom type: it appears in the palette, can be dropped and connected, survives export and import, and appears in the Walk parts menu. Importing an unregistered type is rejected.
- **JSON Schema:** valid and invalid examples for namespaced types; the agreement fuzz still passes.
- **Consumer example:** registers a custom type through the published packages.

## Implementation notes (T-071)
- **Registry contents:** `createComponentRegistry(...definitions)` always includes the 14 built-in kinds. `builtInRegistry` is `createComponentRegistry()`.
- **Registration:** definitions are validated, copied and frozen at registration. Errors list every problem in one exception.
- **`registry.definitionFor(type)` never fails.** For a type it does not know, it returns `unknownTypeDefinition(type)`, a labelled, port-less 0.5 m box. Renderers therefore never break, while `registry.resolvers.resolveType` and `resolvePorts` still report the type as unknown, so validation rejects it.
- **Simulation** treats host types as passive: no vessel, no ports.
- **Joints:** host types get welded joints (`hasFlangedEnds` is false for them).
- **React:**
  - `Scada3DViewer` and `Scada3DEditor` provide the `registry` prop through a React context, which reaches the 3D canvas.
  - The palette, Walk parts menu, property panel, drop, attach, notices, import, telemetry, floor, walk obstacles and joints all use it.
  - The playground's `?custom` registers an example `com.example.filter`.
