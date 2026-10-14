# Agent work log (append-only)

Record one entry per agent session, with UTC timestamp, task IDs, branch, commits, implementation scope, verification commands and exact results, risks and handoff.

## 2026-10-14 — Initial scaffold (historical)
- Branch: `feat/sdk-foundation`
- Commit: `46b7847308fc67bcda2c3533e3e6e73d358057ef`
- Scope: workspace, core catalog, React/R3F playground, basic docs.
- Verification: NOT RUN in tool session. No green build claimed.
- Open gaps: M0 checks, graph, snapping, flow animation and telemetry.

## 2026-10-14 — Agent governance baseline
- Branch: `feat/sdk-foundation`
- Scope: canonical requirements, architecture, development roadmap, backlog, ADRs, contracts, safety, tests and PR standards.
- Verification: documentation reviewed for structure; source build and tests NOT RUN.
- Handoff: begin T-001, then T-002; do not skip M0 gates.

## 2026-10-15 — Detailed feature implementation planning
- Branch: `feat/sdk-foundation`.
- Scope: snapping, connection editor, routing, flow animation, scene import/history/gizmos, simplified physics, SVG assets and read-only live telemetry; expanded T-001–T-026 backlog and acceptance matrix.
- Verification: documentation only; build/unit/E2E tests NOT RUN.
- Handoff: T-001, then T-002.

## 2026-10-15 — Graphify agent reference planning
- Branch: `feat/sdk-foundation`.
- Scope: documented optional local Graphify code knowledge graph, query-first policy, source-backed impact analysis, privacy boundaries, freshness and token-budget measurement.
- Verification: documentation change only; Graphify NOT INSTALLED/NOT RUN by this session. No token savings measured.
- Handoff: complete T-001/T-002; then T-027 Graphify local onboarding when environment permits.

## 2026-10-14T19:44:52Z — T-001 foundation install/typecheck/build
- Branch: `feat/T-001-foundation-build` (from `develop` @ `b3d6a8f`).
- Scope: package typecheck projects for core, components, and react; React type dependencies so `@scada3d/react` typechecks in isolation; Node `>=20` engines field; committed-ready `pnpm-lock.yaml`.
- Graphify: NOT INSTALLED. Fallback: read package scripts, tsconfigs, and package entry files directly.
- Verification (Node v22.23.2, pnpm 9.15.4):
  - `pnpm install` PASS (130 packages, lockfile written).
  - `pnpm typecheck` PASS (core, components, react, playground).
  - `pnpm build` PASS (playground Vite production bundle).
  - `pnpm test` / `pnpm test:e2e` / browser smoke NOT RUN (owned by T-002).
- Status: T-001 REVIEW until a PR is merged. Not DONE.
- Handoff: commit and open the T-001 PR, then start T-002 (CI, unit/E2E runner, browser smoke).

## 2026-10-14T19:46:00Z — Graphify CLI install (not T-027)
- Branch: `feat/T-001-foundation-build`.
- `uv tool install graphifyy`: already installed. `graphify --version` → 0.9.53.
- `graphify install --platform cursor` wrote `.cursor/rules/graphify.mdc`.
- Index NOT built. `graphify-out/` does not exist. T-027 remains TODO. No hosted indexing.

## 2026-10-14T19:57:02Z — T-002 CI, unit tests, and browser smoke
- Branch: `feat/T-002-ci-smoke` (includes T-001 commits). Commit `5fcac58` added the runners. The following commit switches the smoke test to the production preview and records this evidence.
- Graphify: index NOT built (`graphify-out/graph.json` absent). Fallback: read package scripts and the playground entry.
- Verification (Node v22.23.2, pnpm 9.15.4):
  - `pnpm typecheck` PASS.
  - `pnpm test` PASS (5 tests in `packages/core/src/scene.test.ts`).
  - `pnpm test:e2e` FAIL against the Vite dev server because its reload socket is local HMR, then PASS after switching the smoke test to `vite preview` (1 test, no WebSocket).
  - `pnpm build` PASS as part of the preview web server. GitHub Actions CI NOT RUN locally.
- Status: T-002 REVIEW until a PR is merged. Not DONE. Full editor E2E (connect, undo, save) remains later tasks.
- Handoff: next dependency-ready task is T-003 after T-001 and T-002 are accepted.

## 2026-10-15 — T-003 runtime scene validation
- Branch: `feat/T-003-scene-validation` (from `develop` @ `d21383b`).
- Graphify: index NOT built. Fallback: read all source files directly (core, components, react, playground).
- Scope: `validateScene` in `packages/core/src/validation.ts` for the current v1 shape, with typed error codes, paths, size limits and an injected port resolver. Core types moved from `index.ts` to `scene.ts` (index is now a barrel, avoiding a circular import); `componentKinds` constant added and `ComponentKind` derived from it; rotation documented as Euler XYZ radians. No schema change, no new dependency. Proposed ADR-0004 for the v2 scene shape (not accepted). T-001 and T-002 marked DONE (PRs merged, develop CI green).
- Tests written first: 48 new tests failed before implementation; a `__proto__` property test was added after self-review (`validateScene is not a function`).
- Verification (Node v22.23.2, pnpm 9.15.4):
  - `pnpm typecheck` PASS.
  - `pnpm test` PASS (55 tests: core scene, core validation, components catalog).
  - `pnpm build` PASS.
  - `pnpm test:e2e` PASS (1 test).
  - GitHub Actions CI NOT RUN (branch not pushed).
- Not done: editor and playground do not call `validateScene` yet (import UI is T-012); port orientation and world transforms are T-004.
- Status: T-003 REVIEW until PR is merged.
- Handoff: next dependency-ready tasks are T-004 (world-space port transforms) and T-005 (versioned roundtrip; needs ADR-0004 decision).

## 2026-10-15 — T-004 world-space port transforms
- Branch: `feat/T-004-world-ports` (stacked on `feat/T-003-scene-validation` @ `f4b45c2`, PR #10 not yet merged).
- Graphify: index NOT built. Fallback: read `packages/core/src/scene.ts`, the catalog and the renderer's `<group position rotation>` usage.
- Scope: `rotateVector` and `portToWorld` in `packages/core/src/transforms.ts` (pure, no dependencies). Euler XYZ intrinsic order matching Three.js; v1 has no scale.
- Tests written first: 62 new tests failed before implementation (`portToWorld is not a function`). Core fixtures cover identity, ±90°/180°/360° about each axis, order dependence, length preservation, translation vs direction, unit normals and zero-length rejection. `packages/react/src/ports.test.ts` cross-checks all 10 catalog ports under 5 transforms against Three.js `Object3D`.
- Verification (Node v22.23.2, pnpm 9.15.4):
  - `pnpm typecheck` PASS.
  - `pnpm test` PASS (117 tests).
  - `pnpm build` PASS.
  - `pnpm test:e2e` PASS (1 test).
  - GitHub Actions CI not awaited (owner direction).
- Not done: nested transforms, scale (ADR-0004), snapping and normal-opposition checks (T-007). Renderer still draws port markers itself rather than through `portToWorld`.
- Status: T-004 REVIEW until PR is merged.
- Handoff: T-005 (versioned roundtrip) needs the ADR-0004 decision; T-006 (industrial geometry) is now dependency-ready after T-004.

## 2026-10-15 — T-006 industrial geometry, ports and disposal
- Branch: `feat/T-006-industrial-geometry` (from `develop` @ `410f900`; T-003 and T-004 merged and marked DONE).
- Graphify: index NOT built. Fallback: read the catalog, renderer and core types directly.
- Scope: `GeometryPart`/`IndustrialComponentDefinition` descriptors and bounds in `@scada3d/components`; new `elbow` kind (additive to `componentKinds`); pump gains suction/discharge ports; tank gains nozzles and an explicit liquid part; all fluid nozzles use `pipeOuterRadius` 0.084 m at DN150. `@scada3d/react` builds geometry from parts (`createEquipmentGeometries`, `disposeGeometries`) and disposes it on unmount. Visible change: pipes are thinner (true DN150 OD) and port markers smaller.
- Tests written first; catalog and geometry tests failed before implementation. Bounds tolerance relaxed from 1e-9 to 1e-6 m after the first run showed float32 vertex rounding (~5e-8 m), not geometry errors.
- Verification (Node v22.23.2, pnpm 9.15.4):
  - `pnpm typecheck` PASS.
  - `pnpm test` PASS (223 tests).
  - `pnpm build` PASS.
  - `pnpm test:e2e` PASS (1 test).
  - Browser check: Playwright screenshots of all 8 kinds in normal and glass mode; no console errors; liquid visible in glass mode; ports at pipe ends.
  - GitHub Actions CI not awaited (owner direction).
- Not done: configurable dimensions, drain port, motor/sensor ports, material disposal test (materials are declarative R3F children, disposed by R3F), X-ray/cutaway (T-015).
- Status: T-006 REVIEW until PR is merged.
- Handoff: next is T-007 (compatible snap search and transform solver), now dependency-ready after T-004 and T-006. T-005 still waits on ADR-0004.

## 2026-10-15 — T-007 port snap search and transform solver
- Branch: `feat/T-007-port-snapping` (from `develop` @ `7dcab3e`; T-006 merged and marked DONE).
- Graphify: index NOT built. Fallback: read `scene.ts`, `transforms.ts`, `validation.ts` and the catalog directly.
- Scope: `findSnapCandidates` and `snapComponent` in `packages/core/src/snapping.ts` (pure; internal quaternion helpers matching Three.js conventions). Kept in core instead of creating `connection-engine` for one file; split when the graph work (T-008) justifies it.
- Tests written first: 18 new tests failed before implementation. During implementation the rotated-target test exposed a precision loss at 90° about Y (gimbal lock, `asin` error ~2e-8); fixed by converting with `atan2`, then added a 512-orientation sweep and vertical half-turn test. A catalog test snaps a real elbow onto the tee branch and validates the result.
- Verification (Node v22.23.2, pnpm 9.15.4):
  - `pnpm typecheck` PASS (first run FAIL on an untyped test fixture; fixed).
  - `pnpm test` PASS (244 tests).
  - `pnpm build` PASS.
  - `pnpm test:e2e` PASS (1 test).
  - GitHub Actions CI not awaited (owner direction).
- Not done: edge commit and undo (T-008/T-011), drag preview UI (T-010), spatial index, collision checks.
- Status: T-007 REVIEW until PR is merged.
- Handoff: next is T-008 (persistent graph, cycles, tee and occupancy), dependency-ready after T-003 and T-007.

## 2026-10-15 — T-008 persistent connection graph
- Branch: `feat/T-008-connection-graph` (from `develop` @ `2e7eed1`; T-007 merged and marked DONE).
- Graphify: index NOT built. Fallback: read `validation.ts`, `snapping.ts` and the editor's remove handler directly.
- Scope: `connect`, `disconnect`, `removeComponent`, `connectionsOf`, `reachableComponents` and `connectedGroups` in `packages/core/src/graph.ts`. `connect` reuses `validateScene` for all edge rules. The editor's Remove button now calls `removeComponent`. Kept in core (no package split) because rules.md §8 requires approval for package-boundary changes; proposed ADR-0005 instead.
- Tests written first: 22 new tests failed before implementation. Covers every connect rejection with a frozen input, reconnect after disconnect, cascade delete, tee branches, a cycle, isolated and unknown starts, a 5,000-component chain and disconnected groups. Browser smoke test now also removes the tank.
- Verification (Node v22.23.2, pnpm 9.15.4):
  - `pnpm typecheck` PASS.
  - `pnpm test` PASS (266 tests).
  - `pnpm build` PASS.
  - `pnpm test:e2e` PASS (1 test, add and remove).
  - GitHub Actions CI not awaited (owner direction).
- Not done: undo/redo (T-011), route regeneration (T-009), editor UI for connecting.
- Status: T-008 REVIEW until PR is merged.
- Handoff: next is T-009 (pipe routing, elbow and tee geometry). ADR-0004 and ADR-0005 await owner decisions.

## 2026-10-15 — T-009 pipe routing, route geometry and demo network
- Branch: `feat/T-009-pipe-routing` (from `develop` @ `3201ca9`; T-008 merged and marked DONE).
- Graphify: index NOT built. Fallback: read `transforms.ts`, `graph.ts`, `geometry.ts` and the viewer directly.
- Scope: `routeConnection` and `routeScene` in `packages/core/src/routing.ts` (direct/straight/orthogonal, fewest-bend axis order search, bend-radius room checks, typed failures). `createRouteGeometries` in `@scada3d/react` (trimmed straights plus quarter-torus bends); viewer renders routes and a dashed red line for invalid ones. Playground `/?demo` loads a validated tank → valve → pipe → tee network with straight runs and an L-shaped branch. Kept in core; ADR-0005 widened to propose `pipe-routing` too.
- Tests written first: 20 routing tests and 4 route-geometry tests failed before implementation. One fixture was infeasible under the bend rules ((0.5, 2, −2) facing −X) and was changed to (1.5, 2, −2) before implementation.
- Bug found in browser check: routed pipes stayed opaque in glass mode although their materials reported `transparent: true, opacity: 0.21` (inspected via the Three.js devtools hook). Three.js only recompiles the opaque shader variant on a new or `needsUpdate` material; shells worked only because double-sided transparent rendering sets `needsUpdate` each draw. Fixed by keying route and shell materials on glass mode; screenshots confirm uniform glass and a clean return to normal view.
- Verification (Node v22.23.2, pnpm 9.15.4):
  - `pnpm typecheck` PASS.
  - `pnpm test` PASS (290 tests).
  - `pnpm build` PASS.
  - `pnpm test:e2e` PASS (2 tests: add/remove, demo scene loads with no console errors).
  - Browser screenshots of `/?demo` in normal and glass mode.
  - GitHub Actions CI not awaited (owner direction).
- Not done: obstacle avoidance, collision checks, waypoints, routing for off-axis ports, editor connect UI.
- Status: T-009 REVIEW until PR is merged.
- Handoff: next dependency-ready is T-010 (3D canvas raycast drag/drop), after T-007 and T-009. T-013 (flow-state resolver) is also unblocked. ADR-0004 and ADR-0005 await owner decisions.

## 2026-10-15 — T-010 canvas raycast drag/drop with snap preview
- Branch: `feat/T-010-canvas-drop` (from `develop` @ `80958f4`; T-009 merged and marked DONE).
- Graphify: index NOT built. Fallback: read the editor/viewer and snapping/graph APIs directly.
- Scope: `screenToPlane`, `dropPosition`, `planDrop`, `applyDrop` and `describeDrop` in `packages/react/src/drop.ts`. Editor tracks the dragged palette kind, previews a ghost plus a green/red port marker and a status line, applies drop + connection as one validated change, and clears on Escape/dragend/leave. Click-to-add now rests components on the ground and never auto-connects.
- Tests written first: `drop.test.ts` failed to load before implementation. New e2e `canvas-drop.spec.ts` drags a tank onto the projected world origin, then a valve beside the outlet, and checks the preview text, snapped position (exact) and connection; a second test cancels a drag with Escape.
- Issues found: (1) first e2e run dropped the tank at x = −32 because the test dragged before R3F had sized the canvas (still 300×150) and aimed the camera; the test now waits for the canvas to fill `main`. This is a test timing issue, not an app bug. (2) Mid-drag screenshot showed the status line naming the target by UUID; `describeDrop` now takes the scene and uses catalog labels.
- Verification (Node v22.23.2, pnpm 9.15.4):
  - `pnpm typecheck` PASS.
  - `pnpm test` PASS (305 tests).
  - `pnpm build` PASS.
  - `pnpm test:e2e` PASS (4 tests).
  - Browser screenshots mid-drag: ghost valve at snapped transform with green marker; free placement text for a pipe.
  - GitHub Actions CI not awaited (owner direction).
- Not done: moving existing components, undo/redo, gizmos (T-011); non-ground drop surfaces.
- Status: T-010 REVIEW until PR is merged.
- Handoff: T-011 (gizmos and atomic undo/redo) needs T-005 (versioned roundtrip), which waits on ADR-0004. T-013 (flow-state resolver) is dependency-ready now.

## 2026-10-15 — T-005 scene version 2, migration and deterministic serialization
- Branch: `feat/T-005-scene-v2` (stacked on `feat/T-010-canvas-drop` @ `8bec5a3`, PR #17 open, to avoid conflicts in the drop code).
- Owner decision: ADR-0004 accepted (version 2 scene format). ADR status and decision log updated.
- Graphify: index NOT built. Fallback: `grep` for every `kind`/`version`/`rotation` use across packages, apps and e2e.
- Scope: `ScadaScene` is now `{ schemaVersion: 2, units: 'm', components: [{ id, type, position, rotation: quaternion, scale, properties }], connections }`. `validateScene` reads v1 and v2, migrates v1 (Euler XYZ → quaternion, `kind` → `type`, scale [1, 1, 1], `migratedFrom: 1`), enforces unit quaternions (1e-6, never renormalised), positive scale and the scale policy (`UNSUPPORTED_SCALE` for types with ports). New `quaternion.ts` (shared helpers; snapping now returns quaternions directly, removing the Euler gimbal path), `portToWorld` applies scale with a correct normal transform, `serializeScene`/`parseScene` (canonical key order, sorted property keys, `INVALID_JSON`, length limit). Catalog definitions, React renderer (`quaternion`/`scale` props), drop planning, playground demo and all fixtures moved to v2.
- Tests written first: 31 new serialization/migration tests failed before implementation. Existing fixtures converted (Euler fixtures kept readable via `quaternionFromEuler`); added scale and quaternion-helper tests.
- Verification (Node v22.23.2, pnpm 9.15.4):
  - `pnpm typecheck` PASS.
  - `pnpm test` PASS (353 tests).
  - `pnpm build` PASS.
  - `pnpm test:e2e` PASS (4 tests; demo scene renders with quaternion/scale props and no console errors).
  - GitHub Actions CI not awaited (owner direction).
- Not done: import/export UI (T-012), `tagBindings` in the schema (T-016), nested transforms.
- Status: T-005 REVIEW until PR is merged (after #17).
- Handoff: T-011 (gizmos and atomic undo/redo) is dependency-ready once T-005 and T-010 merge. ADR-0005 still awaits an owner decision.

## 2026-10-15 — T-011 gizmos and atomic undo/redo
- Branch: `feat/T-011-gizmos-history` (from `feat/T-005-scene-v2` @ `814f520`).
- Merge incident: PR #18 (T-005) was merged into `feat/T-010-canvas-drop` after #17 had already merged, so T-005 did not reach `develop`. Opened PR #19 to land commit `814f520` on `develop`. T-010 marked DONE (PR #17).
- Graphify: index NOT built. Fallback: read the editor/viewer and drei `TransformControls` typings and source.
- Scope: `history.ts` (snapshot history with gesture merge keys, bounded); editor routes every change through history; Undo/Redo buttons and editor-scoped shortcuts; Move/Rotate gizmos via drei `TransformControls` (90° rotation snap, 0.05 m translation snap, orbit disabled while dragging). e2e drag helpers moved to `e2e/helpers.ts`.
- Tests written first: `history.test.ts` failed to load before implementation; 3 of 4 new undo/redo e2e tests failed before wiring (the typing-guard test passes trivially until the shortcut handler exists). Gizmo e2e drags the real X arrow (moved exactly 2 m, one undo restores) and the Y ring (exact quarter turn about Y).
- Verification (Node v22.23.2, pnpm 9.15.4):
  - `pnpm typecheck` PASS.
  - `pnpm test` PASS (364 tests).
  - `pnpm build` PASS.
  - `pnpm test:e2e` PASS (10 tests).
  - Browser screenshots: demo valve selected with gizmo, then dragged 1 m along Z; both connected routes re-route as S-bends.
  - GitHub Actions CI not awaited (owner direction).
- Not done: blocking/re-snapping transforms that misalign connected ports, scale gizmo, multi-select. Position fields show raw floats (e.g. 0.634999999).
- Status: T-011 REVIEW until PR is merged (after #19).
- Handoff: next is T-012 (scene import/export UI and browser roundtrip), which builds on `serializeScene`/`parseScene`. T-013 also unblocked. ADR-0005 awaits an owner decision.

## 2026-10-15 — T-012 scene import/export and browser roundtrip
- Branch: `feat/T-012-import-export` (from `develop` @ `933b061`; #19 and #20 merged, T-005 and T-011 marked DONE).
- Graphify: index NOT built. Fallback: read the editor and the core `serializeScene`/`parseScene` APIs directly.
- Scope: `importSceneText`, `formatSceneErrors` and `MAX_SCENE_FILE_BYTES` in `packages/react/src/sceneFile.ts`. Editor: Export JSON download (canonical text), file import (size-checked before reading), pasted-text import, readable error list, success note with migration notice, import as one undo step. Scene JSON panel now shows `serializeScene` output.
- Tests written first: `sceneFile.test.ts` failed to load and 3 new e2e tests failed before implementation. After wiring, an older undo test broke because `getByLabel('X')` also matched "Import JSON text" (substring match); fixed with `exact: true`.
- Verification (Node v22.23.2, pnpm 9.15.4):
  - `pnpm typecheck` PASS.
  - `pnpm test` PASS (371 tests).
  - `pnpm build` PASS.
  - `pnpm test:e2e` PASS (13 tests, including export → reload → import byte-identical roundtrip of a connected, gizmo-rotated scene; malformed text keeps the scene; pasted v1 migrates).
  - Browser screenshot of the import error list over the unchanged demo scene.
  - GitHub Actions CI not awaited (owner direction).
- Not done: merge/append import; reference errors appear only after structural errors are fixed.
- Status: T-012 REVIEW until PR is merged. With T-012 merged, all M4 tasks (T-010–T-012) are done.
- Handoff: next is M5, starting with T-013 (measured/simulated flow-state resolver). T-015 (glass/X-ray/cutaway/water/heat) is also dependency-ready. ADR-0005 awaits an owner decision.

## 2026-10-15 — T-013 measured/simulated flow-state resolver
- Branch: `feat/T-013-flow-resolver` (from `develop` @ `04f8ca4`; #21 merged, T-012 marked DONE, M4 complete).
- Graphify: index NOT built. Fallback: read ARCHITECTURE §8/§9 (flow and observation contracts) and the scene model directly.
- Scope: `resolveFlow` in `packages/core/src/flow.ts` (pure; `now` passed in). Readings keyed by connection id with signed m³/s rate, quality, source and ISO timestamp. Directions forward/reverse/stopped/unknown with typed unknown reasons, uncertain flag, newest-wins ordering, single-source mode (no measured/simulated mixing), unmatched-id diagnostics. No valve or topology inference.
- Tests written first: 25 new tests failed before implementation (rate +5/0/−5, threshold, uncertain, bad/stale/old/unparseable/future/NaN/unknown quality, stale-limit and skew boundaries, out-of-order, newer bad overrides older good, equal-timestamp tie, source modes, tee branches stay unknown, unmatched ids, no mutation).
- Verification (Node v22.23.2, pnpm 9.15.4):
  - `pnpm typecheck` PASS (first run FAIL: tests read `state.reason` on the `FlowState` union; added `reason?: undefined` to the known-flow variant).
  - `pnpm test` PASS (396 tests).
  - `pnpm build` PASS.
  - `pnpm test:e2e` PASS (13 tests; no UI change in this task).
  - GitHub Actions CI not awaited (owner direction).
- Not done: rendering flow (T-014), tag-to-connection bindings (T-016), unit conversion for non-m³/s inputs, valve/flow conflict hints.
- Status: T-013 REVIEW until PR is merged.
- Handoff: next is T-014 (animated directional flow and stale cases), which renders these states along route centrelines. ADR-0005 awaits an owner decision.

## 2026-10-15 — T-014 animated directional flow and stale cases
- Branch: `feat/T-014-flow-animation` (from `develop` @ `0f590ba`; #22 merged, T-013 marked DONE).
- Graphify: index NOT built. Fallback: read the viewer, routing and flow resolver directly.
- Scope: `sampleRouteCenterline` (core; polyline through bend arcs). `flowVisual.ts` (pure: `flowAppearance`, `pathLengths`, `pointAt`, `markerDistances`, `summarizeFlow`). Viewer `flow` prop: 1 s clock for staleness, instanced travelling/still beads, dashed always-visible overlays for unknown states, SIMULATED badge, accessible summary. Editor passes `flow` through. Removed the manual `flowing` property/checkbox (it showed flow without data). Playground `?demo` flow feed panel (`FlowPanel.tsx`) with Live re-stamping.
- Tests written first: 3 centreline tests and `flowVisual.test.ts` failed before implementation; 3 of 4 flow e2e tests failed before wiring. Fixed a float artefact in marker wrapping (0.6 became 0.5999999999999999). Playground typecheck caught an overwritten-defaults spread in the panel.
- Browser checks: screenshots of measured, reverse+stale and simulated states. The grey "no reading" overlay was nearly invisible on grey pipe, so it is now light grey (#c3cdd8); re-checked. Marker motion measured from live instance matrices: +0.24 m in 0.3 s at rate 2, −0.24 m (wrapped) at rate −2, 0 at rate 0; kept as a permanent e2e test. Staleness verified with Playwright's fake clock.
- Verification (Node v22.23.2, pnpm 9.15.4):
  - `pnpm typecheck` PASS.
  - `pnpm test` PASS (412 tests).
  - `pnpm build` PASS.
  - `pnpm test:e2e` PASS (18 tests).
  - GitHub Actions CI not awaited (owner direction).
- Not done: flow along component bodies (only routed connections carry readings), per-frame allocation in `pointAt` (small; optimise when benchmarked), GPU/memory baseline, tag bindings (T-016).
- Status: T-014 REVIEW until PR is merged.
- Handoff: next is T-015 (glass, X-ray, cutaway, water and heat). ADR-0005 awaits an owner decision.

## 2026-10-15 — T-015 glass, x-ray, cutaway, water level and heat tint
- Branch: `feat/T-015-view-modes` (from `develop` @ `066c59e`; #23 merged, T-014 marked DONE).
- Graphify: index NOT built. Fallback: read the viewer/editor and the earlier glass-mode material fix.
- Scope: `appearance.ts` (pure: `viewModes`, `effectiveViewMode`, `shellLook`, `liquidFill`, `heatColor`, `HEAT_RANGE_C`). Viewer `viewMode`/`viewOverrides` (replaces boolean `glass`), drei `Edges` in x-ray, local clipping plane in cutaway (`localClippingEnabled` set on canvas creation), liquid visibility/scale from the level policy, temperature tint and legend, `userData` tags (`componentId`, `role`) on parts. Editor: View select, per-component view select (display state only), temperature field, level notes for clamped/missing/invalid levels. Level no longer falls back to an assumed 45 % when missing.
- Tests written first: `appearance.test.ts` (22 tests) failed to load and 4 new e2e tests failed before implementation. e2e inspects real rendered materials via the Three.js devtools hook (now shared in `e2e/helpers.ts`): shell opacity per mode, edge outlines in x-ray, clipping planes in cutaway with the liquid unclipped, per-component override isolation, saved JSON unchanged across modes, liquid scale/visibility for 100/0/imported 130 %, temperature tint #ff3333 at 100 °C and legend text.
- Verification (Node v22.23.2, pnpm 9.15.4):
  - `pnpm typecheck` PASS.
  - `pnpm test` PASS (434 tests).
  - `pnpm build` PASS.
  - `pnpm test:e2e` PASS (22 tests).
  - Browser screenshots of a heated tank (85 °C, 70 %) in glass, x-ray and cutaway. A first scratch script missed the tank with a guessed click; re-run with a projected click.
  - GitHub Actions CI not awaited (owner direction).
- Not done: camera-facing cutaway plane (fixed +Z for now), heat from live observations (T-016), transparency sorting tests with many overlapping glass parts, material disposal leak test.
- Status: T-015 REVIEW until PR is merged. With T-015 merged, all M5 tasks (T-013–T-015) are done.
- Handoff: next is M6, starting with T-016 (read-only telemetry: tag bindings, quality and timestamps). ADR-0005 awaits an owner decision.

## 2026-10-15 — T-016 read-only telemetry with tag bindings
- Branch: `feat/T-016-telemetry` (from `feat/T-015-view-modes` @ `f126d37`, PR #24 open; PR targets `develop` directly).
- Owner decision: tag bindings as an optional field in scene version 2 (ADR-0006, accepted).
- Graphify: index NOT built. Fallback: read validator, serialization, graph, flow resolver and viewer directly.
- Scope: (A) `TagBinding` and `Quantity` types, catalog `bindable` (tank level/temperature, valve open), `units.ts` canonical units and conversions, validation rules and error codes, canonical serialization, binding cascades on remove/disconnect, `resolveBindable` in validation/graph options and on import/drop. (B) `observation.ts` shared quality/timestamp rules (flow refactored onto it), `resolveTelemetry` and `displayScene`, `telemetryView.ts` (`describeProperty`, `summarizeTelemetry`), viewer/editor `telemetry` prop, grey valve for untrusted open state, tag-binding editor with live values, demo tag feed (`DemoFeed.tsx`, replacing the per-connection flow panel) and demo bindings.
- Tests written first: 32 binding tests, 21 telemetry tests, 5 telemetry-view tests and 3 telemetry e2e tests failed before implementation. A fixture bug (passing `undefined` triggered the default bindings) was fixed with a `null` sentinel. Tag fields commit on Enter/blur so type-then-clear are two undo steps; flow e2e labels moved from per-connection rates to tags.
- Verification (Node v22.23.2, pnpm 9.15.4):
  - `pnpm typecheck` PASS.
  - `pnpm test` PASS (497 tests).
  - `pnpm build` PASS (via e2e web server).
  - `pnpm test:e2e` PASS (25 tests).
  - Browser screenshot: demo tank selected in glass mode with live values, stale valve tag shown grey.
  - GitHub Actions CI not awaited (owner direction).
- Not done: authored property controls do not yet say they are overridden by a live tag; INVALID_UNIT on flow tags surfaces as INVALID_VALUE; DataProvider/subscription API and no-network/cleanup tests (T-017).
- Status: T-016 REVIEW until PR is merged (after #24).
- Handoff: next is T-017 (optional DataProvider snapshot/subscribe or setTagValues API; no-network test and cleanup). ADR-0005 awaits an owner decision.

## 2026-10-15 — T-017 DataProvider, setTagValues, no-network and cleanup
- Branch: `feat/T-017-data-provider` (from `develop` @ `213f2e7`; #25 merged, T-016 marked DONE).
- Graphify: index NOT built. Fallback: read telemetry/flow modules and the viewer/editor directly.
- Scope: core `dataInput.ts` (`DataProvider`, `createObservationStore`, `connectProvider`). React `useTelemetryFeed` (provider subscription with effect cleanup, `useSyncExternalStore` over the store, `useImperativeHandle` for `setTagValues`); `TelemetryInput.observations` now optional plus `provider`; viewer and editor take `ref`. Playground demo feed is now a real `DataProvider` (exposes `active()` for tests), with "Mount editor" and "Second viewer" toggles and the editor handle on `window.__scadaEditor`.
- Tests written first: 14 store/provider unit tests and 5 e2e tests failed before implementation. e2e: subscription via provider, release across 5 unmount/remount cycles, two viewers hold two subscriptions, `setTagValues` through the handle, and no network in any mode. The no-network detectors were validated by a scratch copy that makes a deliberate `fetch` and `WebSocket`, which the test caught (scratch file removed).
- Verification (Node v22.23.2, pnpm 9.15.4):
  - `pnpm typecheck` PASS.
  - `pnpm test` PASS (511 tests).
  - `pnpm build` PASS.
  - `pnpm test:e2e` PASS (30 tests).
  - GitHub Actions CI not awaited (owner direction).
- Not done: provider error surfacing in the UI (logged via `onError`, default console.error); GPU/heap leak measurement on repeated mounts (subscription cleanup is tested, memory is not measured).
- Status: T-017 REVIEW until PR is merged. With T-017 merged, the MVP-required M6 tasks are done (T-018 is optional host examples).
- Handoff: remaining MVP path is T-023 (perf/security/a11y and API hardening) → T-024 (independent consumer release). T-023 currently also depends on T-018 and T-020, which MVP.md says are not release blockers; per AGENTS.md this needs a backlog/ADR change before starting. ADR-0005 awaits an owner decision.
