# Release packaging and consumer verification (T-024)

The SDK packages ship as compiled ES modules with type declarations and are published to npm as public `@sakibcoolz/*` packages (T-058, T-059, ADR-0019). Licence: MIT (see `LICENSE`, copied into every package).

## What a package contains
| Package | Depends on | Tarball contents |
|---|---|---|
| `@sakibcoolz/core` | nothing | `dist/` (JS, `.d.ts`, source maps with inlined sources), `LICENSE`, `package.json` |
| `@sakibcoolz/components` | `@sakibcoolz/core` | same layout |
| `@sakibcoolz/react` | core, components, asset-import, `three`, `@types/three`, `@react-three/fiber`, `@react-three/drei`; peers `react`/`react-dom` 19 | same layout |
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
- the console has no errors.

## Licensing check
Licences of everything installed in the consumer app (2026-10-15):
- **Runtime dependencies of the SDK:** all MIT, ISC, Apache-2.0 or BSD-3-Clause. `webgl-constants` (via drei → detect-gpu) has no `license` field, but its LICENSE file is MIT.
- **The consumer's own build tooling:** `caniuse-lite` (CC-BY-4.0, via Vite/Babel) is not shipped by the SDK.
- Re-check when dependencies change.

## Migration notes for hosts
- **0.2.0, control equipment library (T-080, ADR-0025):** additive and opt-in (`controlLibrary`).
  - Host types may no longer use the `sdk.` prefix.
  - A definition's `build` may also return `variables`.
- **0.2.0, tag suggestions and review (T-079, ADR-0024):** additive.
  - `ComponentDefinition.variables`, `catalogResolvers.resolveVariables` and registry `resolvers.resolveVariables`.
  - New exports `suggestVariables`, `applyTagSuggestions` and `reviewTags`.
- **0.2.0, bindings, quality and acquisition (T-078, ADR-0024):**
  - `Quality` gains `DISCONNECTED`, and `TelemetryUnknownReason` and `FlowUnknownReason` gain `DISCONNECTED`. Code with an exhaustive switch or a `Record` over them must add it.
  - New error code `TYPE_MISMATCH`.
  - New export `projectAcquisition`.
- **0.2.0, data sources and runtime variables (T-077, ADR-0024):**
  - `ScadaScene` gains optional `dataSources` and `runtimeVariables`. Code that rebuilds a scene field by field must carry them.
  - `SceneValidationErrorCode` gains four codes, and `SceneLimits` gains `maxDataSources` and `maxVariables`.
- **0.2.0, graph queries (T-076, ADR-0023):** additive: `neighbours`, `relatedComponents`, `pathBetween`, `physicalDomains`, optional filters on the older helpers, and an optional `resolvePorts` on `lockConnectedAsChildren`. Without the new arguments, results are unchanged.
- **0.2.0, associations (T-075, ADR-0023):**
  - `ScadaScene` gains optional `associations`. Code that rebuilds a scene field by field must carry it; spread the scene instead.
  - `GraphErrorCode` adds `UNKNOWN_ASSOCIATION`, and `SceneLimits` adds `maxAssociations`.
- **0.2.0, connection fields (T-074, ADR-0023):**
  - `SceneConnection` gains optional `domain`, `relationship` and `properties`. Code that rebuilds connections as `{id, from, to}` drops them; spread the connection instead.
  - `routeScene` no longer returns a route for power, signal or network connections, so the routes array can be shorter than `connections`. Look routes up by `connectionId`.
- **0.2.0, port domains (T-073, ADR-0023):**
  - `PortKind` gains `power` and `network`; `electrical` is deprecated. TypeScript code that switches exhaustively on `PortKind` must handle the new values.
  - `INCOMPATIBLE_PORTS` messages now name the failed rule; the code is unchanged.
  - Snapping, touching and attach ignore power, signal and network ports.
  - Nothing changes for scenes whose ports are all fluid.
- **0.2.0, open component registry (T-071, ADR-0022):**
  - `ComponentInstance.type` is now `ComponentType`, which is `ComponentKind` or a namespaced string. TypeScript code that switches exhaustively on `ComponentKind`, or indexes `componentCatalog[c.type]`, must handle other types. Use `isBuiltInKind(type)` or a registry's `definitionFor`.
  - Resolver callbacks you write yourself take `ComponentType`.
  - Nothing changes at runtime for hosts that use only built-in kinds.
- **0.2.0, scene version 4 (T-068, ADR-0021):**
  - Saved files are now `schemaVersion: 4` with `documentType: "industrial.scene"`. Older SDKs (0.1.x) cannot open them.
  - v1, v2 and v3 files still load, and report `migratedFrom`. The editor's import message says "(migrated from version 3)" for them.
  - The in-memory `ScadaScene` type now has `schemaVersion: 4` and `documentType`. Code that builds scenes by hand updates the literal, or starts from `createEmptyScene()`.
  - The new optional identity, label and extension fields need no change in hosts that do not use them.
- **0.1.0 → ASME fittings (T-050, ADR-0014):** elbows, tees and reducers changed size, so their ports moved. The editor's import upgrades older files automatically. A host that loads saved scenes itself (`parseScene`/`validateScene` and then the viewer) must also call:

  ```ts
  upgradeDimensions(scene, { ...catalogResolvers, ...legacyCatalogResolvers })
  ```

  Otherwise joints next to those fittings show as open joints or filler runs. `examples/consumer-vite` does this; the consumer check caught the case.
- **Tank family (T-053 to T-056, ADR-0017, ADR-0018):** new kinds `horizontalTank`, `sphericalTank` and `pool`; files using them need this SDK version. `vesselOf(type, properties?)` follows each tank's dimensions; existing calls without properties still give the default shape.
- **ASME valves and nozzles (T-052, ADR-0016):** the ball valve is now its B16.10 face-to-face (DN150: 267 mm instead of 1.2 m), so its ports moved. The same `upgradeDimensions` call closes up older files, including those saved after T-050. Tanks take `nozzleSize` and the pump `suctionSize`/`dischargeSize` (absent = DN150, nothing changes). `HYDRAULIC.lengths` was removed; valve flow length comes from geometry. The editor's import message now reads "Updated N parts to ASME dimensions."

## Publish (T-058, ADR-0019)
1. All checks green on `develop`, including `pnpm verify:consumer` and `pnpm test:consumer`.
2. `git tag -a vX.Y.Z` on `develop`, push the tag, and create the GitHub Release with the packed tarballs attached.
3. `npm login` as the owner of the `@sakibcoolz` scope (T-059: the packages are published under the owner's npm user scope), then from the repository root:

   ```sh
   pnpm -r publish --access public --no-git-checks --dry-run   # check contents first
   pnpm -r publish --access public --no-git-checks
   ```
   pnpm publishes in dependency order and rewrites `workspace:*` to the exact version, as `pnpm pack` does.

## Not done here
- Semantic-version policy and changelog.
- CommonJS builds: ESM only.
