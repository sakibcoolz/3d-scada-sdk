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
