# Changelog

All `@sakibcoolz/*` packages share one version. Upgrading from 0.1.x: [docs/UPGRADING_TO_0.2.md](docs/UPGRADING_TO_0.2.md).

## 0.2.0
The industrial model: equipment that is wired and controlled, not only piped, described for acquisition and shown to operators in a locked runtime. The SDK still never connects to or writes to a device.

### Added
- **Scene document version 4** (`documentType: "industrial.scene"`):
  - project and revision, component names, labels and namespaced extensions;
  - versions 1–3 still load.
- **Host component types** (`createComponentRegistry`) and an opt-in **control equipment library** (`controlLibrary`): PLC, I/O, drive, motor, instruments and panels.
- **Port domains:** fluid, mechanical, power, signal and network, with compatibility rules, connection fields, and relationships without ports (`associations`). New graph queries: `neighbours`, `relatedComponents` and `pathBetween`.
- **Acquisition description:**
  - data sources and runtime variables with typed Modbus and OPC UA addresses;
  - references to credentials, never the credentials;
  - `projectAcquisition` for a host gateway;
  - tag suggestions and review;
  - the editor's Tags… dialog.
- **Typed telemetry:** observations may state a data type, and a value that does not fit is shown as unknown. `DISCONNECTED` quality.
- **2D views** (new package `@sakibcoolz/views-2d`): process and electrical diagrams with automatic placement, saved layouts and sanitized host symbols. `ScadaWorkspace` puts 3D and 2D side by side with one selection.
- **`ScadaRuntime`:**
  - a locked operator view of an approved revision, pinned by revision and SHA-256 digest (`sceneDigest`);
  - host alarms and quality per component (`componentStatus`).
- **Command requests** (opt-in, ADR-0029):
  - bounded writable variables;
  - a form and a confirmation;
  - one request to the host's `onCommandRequest`, with the revision and digest.

  The host authorizes and writes; the controller's interlocks decide.
- **Editor:** port inspector, connection editing per domain, relationship panel, floor slab, first-person walkthrough and WebXR.
- **Host guides and examples:**
  - [RUNTIME_INTEGRATION.md](docs/RUNTIME_INTEGRATION.md);
  - transport examples in `examples/transports/` (REST, SSE and WebSocket, not published);
  - a migration corpus and golden projection fixtures in the core package.

### Changed
- **Saved files are version 4,** which 0.1.x cannot open.
- **The default parse cap** is 32 MB (was 10 MB).
- **Stricter credential detection:** component properties are now checked, more key names are caught, and endpoint query parameters are checked.
- **Live values must fit their declared type.**
- **Number fields take plain decimals only.**

### Fixed (security review, T-096)
- **Inherited names as ids** no longer crash validation, telemetry or the 2D views (`constructor`, `toString`, `__proto__`).
- **A confirmation is re-checked** against the approved document at Send.
- **Folding host alarms** is now linear.
- **Hostile alarm and command-status values** no longer crash the runtime.
- **Host type registration** reports bad definitions instead of throwing.

Details: [SECURITY_AND_SAFETY.md](docs/SECURITY_AND_SAFETY.md), under "M9 security review".

### Performance
- **Measured at the validator limits:**
  - 10,000 components, about 20,000 connections, 20,000 variables and 20,000 bindings;
  - validation takes 83 ms, and opening a document in the runtime about 0.5 s.

  See [PERFORMANCE.md](docs/PERFORMANCE.md).

## 0.1.2
The first complete npm release, as `@sakibcoolz/*`: core, components, react, simulation and asset-import. The code is the same as 0.1.0.

## 0.1.1
Renamed to the `@sakibcoolz` scope. Only `core` was published.

## 0.1.0
The first public release (MIT):
- the scene model with typed ports, validation and schema v3;
- snapping, routing and checks;
- the industrial catalog with ASME fittings and valves;
- the React Three Fiber viewer and editor;
- simulation;
- the SVG underlay sanitizer.
