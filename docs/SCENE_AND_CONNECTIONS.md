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
The version 2 shape is implemented ([ADR-0004](adr/0004-scene-document-v2.md), accepted), including optional `tagBindings` ([ADR-0006](adr/0006-tag-bindings-in-scene.md), accepted): `{ id, tagId, kind: 'property', instanceId, property, unit? }` or `{ id, tagId, kind: 'flow', connectionId, unit? }`. Validation checks unique ids, existing targets, bindable property per catalog type (`resolveBindable`), accepted units, and one binding per target (`UNKNOWN_CONNECTION`, `UNBINDABLE_PROPERTY`, `INVALID_UNIT`, `DUPLICATE_BINDING_ID`, `DUPLICATE_BINDING_TARGET`). `removeComponent` and `disconnect` drop bindings to removed targets; serialization omits the field when absent.

## Scene file example (version 3, ADR-0007)
```json
{
  "schemaVersion": 3,
  "units": "m",
  "components": [
    {
      "id": "tank",
      "type": "tank",
      "position": { "x": 0, "y": 1.535, "z": 0 },
      "rotation": { "x": 0, "y": 0, "z": 0, "w": 1 },
      "scale": { "x": 1, "y": 1, "z": 1 },
      "properties": { "level": 60 }
    }
  ],
  "connections": [],
  "tagBindings": [{ "id": "b1", "tagId": "LT-101", "kind": "property", "instanceId": "tank", "property": "level" }]
}
```
(`serializeScene` writes the same content with one key per line.) Version 3 requires named objects: arrays, missing or non-finite axes are `INVALID_FIELD`, extra axes are `UNKNOWN_FIELD` (e.g. `components[0].position.w`). Version 2 files with arrays still load and report `migratedFrom: 2`.

## Current runtime validation (T-003; version 2 since T-005, version 3 since T-030)
`validateScene(input, { resolvePorts, resolveBindable?, limits? })` in `@scada3d/core` validates a scene and returns it in the version 3 model (`schemaVersion: 3`, `units: 'm'`, components with `type`, `position {x,y,z}`, unit-quaternion `rotation {x,y,z,w}`, `scale {x,y,z}`, `properties`). Version 2 input (array vectors) migrates with `migratedFrom: 2`; version 1 input (`version: 1`, `kind`, Euler XYZ radians, no scale) migrates with `migratedFrom: 1` (Euler XYZ → quaternion, `kind` → `type`, scale `{1,1,1}`). Errors use the input's own field names. The caller supplies `resolvePorts` (e.g. from `componentCatalog`) because core does not import the catalog.
- Rotation must be four finite numbers (`x, y, z, w`) with length within 1e-6 of 1 (never renormalised). Scale must be three positive finite numbers. **Scale policy:** components whose type has ports must keep scale `{ x: 1, y: 1, z: 1 }` (`UNSUPPORTED_SCALE`), because scaling would move ports and break the nominal bore; portless types may scale.
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
`portToWorld(component, port)` in `@scada3d/core` returns `{ id, position, direction }` in world space. The local port position is scaled, rotated by the component quaternion about its origin, then translated by `component.position`; the direction is divided by the scale (normal transform), normalised and rotated. Quaternion helpers live in `quaternion.ts` (`rotateVector`, `quaternionFromEuler`/`quaternionToEuler` for intrinsic XYZ, `quaternionFromUnitVectors`, `multiplyQuaternions`) and match Three.js; a test in `packages/react` checks every catalog port against Three.js `Object3D`. No nested transforms. A zero-length port direction throws.

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
- `snapComponent` takes the first `ok` candidate and returns the moving component's new `position` and `rotation` (unit quaternion) plus the `from`/`to` endpoints, or `NO_CANDIDATE` with the nearest rejected candidate for preview messages. The rotation is the smallest turn that makes the normals oppose, so roll about the port axis is kept; a half turn prefers the world Y axis. The target component never moves.
- Not done here: committing the edge and undo (T-008/T-011), preview UI and Escape cancel (T-010), collision checks.

## Current graph operations (T-008)
`packages/core/src/graph.ts`. All functions are pure and return a new scene (`{ ok: true, scene }`) or `{ ok: false, error: { code, message } }`; the input is never mutated.
- `connect(scene, { id, from, to }, options)` validates the candidate scene with `validateScene`, so edge rules have one source of truth. The caller supplies the edge id. The input scene must already be valid; errors about the new edge are reported first.
- `disconnect(scene, connectionId)` (`UNKNOWN_CONNECTION` if absent) frees both ports.
- `removeComponent(scene, instanceId)` removes the component and every edge on either side (`UNKNOWN_INSTANCE` if absent). The editor's Remove button uses it.
- `connectionsOf`, `reachableComponents` (direction-agnostic, breadth-first in connection order) and `connectedGroups` (disconnected networks, ordered by first component). Traversal is iterative: cycles terminate and a 5,000-component chain is tested.
- Not done here: undo/redo (T-011), route regeneration (T-009).

## Routing
Distinguish logical edge from render mesh. Support straight runs and deterministic orthogonal elbows; tee is a 3-port junction node, not merely crossing meshes. Document pipe diameter, bend-radius constraints and clearance; never imply collision-free CAD-grade auto-routing without collision tests.

## Current routing (T-009)
`routeConnection` / `routeScene` in `packages/core/src/routing.ts` derive a `PipeRoute` per connection from world ports; routes are never persisted.
- `direct`: ports coincide (zero length, no pipe). `straight`: normals opposed and the target lies straight ahead, at any angle. `orthogonal`: leave each port along its normal by the bend radius, then axis-aligned runs. All six axis orders are tried; the fewest bends wins, ties go to the first order (x, y, z first). Routes that double back are rejected.
- Bend radius defaults to 0.3 m (2 × DN150, same as the catalog elbow). Every straight touching a bend must be at least one radius long per bend it touches.
- Failures: `UNRESOLVED` (missing component/port), `UNSUPPORTED_ORIENTATION` (off-axis port that is not a straight run), `UNROUTABLE` (every order doubles back), `BEND_TOO_TIGHT`. Invalid routes keep the port anchors so the viewer draws a dashed red line instead of pipe.
- `length` is the polyline length through the corners, not the arc length.
- The React viewer renders routes with `createRouteGeometries` (trimmed straights plus quarter-torus bends) and disposes them when the centreline changes or unmounts. `/?demo` in the playground loads a validated tank → valve → pipe → tee network with two branches.
- Not done: obstacle avoidance, collision checks, custom waypoints, non-axis-aligned orthogonal routing.

## Editor palette drop (T-010)
`packages/react/src/drop.ts`, wired into `Scada3DEditor`.
- `screenToPlane` casts a ray from the R3F camera through the pointer onto the plane y = 0 (configurable in the function, fixed at 0 in the editor). `dropPosition` rests the component's catalog bounds on that plane.
- While dragging a palette item over the canvas, `planDrop` runs `snapComponent` (0.5 m reach, 45° tolerance) and the viewer shows a ghost at the planned transform plus a green marker on the target port, or a red marker on the nearest rejected port. A status line (`role="status"`) shows `describeDrop`: what will connect, why it cannot, or where it lands.
- On drop, `applyDrop` adds the component and, if it snapped, its connection via `connect`, validated as one change. Escape (native drag cancel) or leaving the canvas clears the preview without changing the scene.
- Click-to-add from the palette is kept for keyboard use: it rests the component on the ground in a row and never auto-connects.
- Not done: drop onto surfaces other than the ground plane.

## Editor history and gizmos (T-011)
- `packages/react/src/history.ts`: immutable snapshot history (`createHistory`, `commit`, `undo`, `redo`, `canUndo`, `canRedo`), bounded to 100 steps. Undo returns the exact earlier scene object. A `commit` with the same `mergeKey` as the previous commit replaces it, so one gesture (gizmo drag, slider move, typing in a position field) is one undo step; undo clears the merge key and any commit clears redo.
- Every editor change goes through history: click-add, drop (component and snapped connection together), remove (component and its edges together), property edits, position fields and gizmo transforms. Undo/Redo buttons and Ctrl+Z, Ctrl+Shift+Z, Ctrl+Y; shortcuts are scoped to the editor element and ignored while typing in a field. Selection clears if undo removes the selected component.
- Gizmos: drei `TransformControls` on the selected component, Move or Rotate. Orbit is disabled while dragging (drei default-controls handling). Rotation snaps to 90° in world space so ports stay on world axes for orthogonal routing; movement snaps to 0.05 m. Routes are derived, so they follow moved components immediately (invalid ones show as dashed red).
- Assemblies (T-040, ADR-0008): "Lock connected as children" makes the selected component a parent and locks every component connected to it as a child (`parentId`, saved in the file; positions stay world coordinates). Locked is rigid: moving or rotating any member (gizmo, keyboard, position fields, rotation form) moves the whole assembly, so joined ports stay joined. "Unlock from parent" frees one child; "Unlock assembly" frees all children of a parent; removing a parent frees its children. The "In scene" list shows children indented under their parent. Invalid parents are rejected on import (`UNKNOWN_PARENT`, `PARENT_CYCLE`).
- Copy and paste (T-041): **Copy component** (Ctrl+C) copies the selected part; **Copy assembly** (Ctrl+Shift+C, shown for assembly members) copies the parent and all its children. **Paste (N)** (Ctrl+V) adds the copy with new ids beside the original, shifted along +X by the copy's width plus 0.5 m (further on each repeated paste), as one undo step, and selects the pasted root. Copied: properties, rotation, connections between copied parts, parent links among copied parts (a child copied alone becomes standalone). Not copied: tag bindings (a copy must not show another part's live value) and connections to parts outside the copy. The clipboard is an in-editor snapshot taken at copy time. Copying works while editing is locked; pasting does not. Core: `copyComponents`, `pasteComponents`, `clipboardWidth`.
- Layout (fixed in T-040): the editor grid keeps a fixed row height and both side panels scroll, so a long properties panel can no longer stretch the 3D view beyond the window (found when a drop target fell off-screen).
- Connect touching ports (T-039): connections are never inferred from positions (ADR-0002), but the editor's **Connect touching ports (N)** button turns exact matches into explicit connections in one undo step. `findTouchingPorts(scene, { resolvePorts, tolerance?, maxAngle? })` (core) matches ports of different components whose centres are within 1 mm and whose facing directions are opposite within 1°, using a spatial hash. Pairs already connected to each other are skipped silently. Pairs with a type/bore mismatch (`incompatible`), a port used by another connection (`occupied`) or a port touching more than one candidate (`ambiguous`) are reported in `rejected` and listed in the editor note (at most five, then "…and N more"), never joined. `connectTouchingPorts` appends the matches and validates the result; running it again adds nothing. `from` is the endpoint whose instance id sorts first, so it fixes only the sign convention of flow readings, not a flow direction. The button is disabled while editing is locked.
- Connection message (T-043): when the user connects parts (a drop that snaps onto a port, or **Connect touching ports**), a green message at the bottom of the canvas names each new joint ("Ball Valve 2 \"in\" connected to Ball Valve 1 \"out\".", at most five, then "…and N more connections."). When one side belongs to an assembly and the other does not, it says the loose part is not locked to that assembly yet; when two assemblies are joined, it says they still move separately. **Lock connected as children** shows "X is now the parent of N components…". The message can be dismissed and clears itself after 6 s. It is not shown for undo/redo, import or paste, and it never changes the scene: joining an assembly still needs the explicit lock (ADR-0008).
- Open joints (T-044): an explicit connection stays in the scene when its parts are later moved, turned or typed out of place. `findOpenJoints(scene, { resolvePorts, tolerance?, minRunLength?, routes? })` (core) reports connections whose ports are not joined (more than 1 mm apart or more than 1° off facing) **and** cannot be drawn as a sensible pipe: the route is invalid (`unroutable`), or the routed run is shorter than `minRunLength` (default 0.2 m, the shortest pipe; `too-short`). Deliberate routed pipe runs, such as those in the demo plant, are not reported. Each result carries `distance` and `angle`. Viewers and the editor mark both ends in amber and list the joints at the top of the canvas (at most five), below any collisions; `openJoints={false}` turns this off. `seatOnConnection(scene, connectionId, instanceId, { resolvePorts })` moves that part so its port sits exactly on the partner port, facing it: the smallest turn, then the quarter-turn roll about the port axis that best fits the part's other connections. When the partner is in the same assembly only this part moves; otherwise its whole assembly moves (ADR-0008). The editor shows **Seat on <part> "<port>"** for each open joint of the selected part (one undo step, disabled when locked) and reports "Seated … (moved 15 mm)". Nothing is connected, disconnected or moved automatically.
- Pipe sizes and fittings (T-045, ADR-0009): ports join only at the same `nominalSize` (`portsCompatible`; `INCOMPATIBLE_PORTS` on validation, `incompatible` when snapping or touching). Sized parts store `properties.size` (DN50–DN200, absent = DN150). To change size along a line, put a **reducer** between (its `in` is `size`, its `out` is `outletSize`); a **coupler** fills a short gap along the line between equal ends. The editor refuses a size change that would leave a connection between different sizes and says which joint blocks it. A part dropped near a port of another size takes that size when it has a size choice (a reducer resizes the end that snaps), then snaps as usual. Routed runs and flow beads are drawn at the size of their ports.
- Edit lock (T-038): "Lock editing" puts the editor in view-only mode. Locked: palette add and drop, gizmos, keyboard move/turn/delete, every property and tag-binding field, Remove, Undo/Redo and Import are disabled, and the editor's single update path refuses changes anyway. Still available: orbit/zoom, selection (canvas and "In scene" list), View mode and Component view, live telemetry and flow, Export JSON. A "🔒 Editing locked" badge shows on the canvas. `Scada3DEditor` props: `defaultLocked` (initial state) or controlled `locked` + `onLockedChange`; the lock is display state and never saved. Playground: `?locked`.
- Pipe length (T-033): pipes store `properties.length` in metres (default 2, 0.2–20). The properties panel shows "Length (m)"; values outside the range are explained and not applied. When the length changes, one end stays put: the connected end if exactly one end is connected, otherwise the inlet; the other end moves, and routes, snapping and collisions follow. Scene files with an out-of-range length are rejected with `INVALID_PROPERTY` (`components[i].properties.length`).
- Rotation form (T-032): every selected component shows "Rotation (degrees)" X/Y/Z fields (Euler XYZ, applied X then Y then Z like Three.js, shown to 0.01°), −90/+90 buttons that turn about the world axis, and "Reset rotation". Typing in one field is one undo step; each button press is one step. Any angle is allowed; if a connected port ends up off the world axes, its route shows the dashed red "unsupported orientation" line (rotation is never blocked).
- Keyboard alternative (T-023 part C): the "In scene" list selects any component with the keyboard. With a component selected and focus in the editor (not in a text field): arrows move 0.1 m in X/Z (Shift: 1 m; Up = −Z), PageUp/PageDown move in Y, R/Shift+R turn ±90° about world Y, Delete/Backspace removes, Escape deselects. Repeated presses of one key are one undo step. After a removal focus returns to the editor so shortcuts keep working.
- Not done: re-snapping or blocking a transform that leaves a connected port misaligned (routes show it instead), scale gizmo (scale policy forbids scaling parts with ports), multi-select.

## Solid-body collisions (T-031, default on)
- Components are solid: `findCollisions(scene, { resolveBounds, tolerance? })` in `packages/core/src/collision.ts` treats each component as its catalog bounding box placed by position, rotation and scale (an oriented box), and reports pairs that overlap by more than `tolerance` (default 1 mm) on all 15 separating axes. Touching faces, such as parts joined at a port (ports lie on bounds faces), never count. A sweep along X skips pairs whose world boxes are disjoint; results are sorted by id.
- Conservative: hollow or curved parts count as their full box (an elbow's inside corner, a tank's rounded side). Routed pipes are not checked.
- `Scada3DViewer`/`Scada3DEditor` have `collisions` **on by default**: colliding shells turn red (`#e5484d`), an overlay ("Collisions") lists pairs by display name in scene order, and while dragging from the palette the ghost turns red and the status line adds "— overlaps …". Nothing is blocked (the owner chose highlight-only) and nothing is saved. Hosts pass `collisions={false}` to turn it off; the playground shows this with `?collisions=off`.

## Serialization (T-005)
`serializeScene(scene)` writes canonical JSON: `schemaVersion: 3` and `units` first, vectors as objects in `x, y, z(, w)` order, fixed key order for every object, property keys sorted, array order preserved, two-space indent, trailing newline. Only authored fields are written, so save → load → save is byte-identical. `parseScene(text, options)` checks length (`maxLength`, default 10,000,000 characters, `LIMIT_EXCEEDED`), parses (`INVALID_JSON`), then runs `validateScene`, which migrates version 1.

### Editor import/export (T-012)
- **Export JSON** downloads `scene.json` with exactly `serializeScene(scene)`; the Scene JSON panel shows the same canonical text.
- **Import** from a `.json` file (rejected above 10,000,000 bytes before reading) or pasted text (**Load text**). `importSceneText` in `packages/react/src/sceneFile.ts` runs `parseScene` against the catalog ports, so version 1 migrates and every rule in validation applies. On failure the errors are listed (`role="alert"`, path first, capped at 20 lines) and the current scene is unchanged; on success the scene is replaced as one undo step, selection clears and a note reports the counts and any migration.
- The browser test builds a connected scene with a gizmo-rotated pipe, exports it, reloads the page, imports the downloaded file and checks the JSON is byte-identical, then undoes the import.
- Not done: reference checks are reported only after structural errors are fixed (validator behaviour); no merge/append import; no remote URLs (by design, no network).

Save authored scene only. Validate on load, reject/diagnose corrupt references, migrate supported versions, round-trip deterministically, avoid using React/Three objects or telemetry stream values in JSON.

## Required tests
Invalid/missing port; wrong type; wrong diameter; occupied port; face orientation; transform with rotation; tee 3-way split; cyclic graph; delete component cascade; scene JSON round-trip; undo/redo.
