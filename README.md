# 3D SCADA SDK

Reusable industrial 3D visualization SDK for Three.js, with a React editor/viewer layer.

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
- `@sakibcoolz/views-2d`: 2D process view (SVG, P&ID style) over the same scene, with automatic placement and saved layouts (playground `?view=process`)
- Control equipment library: opt-in `controlLibrary` of generic PLC, I/O, drive, motor, instrument and panel types (playground `?control`)
- `apps/playground`: Vite research playground
- `examples/consumer-vite`: stand-alone app that installs the packed SDK tarballs (see [release packaging](docs/RELEASE.md))

**Licence:** [MIT](LICENSE). Contributions are welcome: see [CONTRIBUTING.md](CONTRIBUTING.md); report vulnerabilities as in [SECURITY.md](SECURITY.md).

## Install
```sh
npm install @sakibcoolz/core @sakibcoolz/components @sakibcoolz/react three @react-three/fiber @react-three/drei react react-dom
npm install @sakibcoolz/simulation   # optional
```
ESM only, Node.js 20+. Releases are verified against a stand-alone consumer app before publishing (`pnpm verify:consumer`, see [release packaging](docs/RELEASE.md)). Component dimensions follow common ASME tables and must be verified before engineering use; the SDK is not a certified design tool.

## Quick start
Install Node.js 20+ and pnpm 9+.

```sh
corepack enable
pnpm install
pnpm dev
```

Open the Vite URL (usually http://localhost:5173). Try placing tanks, valves, straight pipes and T-junctions, moving them with the selected object's position controls, switching glass mode and editing process values.

This initial milestone is a prototype. It does **not** connect to PLCs or control physical equipment. Fluid effects are visual indicators, not a hydraulic simulation. Read `docs/ARCHITECTURE.md` for planned connectors and safety boundaries.
