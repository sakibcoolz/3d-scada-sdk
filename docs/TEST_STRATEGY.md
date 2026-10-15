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
`pnpm typecheck` runs `tsc --noEmit` in `@scada3d/core`, `@scada3d/components`, `@scada3d/react`, and `@scada3d/playground`, then typechecks the test projects. `pnpm test` runs Vitest. `pnpm test:e2e` runs Playwright against the playground production preview. `pnpm build` produces the playground Vite bundle. CI runs these in `.github/workflows/ci.yml`. `pnpm bench` runs the core benchmarks and `pnpm perf` the browser frame-time baseline (recorded in [PERFORMANCE.md](PERFORMANCE.md), not asserted; not part of CI). `pnpm verify:consumer` builds and packs the SDK, installs the tarballs into a copy of `examples/consumer-vite` outside the workspace and typechecks, builds and runs a plain-Node check there; `CONSUMER_APP=<dir> pnpm test:consumer` browser-tests that app (see [RELEASE.md](RELEASE.md)). `pnpm lint` is not available yet.

## Future standard commands
```sh
pnpm lint
pnpm test
pnpm test:e2e
pnpm build
```
`pnpm test`, `pnpm test:e2e`, and `pnpm build` exist. `pnpm lint` is still a later task. Do not report a check as passing before execution.

## Evidence in PR
Record command, runtime versions, result (PASS/FAIL/NOT RUN), failure details and follow-up. Include screenshot/video only as supporting evidence, never substitute for correctness assertions. Create reproducible fixtures and include edge cases listed in `SCENE_AND_CONNECTIONS.md`.

## Release blocking
Broken clean build, unresolved critical security issue, corrupt scene round-trip, dangling connections, unreviewed breaking API or unverified control behavior blocks release.
