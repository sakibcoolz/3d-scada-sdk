# Verification and testing strategy

## Mandatory automated layers
1. **Unit (core):** graph invariants, type compatibility, rotations, transforms, validation, migration and deterministic serialization.
2. **Component tests:** geometry dimensions, defined port locations/normals, material-state variations and disposal.
3. **Integration:** editor commands -> scene update -> renderer props; telemetry -> quality-aware view state; isolated multiple editors.
4. **Browser E2E:** drag/drop on canvas, connect/disconnect, tee branch, transform, undo/redo, save/reload, glass, level, flow and stale indicators.
5. **Non-functional:** repeated mount/unmount leak detection, scene with many components, frame time and memory traces, adversarial JSON and bad asset handling.

## Bootstrap commands (currently available after dependencies install)
```sh
corepack enable
pnpm install
pnpm typecheck
pnpm build
pnpm dev
```
The repository does not yet provide a dedicated unit-test or E2E command. **T-002 must add test runner, CI and smoke tests.** Do not report these checks as passing before execution.

## Future standard commands
```sh
pnpm lint
pnpm test
pnpm test:e2e
pnpm build
```
These are desired tasks, not currently available scripts.

## Evidence in PR
Record command, runtime versions, result (PASS/FAIL/NOT RUN), failure details and follow-up. Include screenshot/video only as supporting evidence, never substitute for correctness assertions. Create reproducible fixtures and include edge cases listed in `SCENE_AND_CONNECTIONS.md`.

## Release blocking
Broken clean build, unresolved critical security issue, corrupt scene round-trip, dangling connections, unreviewed breaking API or unverified control behavior blocks release.
