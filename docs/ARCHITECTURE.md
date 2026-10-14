# Architecture — boundaries and design rules

## Package dependency direction
```
apps/playground -> packages/react -> packages/components -> packages/core
                            |                       |
                            +-----------------------+
packages/telemetry (future) -> packages/core
```
No dependency from core to React, DOM, R3F, controls, telemetry provider or Z-Factory. The component catalog can use Three.js in a rendering adapter, but **semantic definitions and graph math must remain render-independent**.

## Canonical future target packages
- `core`: domain models, port transforms, compatibility, connection graph, scene validation and migrations.
- `components`: standard catalog, procedural geometry and asset contracts.
- `renderer-three` (planned): Three.js scene materialization, materials, labels, animations, disposal and picking.
- `editor` (planned): command history, selection, transforms, snapping, interaction state, serialization.
- `react`: React/R3F bindings, `Scada3DEditor` and `Scada3DViewer`.
- `telemetry` (planned): adapter contracts, stale-state derivation and view-model mapping.
- `apps/playground`: R&D examples; never imported from distributable packages.

Current bootstrap combines rendering/editor functionality in `packages/react`. Splitting into target packages is a deliberate roadmap task, not a claim of current state.

## Domain flows
**Editing:** user intent -> validated editor command -> immutable scene update -> deterministic serialization -> renderer projection.
**Viewing:** validated scene + tag observations -> read-only view model -> render state/animation. Telemetry MUST NOT mutate authored topology.
**Control:** not in SDK initial scope. Any future command UI must go through integrator-owned authenticated and audited safety boundary.

## Core invariants
- Stable unique instance IDs; stable port IDs per definition; no dangling edges.
- Connections reference **instanceId + portId**, never mesh UUID or screen pixel location.
- World port transforms apply instance scale/rotation/translation.
- Typed compatibility includes connection kind, size/tolerance, orientation, capacity and direction constraints.
- All scene edits are commands and support undo/redo once editor history is implemented.
- Units and coordinate conventions are explicit: right-handed XYZ, Y-up, metres, radians.
- Rendering state (selection, camera, glass mode) is not authoritative process data.
- All remote observations have timestamps and quality state; reject stale/out-of-order updates per adapter policy.

## Extension contracts
New components provide definition, port metadata, validation, geometry factory/asset, property schema, animation mapper, cleanup and examples. No direct editor modification needed for a new component family.

## Data boundary
Store topology + authored properties in `SceneDocument`; store live telemetry separately keyed by tag binding; store temporary UI state separately. Authoritative scene documents are versioned, validated and migratable before rendering.
