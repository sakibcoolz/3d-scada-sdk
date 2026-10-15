# 3D SCADA SDK

Reusable industrial 3D visualization SDK for Three.js, with a React editor/viewer layer.

## Start here
- [Project summary](docs/PROJECT_SUMMARY.md): purpose, capabilities, existing code and future architecture.
- [MVP specification](docs/MVP.md): scope, acceptance demo and release boundary.
- [Agent entry point](AGENTS.md) and [agent file map](docs/AGENT_FILE_MAP.md): mandatory reading order and development workflow.
- [Rules](rules.md) and [architecture](docs/ARCHITECTURE.md): engineering constraints.

**Transport-neutral and offline-capable:** the SDK requires no WebSocket, MQTT, PLC or network connection. Host applications may inject optional values; there is no direct PLC control API.

## Workspace
- `@scada3d/core`: definitions, ports, registry and scene data
- `@scada3d/components`: procedural industrial geometry
- `@scada3d/react`: React Three Fiber rendering and editor
- `apps/playground`: Vite research playground
- `examples/consumer-vite`: stand-alone app that installs the packed SDK tarballs (see [release packaging](docs/RELEASE.md))

**Licence:** proprietary, all rights reserved (`UNLICENSED`; see [LICENSE](LICENSE)). The packages are not published to npm; releases are verified and shared as tarballs (`pnpm verify:consumer`).

## Quick start
Install Node.js 20+ and pnpm 9+.

```sh
corepack enable
pnpm install
pnpm dev
```

Open the Vite URL (usually http://localhost:5173). Try placing tanks, valves, straight pipes and T-junctions, moving them with the selected object's position controls, switching glass mode and editing process values.

This initial milestone is a prototype. It does **not** connect to PLCs or control physical equipment. Fluid effects are visual indicators, not a hydraulic simulation. Read `docs/ARCHITECTURE.md` for planned connectors and safety boundaries.
