# ADR-0030: Component designer

Status: Proposed (2026-10-23). Owner decisions already taken: Three.js / React Three Fiber, not Babylon.js; designs reach the factory editor as ADR-0022 definitions first, GLB later; Phase 0 (this ADR and the backlog) before any code. The remaining decisions below need owner approval. M10, tasks T-100..T-106 (T-099 is this ADR).

## Context
- **The request** (owner, 2026-10-23, "Babylon.js Component Designer Development Plan"):
  - a Blender-inspired designer for general 3D objects: primitives, transforms, hierarchy, materials, animation, export;
  - industrial meaning (ports, tags, behaviour) as an optional layer on top;
  - the existing editor and viewer unchanged;
  - no PLC, WebSocket, MQTT or OPC UA coupling;
  - bounded, validated assets;
  - non-goals: Blender parity, CAD constraints, CFD, device control.
- **What exists:**
  - **Host component types (ADR-0022, T-071):**
    - a definition is plain data: `parts` (the `GeometryPart` primitives cylinder, sphere, box, bend, cone, lathe, strut, ring), `ports`, `bounds`, `bindable` and optional `parameters` and `symbols`;
    - it renders, snaps, routes, collides and selects like a built-in kind, with no new renderer code;
    - `createComponentRegistry` checks its shape.
  - **The renderer and editor** are Three.js through React Three Fiber and drei (`TransformControls` already in use). The architecture (ADR-0001, ARCHITECTURE.md) names Three.js as the renderer adapter.
  - **glTF import is not implemented:** T-020 (TODO), with its hardening open in T-028.
- **What blocks a designer today:**
  1. **Parts are axis-aligned:** a cylinder runs along x, y or z, and there is no rotation per part.
  2. **No materials per part:** appearance comes from `role` (shell, liquid, flange, …) and the view mode.
  3. **Nothing moves except built-in roles:** the valve handle and ball follow `open`, the liquid follows `level`. A host type cannot say "this shaft turns with speed".
  4. **`Quantity`** has no rotational speed: it covers percent, temperature, boolean and flow.

## Decision

### 1. One engine: Three.js (owner decision)
- **The designer uses three, `@react-three/fiber` and `@react-three/drei`,** which are already dependencies of `@sakibcoolz/react`. Babylon.js is not added.
- **Why:**
  - what the author sees is what the factory editor and runtime draw: same meshes, materials and lights;
  - no second engine bundle (several MB) and no Babylon-to-Three adapter;
  - GLB export uses three's `GLTFExporter` (in `three/examples`, no new package).
- **Kept from the request:**
  - the designer is its own component and canvas, never mounted inside the factory editor;
  - the factory editor and viewer are unchanged unless a task here says so.

### 2. The design document (renderer-neutral)
- **A versioned JSON document, `documentType: "industrial.component"`, `schemaVersion: 1`.** It is separate from scenes, which do not embed it.
  - **`component`:** namespaced `type` (ADR-0022 rules), `label`, optional `description`.
  - **`nodes`:** a tree of groups and parts. Each has:
    - an `id` and a `name`;
    - a local transform: position in metres, rotation as a unit quaternion, scale;
    - a pivot.

    A part also has a `primitive`, its dimensions and a `material` reference.
  - **`materials`:** colour, metalness, roughness, opacity, and an optional `role` that keeps the glass, X-ray and cutaway behaviour.
  - **`ports`**, **`bindable`** and **`motions`**: optional (§5, §6).
  - **`extensions`:** namespaced, as in scene v4.
- **Primitives:**
  - **First:** box, sphere, cylinder, cone, torus (`ring`), lathe, and plane (a thin box). These are the `GeometryPart` shapes, so every design compiles (§3).
  - **Not in the POC:** Booleans and mesh editing (§8).
- **Validation, with the scene rules:**
  - finite numbers, unit quaternions, positive sizes;
  - unique ids, no cycles in the tree;
  - own-key lookups and secret-named keys refused (T-096);
  - bounded counts (§7).
- **Location:** the document types, `validateComponentDocument`, `parseComponentDocument` and `compileDefinition` go in **`@sakibcoolz/components`**. That is where `GeometryPart` lives, and it needs no React or three. No new package until a dependency boundary needs one.

### 3. Designs compile to ADR-0022 definitions (owner decision)
- **`compileDefinition(doc)` returns an `IndustrialComponentDefinition`.** A host passes it to `createComponentRegistry` like any hand-written definition, and the factory editor places it with no other change.
- **To make that possible, `GeometryPart` gains two optional fields:**
  - `rotation`: a unit quaternion applied about the part's `center`;
  - `appearance`: colour, metalness, roughness, opacity.
- **These additions are additive:**
  - existing definitions and built-in kinds are unchanged and render the same;
  - the viewer, editor and runtime honour both fields;
  - views-2d ignores them (it draws symbols).
- **What compiling does:**
  - flattens group transforms into each part, so one part becomes one `GeometryPart`;
  - computes `bounds` from the transformed parts;
  - copies ports, `bindable` and motions.
- **It is lossy:** names, the tree and pivots stay only in the design document, which remains the source for editing.

### 4. The designer UI (`@sakibcoolz/react`)
- **`ComponentDesigner`:** a separate export with its own canvas. It takes a document and an `onChange` callback.
- **Phase 1:**
  - orbit camera;
  - selection and an outliner tree;
  - adding primitives;
  - move, rotate and scale gizmos, plus numeric fields;
  - group, duplicate, rename, delete;
  - undo and redo, with one step per drag (the editor's rule);
  - open and save the JSON document.
- **Phase 2:**
  - parenting and pivot editing;
  - snapping to a grid and to faces;
  - a measure tool;
  - a materials panel.
- **Playground:** `?designer` opens it, and "Add to palette" registers the compiled type in the factory editor of the same page.

### 5. Ports and data (optional industrial layer)
- **Ports:** the author places named ports on the design: id, domain and position/direction (ADR-0023), with flow and signal data where the domain needs them. `compileDefinition` checks them with the existing port validation.
- **`bindable`:** properties that hosts may drive, with their quantity. Hosts bind tags to them through the existing tag bindings and runtime variables (ADR-0024). The designer never names a data source, protocol or address.

### 6. Motions (visual only)
- **A `motion`** is a named clip:
  - a set of node ids;
  - transform keyframes (time, position, rotation, scale), linear or step;
  - a duration and a loop flag.
- **Driver:**
  - `preview`: designer only;
  - a bindable property:
    - `boolean`: plays while true;
    - `speed`: scales the playback rate.
- **New quantity:** `Quantity` gains `speed`, rotational speed in rev/min with rpm and rev/s conversions. This is an additive union change, listed in UPGRADING like the 0.2 unions.
- **Bad or missing values:**
  - an unknown, stale or simulated value shows as it does today: status and SIMULATED labels;
  - an unknown value **stops** the motion. A motion never suggests a machine is running when the value is not trusted.
- **Compiled definitions carry `motions`.** The viewer and runtime play them, and only for property drivers.

### 7. Limits
Refused when exceeded, with a code, like scene limits:
- 500 nodes per design;
- 32 motions;
- 2,000 keyframes per design;
- 64 ports;
- a 4 MB document.

GLB limits are set in T-105 and T-020.

### 8. Later, each needing its own decision
- **GLB export:** the compiled parts plus motions as glTF animations, with a JSON sidecar for ports, `bindable` and type identity. glTF alone cannot round-trip the design tree, ports or bindings: the design document stays the source.
- **GLB import into the factory editor:** this is T-020 (provenance, resource limits, disposal), hardened under T-028.
- **Booleans** (for example `three-bvh-csg`) and **mesh editing:** a new dependency, so a separate ADR. Not in the POC.
- **Free-form meshes in definitions** (a `mesh` part that references an imported GLB): after T-020.

## Consequences
- **No new runtime dependency** for Phases 1–3 and 5.
- **The POC reaches the factory editor early,** with no glTF in between, because definitions already render.
- **`GeometryPart` and `Quantity` grow additively.** Exhaustive code over `Quantity` needs a case; the upgrade notes say so.
- **The designer's primitive set is bounded by `GeometryPart`.** Shapes outside it wait for §8.
- **The design document is a second document type** to version, validate and migrate.

## Alternatives considered
- **Babylon.js designer, as in the request.** Rejected by the owner (2026-10-23):
  - two engines;
  - an adapter, with possible visual differences between designer and runtime;
  - a large new dependency.
- **GLB plus a JSON sidecar as the first path into the factory editor.** Deferred by the owner: it needs T-020 first, and loses ports and bindings without a sidecar anyway.
- **New packages `component-document`, `designer-babylon`, `asset-gltf` and `behavior`.** Not now:
  - the document lives in components and the UI in react;
  - behaviour is the motion model in §6;
  - glTF stays with T-020 in asset-import.

## Decisions to approve
1. **Document format:** a separate `industrial.component` v1 document (§2), with its home in `@sakibcoolz/components`.
2. **`GeometryPart` additions:** optional `rotation` and `appearance` (§3).
3. **Motions:** clips driven by bindable properties, a new `speed` quantity, and an unknown value stops the motion (§6).
4. **Limits:** the values in §7.
