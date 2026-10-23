# Master Implementation Plan — 3D SCADA SDK

**Status:** implementation blueprint, not completed feature claim. **Owner:** repository maintainers. **Authority:** AGENTS.md and accepted ADRs. Review this file whenever scope or dependency order changes.

## Target and success demonstration
Publish a reusable framework-neutral industrial 3D scene/core SDK plus a React editor/viewer. In the playground, a designer must drag a tank, valve, straight pipe and T-junction onto a 3D work plane; snap compatible ports; automatically route an explicit graph; save/reload topology; undo/redo operations; use rotation gizmos; toggle glass/X-ray; simulate flow, fill and heat; optionally import SVG references and receive quality-tagged *read-only* live telemetry. Integrator can consume the SDK without Z-Factory.

**Correctness boundary:** a real valve being open does not prove water is flowing. Visualization uses explicit measured or labeled simulated flow values. Full CFD is not part of the MVP and must not be described as implemented.

## Architecture and package trajectory
Core domain -> typed graph -> routing -> editor commands -> Three renderer/React adapter -> visual flow -> telemetry. Scene topology, rendering state, observed live values and optional simulated state are separate stores. Preserve right-handed Y-up metres/radians; semantic core cannot import React/Three/WebGL/DOM. Actual package split occurs when a working vertical slice justifies it.

Target modules (not current implementation claims): `packages/core`, `packages/components`, `packages/connection-engine`, `packages/pipe-routing`, `packages/renderer-three`, `packages/editor`, `packages/flow-animation`, `packages/simulation`, `packages/asset-import`, `packages/telemetry`, `packages/react`. Shared schemas should be single-source, not copied across packages.

## Dependency roadmap

| Gate | Deliverables | Dependencies | Objective acceptance gate |
|---|---|---|---|
| M0 Foundation validation | reproducible pnpm install, typecheck, build, CI, basic browser smoke | existing scaffold | new checkout works; results logged, no falsely green status |
| M1 Canonical scene/domain | versioned validated document; typed ports; world transforms; graph operations; migrations | M0 | bad IDs/edges rejected, transform math and roundtrip fixtures pass |
| M2 Industrial geometry | configurable tank, pipe, elbow, tee, valve with bounds, ports and disposal | M1 | port/geometry alignment, mesh/material lifecycle and visual fixtures pass |
| M3 Connections + routing | snap and unsnap, explicit graph, straight/orthogonal routes, tee branches, clearance limits | M1,M2 | save/reload keeps edges; reject incompatible/double-booked ports; branch/cycle tests pass |
| M4 Editor + persistence UX | canvas raycast drop, selection, move/rotate/scale gizmos, command undo/redo, import/export | M3 | E2E edit/undo/redo/rotate/reload reproduces same topology |
| M5 Visual process runtime | measured or simulated fill, valve state, flow direction, heat indication, glass/X-ray/cutaway | M3,M4 | flow respects data quality, direction and valve scenario; rendering assertions pass |
| M6 Host-driven observations | optional DataProvider contract and setTagValues; host-only integration examples | M5 | editor/viewer work without sockets; snapshot, subscription cleanup, stale/out-of-order tests pass |
| M7 Assets, advanced simulation and hardening | SVG authoring converter, glTF ingestion, optional engineering network simulation, perf/security/API hardening | M0–M6 | golden asset fixtures; simulation checked against known balance equations; published consumer example builds |
| M7 MVP gate (T-023) | MVP perf baseline, security, accessibility, public API hardening | M0–M6 MVP-critical tasks (T-002, T-015, T-017) | named benchmark scenes measured; security and a11y checks pass; public exports reviewed |
| M8 Packaging and external adoption | versioned SDK, declarations, exports, sample host apps, migration docs | M7 MVP gate (T-023); asset import and simulation are not required | independent React app uses package, scenes migrate, clean release checks pass |
| M10 Component designer (ADR-0030) | design document, `ComponentDesigner`, compile to host definitions, ports and bindable, motions, GLB export | M9 (0.2.0), T-020 for GLB import | a design made in the designer is placed, connected, bound and animated in the factory editor; existing kinds render unchanged; no new runtime dependency |

M7 physics scope is **simplified fluid network / mass-balance simulation** (optional, bounded) and **optional rigid-body interactions**. Real water-fluid dynamics / CFD is a distinct future research program requiring validated solvers, material properties, boundary conditions, engineering review and performance budgets; do not promise it in M8.

## Detailed feature implementation tracks

### A. Port-to-port snapping / persistent connection editor — M1,M3,M4
1. Define stable component instance ID, port ID, port type/direction/nominal bore, max connections and transform in canonical schema.
2. Calculate world positions and normals using composed translation + quaternion rotation + scaling (document nonuniform scaling policy). Pure-function tests for 90/180 degree rotations, nested transform fixtures.
3. Maintain an explicit validated connection graph, including tees, cyclic paths, deletions and occupancy.
4. While dragging, query nearby candidate ports with spatial index (start linear for small scenes). Filter by type/bore/occupancy/orientation; deterministic nearest candidate and visible valid/invalid preview.
5. Snap by solving the dragged component transform so anchors coincide and normals oppose; transactionally create graph edge. Escape cancels without mutation; disconnect is undoable.
6. Persist the edges in schema JSON and add load/undo/redo regression tests.

**Failure cases:** incompatible domain, missing ports, duplicate edge, full port, malformed rotation, no candidate, deleted instance; graph stays unchanged and an actionable error appears.

### B. Auto pipe routing — M3
- Logical connection edges are separate from pipe meshes. Start with deterministic straight segments and right-angle routing with configurable waypoint, minimum bend radius, bore and alignment.
- Generate elbows as actual curved fittings and tee branches as 3-port nodes, not visually overlapping independent cylinders.
- Update routes as connected equipment moves; route validity/collision diagnostics shown. A* occupancy-grid/obstacle avoidance is advanced follow-up only after regression fixtures.
- Unit tests cover parallel/opposite ports, branch, crossed levels, cycles, impossible bend constraints, zero-length route and deterministic re-routing.

### C. Process flow animation / visual water — M5
- Build a flow-state resolver from topology + per-edge observation or *explicit* simulation output. Infer no physical flow solely from valve open state.
- Map signed flow rate/direction to repeating shader texture movement or GPU instanced particles along sampled pipe centerlines (LOD enabled); pause for zero, bad or stale readings.
- Maintain coherent visual state at junction branches; unknown branch distribution shown as unknown, not fabricated.
- Tank fluid mesh follows level or bounded simulator state; thermal tint/heat shimmer is a display metaphor, not thermodynamic physics.
- Tests cover reverse/zero/unknown flow, valves, branches, stale and reconnect; establish GPU/memory baseline.

### D. Scene import, editing, history and gizmos — M1,M4
- Strict runtime JSON schema: schemaVersion, units, instances, explicit edges and authored settings. Reject invalid/oversized files; supported-version migrations and stable export ordering.
- Command interface `execute/undo/redo` for add, remove, translate, rotate, scale, connect, disconnect and property update; group drag operations into one history entry.
- Raycast actual drop coordinates into configurable ground/attachment plane (not incrementing predetermined X). Implement `TransformControls`; disable camera orbit during manipulation, snap to grid optionally and keep ports aligned.
- Scene visual state (selected item, camera, materials) is independent from authored process data. Browser E2E must roundtrip a rotated connected assembly after undo/redo.

### E. Physics and engineering process simulation — research M7
- MVP simulator: deterministic, fixed-step volume balance `dV/dt = Qin - Qout`; simple head/pressure network (requires explicit assumptions), valves/pump curves and boundary conditions; validate conservation and nonnegative volume.
- Never conflate model-predicted with PLC-measured values. Use unmistakable SIMULATED badge/watermark, switchable source, quality/timestamp metadata.
- Advanced 3D rigid bodies may use a physics engine **only** for mechanical editor simulation. Full CFD requires separate ADR, specialized engine, solver comparison and safety disclaimers.
- Tests: closed valve, tee split known rates, reverse flow, tank overflow/empty protections, timestep stability, conservation tolerances.

### F. SVG conversion and industrial asset pipeline — M7
- SVG importer parses paths under controlled restrictions; supported flat path extrusion, lathe/revolve templates and user-assisted mapping to procedural equipment. A 2D SVG cannot automatically reconstruct true hidden 3D geometry.
- Sanitization: no scripts, foreignObject, active external references or unsafe URI loading; licensing/provenance manifest.
- Normalize bounds, metres, axis and pivot; define port placement separately from visual SVG. GLB/glTF loader for complex licensed 3D assets with geometry validation and disposal.
- Golden image/model fixtures, malformed-file tests, resource limits, predictable fallback to original 2D reference.

### G. Live PLC data adapters — M6
- SDK transport-independent input consumes typed observations: `tagId`, `value`, `unit`, `quality`, `sourceTimestamp`; handles start/stop/reconnect/disposal.
- The SDK does **not** require or open WebSocket/MQTT/OPC UA connections. The host supplies observations through an optional provider, external state binding, or push API such as `setTagValues`. Separate host application examples may source data from REST, WebSocket, MQTT or an OPC UA backend bridge; those transports remain outside the SDK package.
- Map tags to component properties and alarms; stale/out-of-order states visibly indicated. Bound render/update frequencies and support unsubscribe/dispose. Verify standalone offline operation; host owns all network transport and authorization.
- No PLC write path in the SDK. Future industrial control requires dedicated ADR + safety engineering and is not authorized by this plan.

## Estimation and sequencing
Planning ranges for one experienced full-time engineer using AI assistance, not delivery promises: foundation/domain 1–2 weeks, snapping+graph 2–3, routing 2–3, editor/history 2–3, visual animation 2–3, telemetry/asset import 2–4 each, simplified simulator 3–5, hardening/release 2–4. Actual schedules require measurement following M0. Independent workstreams can overlap after upstream contracts have tests and approved ADRs.

## Agent release gates
For every task: update TASK_BACKLOG.md status + PR; contract/fixtures; unit or E2E tests; lint/typecheck/build; explicit observed results in WORK_LOG; update public docs; security/perf impact; failure and rollback path. No milestone considered complete until all critical tasks accepted with evidence. Do not skip forward to eye-catching animations before graph correctness.
