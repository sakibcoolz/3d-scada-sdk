# Release packaging and consumer verification (T-024)

The SDK packages ship as compiled ES modules with type declarations and are published to npm as public `@sakibcoolz/*` packages (T-058, T-059, ADR-0019). Licence: MIT (see `LICENSE`, copied into every package).

## What a package contains
| Package | Depends on | Tarball contents |
|---|---|---|
| `@sakibcoolz/core` | nothing | `dist/` (JS, `.d.ts`, source maps with inlined sources), `LICENSE`, `package.json` |
| `@sakibcoolz/core` schema files | — | also `schema/`: the JSON Schema and fixtures, including the migration corpus and projection golden files |
| `@sakibcoolz/components` | core, asset-import | same layout |
| `@sakibcoolz/views-2d` (new in 0.2.0) | core, components; peers `react`/`react-dom` 19 | same layout |
| `@sakibcoolz/react` | core, components, asset-import, views-2d, `three`, `@types/three`, `@react-three/fiber`, `@react-three/drei`; peers `react`/`react-dom` 19 | same layout |
| `@sakibcoolz/asset-import` | nothing | same layout |
| `@sakibcoolz/simulation` (optional) | core, components | same layout |

- Inside the workspace, `exports` still points at `src/` so the playground, Vitest and Playwright use source directly. `pnpm pack` applies `publishConfig`, so the tarball's `exports`/`types`/`main` point at `dist/`, and `workspace:*` becomes the exact version.
- Built with `tsc -p tsconfig.build.json` per package. Relative imports in source carry `.js` extensions, so the output also runs in plain Node, without a bundler. That matters for core, e.g. validating scenes on a server.
- `@types/three` is a runtime dependency of `@sakibcoolz/react` because its public declarations use three's `Camera` type.
- Tests, benchmarks and fixtures are not packed.

## Verify a release
```sh
pnpm verify:consumer                    # build, pack, install into a fresh app outside the workspace
CONSUMER_APP=<printed dir> pnpm test:consumer   # browser check of that app's production build
```
`scripts/verify-consumer.mjs`:
1. builds the packages and packs the tarballs;
2. copies `examples/consumer-vite` to a new temporary directory (or `CONSUMER_WORKDIR`);
3. points its `@sakibcoolz/*` dependencies and npm `overrides` at the tarballs;
4. runs `npm install` (plain npm, no pnpm workspace; needs the npm registry for React, three and Vite);
5. lists the installed SDK packages (one copy each), then runs `npm run typecheck`, `npm run build` and `npm run node-check`.

`node-check.mjs` imports core, components, simulation and asset-import in plain Node. It validates a scene, checks it has no open joints, checks that a DN150 → DN100 joint is refused, simulates a tank draining with both models, and checks that the SVG sanitizer accepts a clean drawing and refuses a script.

`e2e-consumer/consumer.spec.ts` serves the app's production build and checks:
- the viewer renders the tank → valve → reducer → DN100 pipe scene with no open joints;
- the editor adds a ball valve and undoes it;
- the 2D process view draws one symbol per component and the three pipes;
- `ScadaRuntime` (T-097):
  - shows the approved revision with "digest verified" and the host alarm;
  - switches to the electrical and process views;
  - sends exactly one confirmed command request, which the example host records and answers;
- the console has no errors.

## Licensing check
Licences of everything installed in the consumer app (2026-10-15):
- **Runtime dependencies of the SDK:** all MIT, ISC, Apache-2.0 or BSD-3-Clause. `webgl-constants` (via drei → detect-gpu) has no `license` field, but its LICENSE file is MIT.
- **The consumer's own build tooling:** `caniuse-lite` (CC-BY-4.0, via Vite/Babel) is not shipped by the SDK.
- Re-check when dependencies change.

## Migration notes for hosts
- **0.1.x → 0.2.0:** see [UPGRADING_TO_0.2.md](UPGRADING_TO_0.2.md), one guide ordered by what a host must change. The per-task notes it was written from are in WORK_LOG.md and the ADRs.
- **Before 0.2.0** (all also covered by the guide's `upgradeDimensions` step):
- **0.1.0 → ASME fittings (T-050, ADR-0014):** elbows, tees and reducers changed size, so their ports moved. The editor's import upgrades older files automatically. A host that loads saved scenes itself (`parseScene`/`validateScene` and then the viewer) must also call:

  ```ts
  upgradeDimensions(scene, { ...catalogResolvers, ...legacyCatalogResolvers })
  ```

  Otherwise joints next to those fittings show as open joints or filler runs. `examples/consumer-vite` does this; the consumer check caught the case.
- **Tank family (T-053 to T-056, ADR-0017, ADR-0018):** new kinds `horizontalTank`, `sphericalTank` and `pool`; files using them need this SDK version. `vesselOf(type, properties?)` follows each tank's dimensions; existing calls without properties still give the default shape.
- **ASME valves and nozzles (T-052, ADR-0016):** the ball valve is now its B16.10 face-to-face (DN150: 267 mm instead of 1.2 m), so its ports moved. The same `upgradeDimensions` call closes up older files, including those saved after T-050. Tanks take `nozzleSize` and the pump `suctionSize`/`dischargeSize` (absent = DN150, nothing changes). `HYDRAULIC.lengths` was removed; valve flow length comes from geometry. The editor's import message now reads "Updated N parts to ASME dimensions."

## Publish (T-058, ADR-0019; 0.2.0 in T-097)
1. All checks green on `develop`, including `pnpm verify:consumer` and `pnpm test:consumer`.
2. **The owner publishes** the packed tarballs, in dependency order: asset-import, core, components, views-2d, simulation, react. The npm account uses passkey 2FA, so publish from a terminal with web authentication:

   ```sh
   script -qfec "npm publish <tarball>.tgz --access public --auth-type=web" /dev/null
   ```
   - npm prints an approval link. The owner approves it in the browser.
   - Never interrupt a publish that is waiting for approval: npm may then stage the version and refuse a re-publish.
   - `@sakibcoolz/views-2d` is published for the first time in 0.2.0.
   - New versions can take some minutes to appear: check with `npm view @sakibcoolz/<package> version`.
3. **Tag and release after publishing:** `git tag -a vX.Y.Z` on `develop`, push the tag, and create the GitHub Release from CHANGELOG.md, with the packed tarballs attached.
4. **Check a fresh install from the registry.** `examples/consumer-vite` pins the release version, so a plain install in a copy of it uses npm, not the tarballs:

   ```sh
   cp -r examples/consumer-vite /tmp/registry-check && cd /tmp/registry-check
   npm install && npm run typecheck && npm run build && npm run node-check
   ```

## Not done here
- CommonJS builds: ESM only.
