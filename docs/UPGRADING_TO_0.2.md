# Upgrading from 0.1.x to 0.2.0

For developers of host applications that use `@sakibcoolz/*` 0.1.2 (the last 0.1 release on npm). The release notes are in [CHANGELOG.md](../CHANGELOG.md).

## 1. Install
```sh
npm install @sakibcoolz/core@0.2.0 @sakibcoolz/components@0.2.0 @sakibcoolz/react@0.2.0
# optional: @sakibcoolz/simulation@0.2.0, @sakibcoolz/asset-import@0.2.0
```
- **Keep every `@sakibcoolz/*` package at the same version.**
- **There is one new package:** `@sakibcoolz/views-2d` (2D process and electrical views). `@sakibcoolz/react` depends on it, so it installs with react.
- **New dependencies:** `@sakibcoolz/components` now depends on `@sakibcoolz/asset-import`, which sanitizes host symbols.
- **Requirements are unchanged:** Node.js 20+, React 19, ESM only.

## 2. Saved documents
- **0.2.0 saves version 4:** `schemaVersion: 4` with `documentType: "industrial.scene"`.
  - **0.1.x cannot open these files.** Upgrade every application that reads your documents before any of them saves one.
- **Older files load:** 0.2.0 reads versions 1, 2 and 3 and reports `migratedFrom`. A corpus of files written by earlier versions, each with its expected version 4 result, is tested on every change (`@sakibcoolz/core/schema/fixtures/migration/`).
- **If you load files yourself** (with `parseScene` or `validateScene`, rather than the editor's import), also re-seat parts saved before the ASME fitting and valve sizes:
  ```ts
  import { parseScene, upgradeDimensions } from '@sakibcoolz/core';
  import { catalogResolvers, legacyCatalogResolvers } from '@sakibcoolz/components';
  const loaded = parseScene(text, catalogResolvers);
  if (loaded.ok) scene = upgradeDimensions(loaded.scene, { ...catalogResolvers, ...legacyCatalogResolvers }).scene;
  ```
  Without it, joints next to older elbows, tees, reducers and ball valves show as open.
- **Files are larger than before.** `parseScene` now accepts up to 32,000,000 characters by default (was 10,000,000), and so does the editor (`MAX_SCENE_FILE_BYTES`). A document at the count limits is about 16 MB. Pass `maxLength` to keep a lower cap.

## 3. Documents 0.1.x accepted that 0.2.0 refuses
Check your saved files with `validateScene` before deploying. Each item below is refused with the code shown.

| What | Code |
|---|---|
| A component property, label or extension key named like a credential: it contains `password`, `passwd`, `passphrase`, `secret`, `credential`, `apikey`, `accesskey` or `privatekey`, ends in `token`, is `pwd` or `auth`, or starts with `authorization` (case, `-`, `_` and `.` ignored) | `SECRET_FIELD` |
| An `endpointRef` with a user name or password (also after leading spaces), or with a secret-named query parameter such as `?password=` | `SECRET_FIELD` |
| A tag binding to an inherited name such as `constructor` or `toString` (0.1.x threw or accepted it) | `UNBINDABLE_PROPERTY` |
| A host component type starting `sdk.` (reserved for the SDK's control library) | registration error |

**What to do with a credential:** store a reference that your host resolves, such as `endpointRef: "host:plc-01"`, and never the credential itself.

## 4. TypeScript changes
Most changes are additive. These ones can break a build:

- **`ComponentInstance.type` is `ComponentType`:** a built-in `ComponentKind` or a namespaced host type such as `com.example.press`.
  - Code that switches exhaustively on `ComponentKind`, or indexes `componentCatalog[c.type]`, must handle other types. Use `isBuiltInKind(type)` or a registry's `definitionFor`.
  - Resolver callbacks you write take `ComponentType`.
- **`ScadaScene` is version 4:** `schemaVersion: 4` and `documentType` are required. Code that builds scenes by hand updates the literal, or starts from `createEmptyScene()`.
- **New optional fields to carry:**
  - `ScadaScene` gains `project`, `associations`, `dataSources`, `runtimeVariables`, `views` and `extensions`;
  - `SceneConnection` gains `domain`, `relationship` and `properties`;
  - components gain `name`, `labels`, `extensions` and others.

  Code that rebuilds objects field by field (`{ id, from, to }`) drops them: spread the original instead.
- **Unions that grew:**
  - `PortKind` gains `power` and `network`; `electrical` is deprecated;
  - `Quality` gains `DISCONNECTED`;
  - `TelemetryUnknownReason` gains `DISCONNECTED` and `TYPE_MISMATCH`, and `FlowUnknownReason` gains `DISCONNECTED`;
  - `SceneValidationErrorCode` gains codes, among them `TYPE_MISMATCH`, `UNKNOWN_VIEW_REFERENCE` and the data-source and variable codes;
  - `GraphErrorCode` gains `UNKNOWN_ASSOCIATION`;
  - `SceneLimits` gains `maxAssociations`, `maxDataSources` and `maxVariables`.

  An exhaustive `switch`, or a `Record` keyed by one of these, needs the new cases.
- **`RuntimeVariable.access`** may be `'readWrite'`, with required `command` limits.
- **`routeScene`** no longer returns routes for power, signal or network connections. Look routes up by `connectionId`, not by index.

## 5. Behaviour changes
- **Live values must fit their declared type.** An unscaled `int16` tag that receives 1.5, or a value whose stated `dataType` differs from the variable's, is shown as unknown (`INVALID_VALUE`, `TYPE_MISMATCH`). Send engineering values, and scale in your gateway.
- **A link that is down** should be reported as `DISCONNECTED`. The last value is then never shown as current.
- **Host alarms** come back from `componentStatus` as plain data: text `id` and `message`, a boolean `acknowledged`, and only string `componentId`, `tagId` and `since`. An unknown severity is shown as critical.
- **Number fields** in the editor's Tags… dialog and in command requests take plain decimal numbers only (`0x10` is refused).
- **`createComponentRegistry`** refuses parameters that are not objects or that have non-finite limits.
- **Variable addresses:** each may hold at most 64 JSON values, and they no longer use up the 10,000-value extension budget.
- **The editor's import message** reads "(migrated from version 3)" for 0.1.x files.

## 6. New in 0.2.0 (optional to adopt)
- **Industrial model:**
  - host component types (`createComponentRegistry`), and an opt-in control equipment library (`controlLibrary`: PLC, I/O, drive, motor, instruments, panels);
  - port domains (fluid, mechanical, power, signal, network), and relationships without ports (`associations`).
- **Acquisition description:**
  - `dataSources` and `runtimeVariables` with typed Modbus and OPC UA addresses;
  - `projectAcquisition` for your gateway;
  - tag suggestions (`suggestVariables`, `reviewTags`).
- **2D views and workspace:** process and electrical views (`@sakibcoolz/views-2d`), and `ScadaWorkspace` with one selection across 3D and 2D.
- **Locked runtime:** `ScadaRuntime`, pinned by revision and SHA-256 digest, with host alarms and quality per component.
- **Command requests (opt-in):**
  - `onCommandRequest` raises a confirmed, bounded request to your application;
  - the SDK never writes to a device.

  See [RUNTIME_INTEGRATION.md](RUNTIME_INTEGRATION.md).
- **Transport examples** (copy into your app; not published): REST polling, Server-Sent Events and WebSocket data providers, in `examples/transports/`.

## 7. If you need to roll back
- **Pin 0.1.2 again.** Documents saved by 0.2.0 (version 4) do not open in 0.1.x, and 0.1.x never downgrades a document silently. Keep the version 3 copies of anything you may need to open there.
