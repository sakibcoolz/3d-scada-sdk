# @sakibcoolz/simulation

Optional deterministic simulation for 3D SCADA scenes: mass balance and a hydraulic model with friction, fittings and pump curves. Results are always labelled SIMULATED; nothing here talks to real equipment.

```sh
npm install @sakibcoolz/simulation
```

```ts
import { createSimulation } from '@sakibcoolz/simulation';
```

Part of the [3D SCADA SDK](https://github.com/sakibcoolz/3d-scada-sdk). API reference: [docs/API.md](https://github.com/sakibcoolz/3d-scada-sdk/blob/develop/docs/API.md). ESM only, Node.js 20+.

The SDK visualises and simulates; it does not connect to or control PLCs or physical equipment.

MIT licence.
