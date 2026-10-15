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

## 2026-10-15 — Release-path backlog change (docs only)
- Branch: `docs/mvp-release-gate` (from `feat/T-017-data-provider` @ `23faaf1`, so the append-only work log does not conflict). Also marks T-015 DONE (PR #24 merged).
- Owner-approved: T-023 now depends on T-002, T-015, T-017 and is the MVP gate (P0); new T-028 holds post-MVP hardening (depends on T-018, T-020, T-023); T-018, T-019, T-020 marked post-MVP (P2). MVP.md, DEVELOPMENT_PLAN.md (new M7 MVP gate row, M8 dependency) and DECISION_LOG.md updated.
- Verification: documentation only; no code or tests changed.
- Handoff: T-023 is dependency-ready once #26 (T-017) merges.

## 2026-10-15 — T-023 part A: public API surface
- Branch: `feat/T-023a-api-surface` (from `develop` @ `034077f`; #26 and #27 merged, T-017 marked DONE).
- Owner decision: ADR-0005 rejected for the MVP; snapping, graph and routing stay in `@scada3d/core`.
- Graphify: index NOT built. Fallback: listed every `export` across packages with grep.
- Scope: explicit named export lists replace `export *` in core and components; react keeps only `Scada3DViewer`, `Scada3DEditor`, `viewModes`, `importSceneText`, `formatSceneErrors`, `MAX_SCENE_FILE_BYTES` plus prop/handle types. Made internal: `qualities`, `assessObservation`, `isNewer`, `multiplyQuaternions`, `normalizeQuaternion`, `quaternionFromUnitVectors`, and the react drop/history/flow/telemetry/appearance helpers. API snapshot tests (`api.test.ts`) in all three packages; `docs/API.md` reference; ADR-0005 and ARCHITECTURE updated.
- Tests written first: core and react snapshot tests failed against the old `export *` surface; components already matched.
- Verification (Node v22.23.2, pnpm 9.15.4):
  - `pnpm typecheck` PASS.
  - `pnpm test` PASS (514 tests).
  - `pnpm build` PASS.
  - `pnpm test:e2e` PASS (30 tests).
  - GitHub Actions CI not awaited (owner direction).
- Not done: type-level API snapshot (types are fixed by the explicit export lists, not by a test); declaration output and package `exports` maps for publishing (T-024).
- Status: T-023 IN_PROGRESS (part A in review; parts B security, C accessibility, D performance next).

## 2026-10-15 — T-023 part B: security
- Branch: `feat/T-023b-security` (from `feat/T-023a-api-surface` @ `b03d8e3`, PR #28 open; targets `develop`).
- Graphify: index NOT built. Fallback: read validation, units, observation, dataInput and the editor's import paths.
- Scope: `packages/core/src/security.test.ts` (seeded fuzzing of scene documents, scene text and host observations; prototype pollution; limits; deep nesting; store flood) and `e2e/untrusted-text.spec.ts` (markup in ids/properties/tags rendered as text). Audit and licence record in SECURITY_AND_SAFETY.md.
- Defects found by the new tests and fixed: sparse-array holes and NaN unit length accepted; `-0` not round-tripping; `JSON.stringify` in error messages throwing on BigInt; `in`-based unit lookup throwing on null-prototype objects; `Date.parse` throwing on Symbol timestamps; store key building throwing on BigInt tag ids. Each has a regression test. One fuzz-harness bug (shared hostile objects forming cycles) was fixed in the test itself.
- Audit: production dependencies have no known vulnerabilities; 4 dev-only advisories via vitest@3.2.7 (fix needs vitest ≥ 4.1.11, owner approval pending). Licences: MIT/ISC/Apache-2.0/BSD-3-Clause plus CC-BY-4.0 data (caniuse-lite); no copyleft.
- Verification (Node v22.23.2, pnpm 9.15.4):
  - `pnpm typecheck` PASS.
  - `pnpm test` PASS (529 tests).
  - `pnpm build` PASS.
  - `pnpm test:e2e` PASS (31 tests).
  - GitHub Actions CI not awaited (owner direction).
- Not done: vitest upgrade (needs approval); CSP guidance for hosts; asset (SVG/glTF) sanitisation is post-MVP (T-028).
- Status: T-023 IN_PROGRESS (parts A and B in review; C accessibility and D performance next).

## 2026-10-15 — Dev dependency upgrade: vitest 4.1.11 (security)
- Branch: `chore/vitest-4` (from `feat/T-023b-security` @ `5d439ab`, PR #29 open; targets `develop`).
- Owner-approved: upgrade the test runner from vitest 3.2.7 to `^4.1.11` (smallest release fixing GHSA-82fw-gwwq-j7x9, GHSA-5gmw-xhrv-c9v3, GHSA-85c8-ppgw-ccpr). Latest 5.0.4 not taken to keep the change minimal.
- Verification (Node v22.23.2, pnpm 9.15.4):
  - `pnpm audit` and `pnpm audit --prod`: no known vulnerabilities.
  - `pnpm typecheck` PASS.
  - `pnpm test` PASS (529 tests, no config changes needed).
  - `pnpm build` PASS.
  - `pnpm test:e2e` PASS (31 tests).

## 2026-10-15 — T-023 part C: accessibility
- Branch: `feat/T-023c-accessibility` (from `chore/vitest-4` @ `9d61afc`, PRs #29 and #30 open; targets `develop`).
- Graphify: index NOT built. Fallback: read the editor/viewer directly.
- Scope: `keyboard.ts` (`nudge`: arrows/PageUp/PageDown/R with Shift for coarse steps, float-noise-free positions, world-Y quarter turns via Three.js quaternions); editor keyboard handling (move, turn, Delete, Escape, per-key undo merging); "In scene" component list (`nav` "Scene components", `aria-pressed`); viewer wrapped in a `region` "3D scene view" with a visually hidden count description; focus returns to the editor after removing a component.
- Tests written first: `keyboard.test.ts` (10) failed to load and 3 accessibility e2e tests failed before implementation. Two test expectations were wrong and fixed (per-key undo order; 0.2 + 0.1 float compare). A real defect surfaced: after deleting via the keyboard, focus fell to `<body>` and Ctrl+Z stopped working; fixed by focusing the editor after removal.
- Verification (Node v22.23.2, pnpm 9.15.4):
  - `pnpm typecheck` PASS.
  - `pnpm test` PASS (539 tests).
  - `pnpm build` PASS.
  - `pnpm test:e2e` PASS (34 tests).
  - GitHub Actions CI not awaited (owner direction).
- Not done: contrast audit, real screen-reader testing, reduced-motion option for flow markers.
- Status: T-023 IN_PROGRESS (A done; B, C in review; D performance next).

## 2026-10-15 — T-023 part D: performance baseline
- Branch: `feat/T-023d-performance` (from `feat/T-023c-accessibility` @ `db1a229`, PRs #29, #30, #31 open; targets `develop`).
- Graphify: index NOT built. Fallback: read the viewer and drei TransformControls source.
- Scope: `e2e/leaks.spec.ts` (GPU geometry/texture counts stable across remounts and editing churn; renderer collected via the devtools hook); `packages/core/src/scene.bench.ts` (chain-100/1000) with `pnpm bench`; `perf/frame-time.perf.ts` with `pnpm perf` and `playwright.perf.config.ts`; playground `?generate=N` benchmark scene; `docs/PERFORMANCE.md`; T-029 added for post-MVP rendering scale.
- Defect found and fixed: drei `TransformControls` leaked its gizmo (17 geometries plus materials) on every selection change; `GizmoControls` now disposes it on unmount. The churn test failed (27 → 37 geometries) before the fix and passes after; gizmo e2e still passes.
- Measurement notes: draw calls were first read after the axis-gizmo pass (info resets per render) and were wrong; now accumulated over the window. Browser runs use SwiftShader (CPU WebGL), so frame times are a floor; hardware-GPU measurement NOT RUN.
- Verification (Node v22.23.2, pnpm 9.15.4):
  - `pnpm typecheck` PASS.
  - `pnpm test` PASS (539 tests).
  - `pnpm build` PASS.
  - `pnpm test:e2e` PASS (36 tests).
  - `pnpm bench` and `pnpm perf` run; results in PERFORMANCE.md.
  - GitHub Actions CI not awaited (owner direction).
- Status: T-023 REVIEW once parts B–D merge (A merged).
- Handoff: next is T-024 (independent consumer release verification: built packages with declarations and exports maps, installed into a separate React app without workspace aliases).

## 2026-10-15 — T-030 scene schema version 3: structured vectors
- Branch: `feat/T-030-structured-vectors` (from `feat/T-023d-performance` @ `ba8c82a`, PRs #29–#32 open; targets `develop`).
- Owner request and decisions (ADR-0007, accepted): named `{ x, y, z }` / `{ x, y, z, w }` vectors in both files and the in-memory model; new `schemaVersion: 3` with v1/v2 migration; rotation stays a quaternion.
- Graphify: index NOT built. Fallback: typecheck errors and grep for tuple usage across packages, apps and e2e.
- Scope: `Vector3Like`/`QuaternionLike` types; `ComponentInstance.position/rotation/scale` as objects; validator reads v1/v2/v3 (`migratedFrom: 1 | 2`, strict object checks with axis paths, `-0` normalised); canonical serializer writes v3 objects in `x, y, z(, w)` order; public rotation helpers (`rotation.ts`) and `SnapResult` use objects, tuple maths kept internal (`quaternion.ts`, `vectors.ts`); `portToWorld` takes object transforms and still returns tuples; derived geometry (ports, routes) stays tuples. React renderer, gizmo handler, drop planning, keyboard nudge, position fields and playground demo/generated scenes converted. Docs: ADR-0007, decision log, ARCHITECTURE, SCENE_AND_CONNECTIONS (v3 file example), API.md.
- Tests written first: `schema-v3.test.ts` (16) failed before implementation. Existing fixtures were migrated by two delegated agents (core tests; react/components/e2e tests) with instructions not to edit production code or weaken assertions; their reports listed every semantically changed expectation (unsupported-version lists now include 4 instead of 3, v2 identity now expects `migratedFrom: 2`, a stricter negative-zero regex, one import error message now the v3 shape error). One agent ran `git stash`/`pop` during parallel work; the tree was verified afterwards (no leftover stash, all edits present) and the full suite run on the combined result.
- Verification (Node v22.23.2, pnpm 9.15.4):
  - `pnpm typecheck` PASS.
  - `pnpm test` PASS (569 tests).
  - `pnpm build` PASS.
  - `pnpm test:e2e` PASS (36 tests, including the export → reload → import roundtrip on v3).
  - `pnpm bench` runs.
  - Sample: a v2 array file loads with `migratedFrom: 2` and is written back as v3 objects.
  - GitHub Actions CI not awaited (owner direction).
- Status: T-030 REVIEW until PR is merged (after #29–#32).
- Update: #29–#32 were already merged when #33 opened, so T-023 is marked DONE (all four parts merged) and #33 contains only T-030.

## 2026-10-15 — T-031 solid-body collision highlight (default on)
- Branch: `feat/T-031-collisions` (from `feat/T-030-structured-vectors` @ `ff9d0e1`, PR #33 open; targets `develop`).
- Owner request: components are metal and must not overlap; show overlapping ones in red, on by default. Owner decisions: highlight only (never block), components only (not routed pipes).
- Graphify: index NOT built. Fallback: read the catalog bounds, viewer and editor directly.
- Scope: `findCollisions` (core; oriented boxes from catalog bounds, 15-axis separating-axis test with 1 mm touching tolerance, X sweep broad phase, sorted pairs). Viewer/editor `collisions` prop (default true): red shells, "Collisions" overlay named in scene order, red drop ghost and "— overlaps …" status suffix; playground `?collisions=off`. API snapshot and docs updated.
- Tests written first: `collision.test.ts` (10) failed before implementation, including a rotated-box case where world boxes overlap but oriented boxes do not, touching-port faces, tolerance boundaries, scale, and a seeded 150-component brute-force comparison. 3 of 4 e2e tests failed before wiring (the "switched off" test passes trivially until then); a fourth guards that the demo and generated scenes are collision-free.
- Verification (Node v22.23.2, pnpm 9.15.4):
  - `pnpm typecheck` PASS.
  - `pnpm test` PASS (579 tests).
  - `pnpm build` PASS.
  - `pnpm test:e2e` PASS (40 tests).
  - Browser screenshot: tank with a valve moved inside it shown red with the overlay; a clear tank stays normal.
  - GitHub Actions CI not awaited (owner direction).
- Not done: routed-pipe collisions, exact cylinder/curved shapes, blocking mode, a collision benchmark at 1,000 components.
- Status: T-031 REVIEW until PR is merged (after #33).

## 2026-10-15 — T-032 rotation form for every component
- Branch: `feat/T-032-rotation-form` (from `feat/T-031-collisions` @ `92e0f06`, PR #34 open; targets `develop`).
- Owner request: rotate every component from form inputs. Display decisions taken as defaults: Euler XYZ degrees (Three.js order) shown to 0.01°, −90/+90 world-axis buttons, reset, any angle allowed (non-blocking, consistent with collisions).
- Graphify: index NOT built. Fallback: read the editor properties panel directly.
- Scope: `rotationForm.ts` (`degreesFromRotation`, `rotationFromDegrees`, `turnAboutWorldAxis`), `RotationFields`/`DegreeField` in the editor (keeps typed text such as a lone "-", applies finite values; per-axis undo merge key), docs.
- Tests written first: `rotationForm.test.ts` (9) failed to load and 3 e2e tests failed before implementation. Covers round-trips, 0.01° rounding without −0, world-axis turn direction, undo by opposite turn, unit length; e2e covers fields on all 8 component types, typing 90 + undo, quick turns and reset.
- Verification (Node v22.23.2, pnpm 9.15.4):
  - `pnpm typecheck` PASS.
  - `pnpm test` PASS (588 tests).
  - `pnpm build` PASS.
  - `pnpm test:e2e` PASS (43 tests).
  - Browser screenshot: pump with Y = 45 and +90 about X shows X 90 / Y 45 / Z 0.
  - GitHub Actions CI not awaited (owner direction).
- Status: T-032 REVIEW until PR is merged (after #34).

## 2026-10-15 — T-033 adjustable pipe length
- Branch: `feat/T-033-pipe-length` (from `feat/T-032-rotation-form` @ `93dc81d`, T-032 committed locally, not pushed; targets `develop`).
- Owner request: pipe length adjustable in the SDK. Defaults chosen and stated before work: `properties.length` in metres, default 2, range 0.2–20, out-of-range rejected (not coerced), one end kept fixed.
- Graphify: index NOT built. Fallback: grep for every `resolvePorts`/`resolveBounds`/catalog lookup.
- Scope: components `ParameterSpec`, `PIPE_LENGTH`, `pipeDefinition`, `definitionFor` (cached per length), `validateProperties`, `catalogResolvers`; core resolvers receive `properties` (validation, snapping, routing, collisions, graph options) and new optional `validateProperties` → `INVALID_PROPERTY`; React uses per-instance definitions for drawing, ports, routes, drop and import; per-type default properties for new components (tank level, valve open, pipe length); generic `ParameterField`.
- Tests written first: `parameters.test.ts` (16) failed before implementation (one of my fixtures had the wrong pipe position and was corrected by hand-checking). e2e (4): default and edited length with inlet fixed and undo; out-of-range explained and not applied; import rejection. The first e2e version showed that keeping the inlet fixed pushed a pipe 2 m into a valve snapped at its outlet; the rule became "keep the connected end fixed" (inlet if both or neither) and the test now asserts no collision.
- Verification (Node v22.23.2, pnpm 9.15.4):
  - `pnpm typecheck` PASS.
  - `pnpm test` PASS (605 tests).
  - `pnpm build` PASS.
  - `pnpm test:e2e` PASS (47 tests).
  - GitHub Actions CI not awaited (owner direction).
- Not done: other parametric types (tank size, elbow angle), changing length by dragging an end.
- Status: T-033 REVIEW until PR is merged.

## 2026-10-15 — T-038 edit lock (view-only mode)
- Branch: `feat/T-038-edit-lock` (from `feat/T-033-pipe-length` @ `f4253a2`, PRs #35/#36 open; targets `develop`). Numbered T-038 to leave T-034–T-037 free for planned work.
- Owner request: lock edit mode in the SDK. Design stated before work: one guard in the editor's update path plus disabled controls; viewing, selection, live data and export stay available; host API `defaultLocked` or controlled `locked` + `onLockedChange`; not saved.
- Graphify: index NOT built. Fallback: read the editor layout directly.
- Scope: lock state and toggle, refusals in `update`, `travel`, `removeSelected`, keyboard handler, drag-over and drop; gizmo not mounted while locked; `fieldset disabled` around palette/history/tools and the editable property fields; import controls disabled; "🔒 Editing locked" badge; scene-list hint reflects the lock; playground `?locked`.
- Tests written first: 5 e2e tests failed before implementation (disabled controls and available viewing tools; keyboard edits and palette drops do nothing while selection works; gizmo drag does not move; unlock restores editing; host can start locked with live data still flowing).
- Verification (Node v22.23.2, pnpm 9.15.4):
  - `pnpm typecheck` PASS.
  - `pnpm test` PASS (605 tests).
  - `pnpm build` PASS.
  - `pnpm test:e2e` PASS (52 tests).
  - Browser screenshot: `?demo&locked` with controls greyed and live values flowing.
  - GitHub Actions CI not awaited (owner direction).
- Status: T-038 REVIEW until PR is merged (after #35, #36).

## 2026-10-15 — T-039 connect touching ports
- Branch: `feat/T-039-connect-touching` (from `feat/T-038-edit-lock` @ `1348023`, T-038 committed locally, not pushed; targets `develop`).
- Owner request: the owner pasted an exported scene with 12 parts placed port-to-port and an empty `connections` list, and asked for components to be connected where positions match. Kept ADR-0002 (topology is never inferred implicitly) by making this an explicit, user-triggered action.
- Analysis of the owner's scene with the SDK's port maths: 11 port pairs at 0.000 m and 0.0° from facing; several near pairs at 0.42 m and 90° (elbow ends) that must not be joined; no collisions. The scene is kept as test fixture `packages/components/src/fixtures/unconnected-plant.json`.
- Scope: core `findTouchingPorts` (1 mm, 1°, spatial hash; `incompatible`/`occupied`/`ambiguous` rejections; stable order) and `connectTouchingPorts` (validated, idempotent); editor "Connect touching ports (N)" button with result note, disabled when locked; API snapshot and docs.
- Tests written first: 11 core tests and 2 fixture tests failed before implementation; 2 e2e (one-click connect + undo on the owner's scene; disabled while locked). One e2e fix: Playwright compiles specs as CommonJS, so the fixture path uses `__dirname`, not `import.meta`.
- Verification (Node v22.23.2, pnpm 9.15.4):
  - `pnpm typecheck` PASS.
  - `pnpm test` PASS (618 tests).
  - `pnpm build` PASS.
  - `pnpm test:e2e` PASS (54 tests).
  - Owner's scene: 11 connections added, all routes `direct`.
  - GitHub Actions CI not awaited (owner direction).
- Status: T-039 REVIEW until PR is merged.

## 2026-10-15 — T-040 assemblies (parent/child locks)
- Branch: `feat/T-040-assemblies` (from `feat/T-039-connect-touching` @ `30160db`, PRs #37/#38 open; targets `develop`).
- Owner request and decisions (ADR-0008, accepted): children locked from connections; locked is rigid (any member moves the whole assembly); saved in the file as `parentId`.
- Graphify: index NOT built. Fallback: read validation, serialization, graph and editor transform paths directly.
- Scope: `parentId` in scene v3 with `UNKNOWN_PARENT`/`PARENT_CYCLE` validation and canonical serialization; `assemblyOf`, `moveAssembly`, `lockConnectedAsChildren`, `unlockFromParent`; `removeComponent` frees children; editor routes every pose change through `moveAssembly`, Assembly section, indented scene list. API snapshot and docs updated.
- Tests written first: 14 core tests and 4 e2e tests failed before implementation.
- Defect found and fixed: e2e drops failed because a long properties panel stretched the editor grid row, making the 3D canvas 1158 px tall in a 720 px window, so the drop point was off-screen. The grid now has a fixed row and the side panels scroll; `e2e/layout.spec.ts` guards it. Test-setup fix: a ground-dropped pipe's ports sit too low to snap to a valve outlet (0.55 m > 0.5 m reach), so the e2e chain uses a second valve. Keyboard nudges round to 1 µm, so one assertion compares at that precision.
- Verification (Node v22.23.2, pnpm 9.15.4):
  - `pnpm typecheck` PASS.
  - `pnpm test` PASS (632 tests).
  - `pnpm build` PASS.
  - `pnpm test:e2e` PASS (59 tests).
  - Screenshot: the owner's plant connected, tee locked as parent of 11, one +90° turn swings the whole plant.
  - GitHub Actions CI not awaited (owner direction).
- Status: T-040 REVIEW until PR is merged (after #37, #38).

## 2026-10-15 — T-041 copy and paste of components and assemblies
- Branch: `feat/T-041-copy-paste` (from `feat/T-040-assemblies` @ `e94113c`, PR #39 open; targets `develop`).
- Owner request: copy/paste for a component and for a parent with its connected children. Defaults stated before work: separate Copy component / Copy assembly, Ctrl+C / Ctrl+Shift+C / Ctrl+V, offset by copy width + 0.5 m along +X, internal connections and parent links remapped, tag bindings and outside connections not copied, in-editor snapshot clipboard, copy allowed when locked and paste not.
- Graphify: index NOT built. Fallback: read assembly, graph and editor code directly.
- Scope: core `copyComponents`, `pasteComponents`, `clipboardWidth` (API snapshot updated); editor clipboard, buttons, shortcuts, validation of the pasted scene, selection of the pasted root, notes.
- Tests written first: 9 core tests (one test title broke the file through shell quoting and one width expectation was wrong, 4.2 instead of 5.2 m; both fixed before implementation) and 4 e2e tests failed before implementation.
- Verification (Node v22.23.2, pnpm 9.15.4):
  - `pnpm typecheck` PASS.
  - `pnpm test` PASS (640 tests).
  - `pnpm build` PASS.
  - `pnpm test:e2e` PASS (63 tests).
  - GitHub Actions CI not awaited (owner direction).
- Status: T-041 REVIEW until PR is merged (after #39).

## 2026-10-15 — Fix: Connect touching ports reported joined pairs as problems
- Branch: `feat/T-041-copy-paste` (separate commit after T-041 @ `86e9cac`).
- Reported by the owner with a screenshot: after copying and pasting assemblies into a large plant, "Connect touching ports" listed every already-connected pair as "occupied", flooding the panel.
- Cause: `findTouchingPorts` treated any connected port as occupied, including ports connected to the very partner they touch. Fix: pairs already joined to each other (either direction) are skipped; `occupied` now means used by a different connection. The editor note lists at most five problems, then "…and N more".
- Tests: core regression test (failed before the fix); e2e on a fixture of the owner's plant with 10 of 11 joints connected, which now shows only "Connected 1 touching port pair."
- Verification (Node v22.23.2, pnpm 9.15.4): `pnpm typecheck` PASS; `pnpm test` PASS (641 tests); `pnpm build` PASS; `pnpm test:e2e` PASS (64 tests). GitHub Actions CI not awaited (owner direction).

