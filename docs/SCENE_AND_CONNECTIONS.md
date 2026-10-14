# Scene schema and connection-engine specification

## Units and coordinates
Right-handed 3D, Y-up; scene translation and dimensions in metres; rotations in radians; local port normals point out from equipment. Display conversion (litres/°C/kPa) must be explicit. Scene IDs persist between sessions.

## Data model
```ts
SceneDocument {
  schemaVersion: number;
  units: "m";
  components: ComponentInstance[];
  connections: ConnectionEdge[];
  tagBindings?: TagBinding[];
}
ConnectionEdge {
  id: string;
  from: {instanceId:string;portId:string};
  to: {instanceId:string;portId:string};
}
```
This is **target schema**, not necessarily current code. The v2 shape is proposed in [ADR-0004](adr/0004-scene-document-v2.md) and is not adopted.

## Current runtime validation (v1, T-003)
`validateScene(input, { resolvePorts, limits? })` in `@scada3d/core` validates the current `ScadaScene` (`version: 1`, Euler XYZ rotation in radians, no scale). The caller supplies `resolvePorts` (e.g. from `componentCatalog`) because core does not import the catalog.
- Returns `{ ok: true, scene }` with a fresh copy, or `{ ok: false, errors }` with typed `{ code, path, message }` errors in input order. Input is never mutated or repaired.
- Structure first: object root, `version === 1`, required arrays, non-empty ids, three finite numbers for position/rotation, property values limited to string/boolean/finite number. Unknown fields are rejected (`UNKNOWN_FIELD`), not dropped.
- References only after structure is valid: unique component and connection ids, known component kind, endpoints resolve to an existing instance and declared port, no self-connection, `portsCompatible` domain and bore, one connection per port (`PORT_OCCUPIED`), no repeated pair in either direction (`DUPLICATE_EDGE`). Tees and loops are valid.
- Default limits (`defaultSceneLimits`): 10,000 components, 20,000 connections, 128-character ids, 64 properties per component, 1,024-character strings.
- Not yet checked: port normal alignment and world-space proximity (T-007), per-port capacity other than one, per-kind property schemas.

## Invariants
- Instance IDs and edge IDs unique.
- Every endpoint references a present instance and declared port.
- Compatible physical domains (fluid/electrical/signal/mechanical) and nominal size rules.
- Ports with single-connection capacity cannot be used twice.
- Port normals align within tolerance and must face appropriately before auto-snap.
- Graph supports tees, loops, branches and disconnections; cycles do not cause traversal recursion failures.
- World endpoint positions derived by composing local port transforms with component transforms.
- Geometry and adjacency stay synchronized under move/rotate/undo/redo.
- Invalid input yields typed validation error; never silently mutate graph.

## World-space ports (T-004)
`portToWorld(component, port)` in `@scada3d/core` returns `{ id, position, direction }` in world space. The local port position is rotated about the component origin and then translated by `component.position`; the direction is normalized and only rotated. `rotateVector(v, rotation)` uses intrinsic Euler XYZ (matrix Rx · Ry · Rz, Z applied first), identical to Three.js `Euler(x, y, z, 'XYZ')` used by the renderer; a test in `packages/react` checks every catalog port against Three.js. v1 has no scale or nested transforms. A zero-length port direction throws.

## Snap algorithm target
1. Raycast dragged component/port into scene.
2. Find candidate free compatible target ports by world-space proximity.
3. Evaluate domain, nominal size, orientation and occupancy.
4. Choose deterministic nearest eligible candidate within configurable tolerances.
5. Solve component transform to align port anchors/normals without shifting already anchored components.
6. Commit explicit edge through command transaction; recompute pipe route; emit undo record.
7. On failure preserve scene exactly and show actionable reason.

## Current snapping (T-007)
`findSnapCandidates(scene, moving, options)` and `snapComponent(scene, moving, options)` live in `@scada3d/core` (`snapping.ts`) until a `connection-engine` package is justified. Both are pure and never modify the scene.
- Candidates are all pairs (moving port, other component's port) whose world anchors are within `maxDistance` (default 0.5 m), sorted by distance, then target instance id, target port id, moving port id. A scene component with the moving component's id is skipped (it is the one being dragged). Linear search; a spatial index is deferred until scenes need it.
- Status per candidate, checked in this order: `incompatible` (`portsCompatible` domain/bore), `occupied` (either port already in a connection), `misaligned` (moving normal more than `maxAngle`, default π/4, from the reversed target normal), else `ok`.
- `snapComponent` takes the first `ok` candidate and returns the moving component's new `position` and `rotation` (Euler XYZ) plus the `from`/`to` endpoints, or `NO_CANDIDATE` with the nearest rejected candidate for preview messages. The rotation is the smallest turn that makes the normals oppose, so roll about the port axis is kept; a half turn prefers the world Y axis. The target component never moves.
- Not done here: committing the edge and undo (T-008/T-011), preview UI and Escape cancel (T-010), collision checks.

## Routing
Distinguish logical edge from render mesh. Support straight runs and deterministic orthogonal elbows; tee is a 3-port junction node, not merely crossing meshes. Document pipe diameter, bend-radius constraints and clearance; never imply collision-free CAD-grade auto-routing without collision tests.

## Serialization
Save authored scene only. Validate on load, reject/diagnose corrupt references, migrate supported versions, round-trip deterministically, avoid using React/Three objects or telemetry stream values in JSON.

## Required tests
Invalid/missing port; wrong type; wrong diameter; occupied port; face orientation; transform with rotation; tee 3-way split; cyclic graph; delete component cascade; scene JSON round-trip; undo/redo.
