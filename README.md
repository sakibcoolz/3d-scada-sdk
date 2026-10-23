# 3D SCADA SDK: industrial 3D HMI and digital twin toolkit for Three.js and React

[![npm](https://img.shields.io/npm/v/@sakibcoolz/react?label=npm)](https://www.npmjs.com/package/@sakibcoolz/react) [![licence: MIT](https://img.shields.io/badge/licence-MIT-blue)](LICENSE) [![live demo](https://img.shields.io/badge/demo-live-brightgreen)](https://sakibcoolz.github.io/3d-scada-sdk/demo/)

An open-source TypeScript SDK for building **3D SCADA and HMI screens in the browser**: tanks, pumps, valves and ASME piping joined by a typed port graph, a React Three Fiber **editor and viewer**, **2D P&ID and electrical views** of the same scene, and a **locked operator runtime** that shows host-supplied live values and alarms.

**[Website](https://sakibcoolz.github.io/3d-scada-sdk/) · [Live demo](https://sakibcoolz.github.io/3d-scada-sdk/demo/) · [npm](https://www.npmjs.com/package/@sakibcoolz/react) · [Changelog](CHANGELOG.md)**

![A milk processing line built in the playground editor: horizontal, vertical, conical and spherical tanks on braced stands, each filled and emptied through bottom valves and pumps, with transfer lines on an overhead pipe rack, shown in Glass view on the floor slab with the Walk and VR buttons.](docs/images/milk-processing-line.png)

*A milk processing line in the playground editor (Glass view). 49 components and 50 connections, DN80 lines on a 7 ft pipe rack.*

## Start here
- [Project summary](docs/PROJECT_SUMMARY.md): purpose, capabilities, existing code and future architecture.
- [MVP specification](docs/MVP.md): scope, acceptance demo and release boundary.
- [Agent entry point](AGENTS.md) and [agent file map](docs/AGENT_FILE_MAP.md): mandatory reading order and development workflow.
- [Rules](rules.md) and [architecture](docs/ARCHITECTURE.md): engineering constraints.

**Transport-neutral and offline-capable:** the SDK requires no WebSocket, MQTT, PLC or network connection. Host applications may inject optional values; there is no direct PLC control API.

## Workspace
- `@sakibcoolz/core`: definitions, ports, registry and scene data
- `@sakibcoolz/components`: procedural industrial geometry
- `@sakibcoolz/react`: React Three Fiber rendering and editor
- `@sakibcoolz/asset-import`: SVG sanitizer for reference underlays (no DOM; shapes and paths only)
- `@sakibcoolz/simulation`: optional deterministic mass-balance simulation (always labelled SIMULATED; playground `?simulate`)
- `@sakibcoolz/views-2d`: 2D process (P&ID style) and electrical views (SVG) over the same scene, with automatic placement, saved layouts and sanitized host symbols and `ScadaWorkspace` in `@sakibcoolz/react` for 3D and 2D side by side with one selection (playground `?control&layout=split`)
- `ScadaRuntime`: a locked operator view of an approved revision, pinned by revision and SHA-256 digest, with no edit path, showing host-supplied alarms and quality per component, and offering confirmed command *requests* to the host for bounded writable variables (the SDK never writes; playground `?runtime`)
- Control equipment library: opt-in `controlLibrary` of generic PLC, I/O, drive, motor, instrument and panel types (playground `?control`)
- `apps/playground`: Vite research playground
- `examples/transports`: host code to copy, not published: REST polling, Server-Sent Events and WebSocket `DataProvider`s (see [runtime integration](docs/RUNTIME_INTEGRATION.md))
- `examples/consumer-vite`: stand-alone app that installs the packed SDK tarballs (see [release packaging](docs/RELEASE.md))

**Licence:** [MIT](LICENSE). Contributions are welcome: see [CONTRIBUTING.md](CONTRIBUTING.md); report vulnerabilities as in [SECURITY.md](SECURITY.md).

## Install
```sh
npm install @sakibcoolz/core @sakibcoolz/components @sakibcoolz/react three @react-three/fiber @react-three/drei react react-dom
npm install @sakibcoolz/simulation   # optional
```
ESM only, Node.js 20+. What changed in each release: [CHANGELOG.md](CHANGELOG.md); upgrading from 0.1.x: [docs/UPGRADING_TO_0.2.md](docs/UPGRADING_TO_0.2.md). Releases are verified against a stand-alone consumer app before publishing (`pnpm verify:consumer`, see [release packaging](docs/RELEASE.md)). Component dimensions follow common ASME tables and must be verified before engineering use; the SDK is not a certified design tool.

## Quick start
Install Node.js 20+ and pnpm 9+.

```sh
corepack enable
pnpm install
pnpm dev
```

Open the Vite URL (usually http://localhost:5173). Try placing tanks, valves, straight pipes and T-junctions, moving them with the selected object's position controls, switching glass mode and editing process values.

This initial milestone is a prototype. It does **not** connect to PLCs or control physical equipment. Fluid effects are visual indicators, not a hydraulic simulation. Read `docs/ARCHITECTURE.md` for planned connectors and safety boundaries.
