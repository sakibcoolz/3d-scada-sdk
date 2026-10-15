# Release packaging and consumer verification (T-024)

The three SDK packages ship as compiled ES modules with type declarations. They are **not published** to any registry: releases are verified and handed over as tarballs. Licence: proprietary (`UNLICENSED`, see `LICENSE`).

## What a package contains
| Package | Depends on | Tarball contents |
|---|---|---|
| `@scada3d/core` | nothing | `dist/` (JS, `.d.ts`, source maps with inlined sources), `LICENSE`, `package.json` |
| `@scada3d/components` | `@scada3d/core` | same layout |
| `@scada3d/react` | core, components, asset-import, `three`, `@types/three`, `@react-three/fiber`, `@react-three/drei`; peers `react`/`react-dom` 19 | same layout |
| `@scada3d/asset-import` | nothing | same layout |
| `@scada3d/simulation` (optional) | core, components | same layout |

- Inside the workspace, `exports` still points at `src/` so the playground, Vitest and Playwright use source directly. `pnpm pack` applies `publishConfig`, so the tarball's `exports`/`types`/`main` point at `dist/`, and `workspace:*` becomes the exact version.
- Built with `tsc -p tsconfig.build.json` per package. Relative imports in source carry `.js` extensions, so the output also runs in plain Node, without a bundler. That matters for core, e.g. validating scenes on a server.
- `@types/three` is a runtime dependency of `@scada3d/react` because its public declarations use three's `Camera` type.
- Tests, benchmarks and fixtures are not packed.

## Verify a release
```sh
pnpm verify:consumer                    # build, pack, install into a fresh app outside the workspace
CONSUMER_APP=<printed dir> pnpm test:consumer   # browser check of that app's production build
```
`scripts/verify-consumer.mjs`:
1. builds the packages and packs the tarballs;
2. copies `examples/consumer-vite` to a new temporary directory (or `CONSUMER_WORKDIR`);
3. points its `@scada3d/*` dependencies and npm `overrides` at the tarballs;
4. runs `npm install` (plain npm, no pnpm workspace; needs the npm registry for React, three and Vite);
5. lists the installed SDK packages (one copy each), then runs `npm run typecheck`, `npm run build` and `npm run node-check`.

`node-check.mjs` imports core, components, simulation and asset-import in plain Node. It validates a scene, checks it has no open joints, checks that a DN150 → DN100 joint is refused, simulates a tank draining with both models, and checks that the SVG sanitizer accepts a clean drawing and refuses a script.

`e2e-consumer/consumer.spec.ts` serves the app's production build and checks:
- the viewer renders the tank → valve → reducer → DN100 pipe scene with no open joints;
- the editor adds a ball valve and undoes it;
- the console has no errors.

## Licensing check
Licences of everything installed in the consumer app (2026-10-15):
- **Runtime dependencies of the SDK:** all MIT, ISC, Apache-2.0 or BSD-3-Clause. `webgl-constants` (via drei → detect-gpu) has no `license` field, but its LICENSE file is MIT.
- **The consumer's own build tooling:** `caniuse-lite` (CC-BY-4.0, via Vite/Babel) is not shipped by the SDK.
- Re-check when dependencies change.

## Not done here
- Publishing to npm or a private registry needs a separate owner decision.
- Semantic-version policy and changelog.
- CommonJS builds: ESM only.
