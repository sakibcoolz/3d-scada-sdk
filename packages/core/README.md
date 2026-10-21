# @sakibcoolz/core

Framework-neutral scene model for 3D SCADA scenes: typed component ports, connections, validation, schema migration, snapping, orthogonal pipe routing, open-joint and collision checks, telemetry bindings. No rendering, no network.

```sh
npm install @sakibcoolz/core
```

```ts
import { parseScene, validateScene } from '@sakibcoolz/core';
```

Part of the [3D SCADA SDK](https://github.com/sakibcoolz/3d-scada-sdk). API reference: [docs/API.md](https://github.com/sakibcoolz/3d-scada-sdk/blob/develop/docs/API.md). ESM only, Node.js 20+.

The SDK visualises and simulates; it does not connect to or control PLCs or physical equipment.

MIT licence.
