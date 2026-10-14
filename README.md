# 3D SCADA SDK

Reusable industrial 3D visualization SDK for Three.js, with a React editor/viewer layer.

## Workspace
- `@scada3d/core`: definitions, ports, registry and scene data
- `@scada3d/components`: procedural industrial geometry
- `@scada3d/react`: React Three Fiber rendering and editor
- `apps/playground`: Vite research playground

## Quick start
Install Node.js 20+ and pnpm 9+.

```sh
corepack enable
pnpm install
pnpm dev
```

Open the Vite URL (usually http://localhost:5173). Try placing tanks, valves, straight pipes and T-junctions, moving them with the selected object's position controls, switching glass mode and editing process values.

This initial milestone is a prototype. It does **not** connect to PLCs or control physical equipment. Fluid effects are visual indicators, not a hydraulic simulation. Read `docs/architecture.md` for planned connectors and safety boundaries.
