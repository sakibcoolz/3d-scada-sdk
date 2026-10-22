# MVP Definition — 3D SCADA SDK

**MVP release target:** independently installable React viewer/editor over a framework-neutral scene/graph core. **Status:** MVP delivered and published as 0.1.x (see TASK_BACKLOG and WORK_LOG for evidence); post-MVP work continues under M7 and M9. **Source of execution:** `docs/DEVELOPMENT_PLAN.md` + `docs/TASK_BACKLOG.md`. This document is a **scope/acceptance contract**, not a second backlog.

## 1. MVP vision

A user opens a 3D workspace, drags industrial components, snaps ports into a connected pipe network, saves the scene, reloads it, changes values from local/host-provided data, and sees directional flow and transparent liquid levels. SDK must be reusable by other apps and operate **without a WebSocket, MQTT broker, PLC, backend or internet**.

## 2. Scope boundaries

### MVP must have
1. **Core:** strict TS contracts, stable scene IDs, schemaVersion, validated import/export, units, rotation/scale policy, graph schema and deterministic serialization.
2. **Component catalog:** vertical tank, ball valve, straight pipe, 90° elbow, 3-port tee, minimal pump/motor/sensor models; component origin/bounds/ports and configurable dimensions.
3. **Connection editor:** typed inlet/outlet/branch ports, compatibility/occupancy checks, visible snap previews, transactional graph edges, disconnect/delete behavior and persistence.
4. **Pipe routing:** straight and deterministic orthogonal paths with bends; tee route shows genuine branch, diagnostics for invalid/unroutable cases.
5. **3D editing:** 3D canvas drop at pointer location, orbit/zoom, selection, move/rotation gizmos, properties and undo/redo.
6. **Visualizations:** tank level 0–100%, valve open/closed appearance, directional animated flow on known rate, reversible flow, zero/unknown/stale indications; normal/glass mode and basic X-ray/cutaway if supportable without misrepresenting internals.
7. **Host data boundary:** static/offline updates, optional snapshot/imperative push or host-provided subscriber, timestamp/quality mapping. **No socket/network dependency in SDK.**
8. **Productization:** standalone playground, consumer app example, typed package exports, build/test pipelines, reference docs and licensing checks.

### Post-MVP / research (NOT release blockers unless separately approved)
- Full SVG symbol conversion to physically accurate complex equipment; limited safe extrusion/reference in later asset milestone.
- CFD / particle-based physically solved liquids; full heat transfer and industrial-grade pressure network.
- Collisions/rigid-body physics and sophisticated automatic obstacle avoidance.
- Advanced SCADA business logic, dashboards, alarming workflows, historian, authentication, database or PLC command control.
- Vendor-specific device/connection clients. The app or gateway owns any WebSocket/REST/MQTT/OPC UA transport.
- All possible industrial equipment families beyond the priority components.

**Scope alignment note:** M7 asset-import and optional engineering simulation tasks in the broader roadmap are enhancements; they are not mandatory for the MVP release. M8 release gate should depend on MVP-critical tasks and validation, not optional T-019–T-022 or T-025–T-026. Track any reprioritization in backlog before starting MVP release work.

## 3. MVP vertical slice and acceptance

**Demo scenario — Tank → Valve → Pipe → T-junction → Two outlets:**
1. Launch playground completely offline. No request to open a socket or configure a server.
2. Drag tank, valve, straight pipe and tee to intentional world positions; viewport and placement accurately reflect pointer.
3. Snap tank outlet to valve inlet, valve outlet to pipe inlet and pipe outlet to tee entry; create two branch routes. Validate domain/bore/direction and reject occupied ports.
4. Move/rotate an item. Connected edges remain valid or tool blocks invalid transform; routes update deterministically.
5. Save scene JSON; reload in a fresh editor; exact topology, IDs and transforms survive.
6. Undo/redo add, connect, rotate, disconnect and property change; expected previous scene returns without dangling edge.
7. Apply local values to tank.level, valve position and edge flow; show tank fill and flow in known direction. Unknown measurement does not invent rate.
8. Toggle tank glass/X-ray visual appearance and see contained water; ensure appearance does not affect persisted topology.
9. Consume the package from a separate React project without monorepo source aliases or Z-Factory imports.

## 4. MVP phases mapped to canonical milestones/tasks

| Stage | Outcome | Existing task mapping | Exit evidence |
|---|---|---|---|
| 0. Foundation | reproducible install/build + CI | T-001, T-002 | clean checkout, build/test and smoke CI |
| 1. Contracts | versioned schema, world ports, deterministic persistence | T-003–T-005 | bad scenes rejected; coordinate/roundtrip tests |
| 2. Equipment | standardized tank/valve/pipe/elbow/tee | T-006 | geometry, ports and disposal fixtures |
| 3. Topology | snapping, graph, routing | T-007–T-009 | branch/cycle/occupied port and reload tests |
| 4. Editor | raycast placement, gizmos, history/import | T-010–T-012 | end-to-end editor scenario |
| 5. Visualization | direction/level/material visualization | T-013–T-015 | forward/reverse/stale + glass evidence |
| 6. Optional host data | transport-neutral observation API | T-016, T-017 | offline input and cleanup tests |
| 7. Packaging | perf/security/a11y and consumer application | T-023 (MVP gate, depends on T-002, T-015, T-017) → T-024; post-MVP hardening split into T-028 | independent install, compatibility verification |

T-018 host-specific transport examples are **optional** and must never introduce SDK network requirements. Graphify T-027 is developer tooling only and not an SDK runtime prerequisite.

## 5. Definition of done / acceptance threshold
- All MVP critical paths validated by unit + browser E2E + consumer app tests, with actual results in `WORK_LOG.md`.
- Port graph, import and command-history regressions have negative tests.
- Strict typing, reproducible install/build and CI pass with no known critical issues.
- Multiple independent viewers/editors can mount/unmount without leaks; quality/error/empty states are clear.
- SDK runs offline, with no required transports/credentials/services, and does not offer direct PLC write methods.
- Versioned scene migration strategy and package public exports documented.
- No unlicensed assets, scripts in imported scenes or false safety/physics claims.
- Owner accepts MVP scope and merges PR. No milestone is declared complete solely because documentation was written.

## 6. Immediate next work
**Start at T-001, then T-002.** Verify bootstrap before adding functionality. Next T-003–T-005 stabilize the schema, then equipment, connections, editor, visualization, input and release hardening. Agents must stop when contracts conflict and seek an ADR/owner decision.

## 7. Future releases

| Release concept | Incremental scope |
|---|---|
| MVP-1 | offline industrial scene editor/viewer with persistent connected pipelines and basic animations |
| MVP-2 | wider industrial asset catalog, advanced routing, safe SVG/GLB authoring, richer visual modes |
| MVP-3 | enhanced engineering simulation, optimization and host-supplied data integration examples |
| Research | physics CFD, complex geometry reconstruction, vendor-specific digital twins, subject to engineering validation |

No roadmap entry should be represented as delivered until code and tests substantiate it.
