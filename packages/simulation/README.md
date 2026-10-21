# @sakibcoolz/simulation

**Optional, deterministic process simulation** for scenes built with the [3D SCADA SDK](https://github.com/sakibcoolz/3d-scada-sdk): tank levels and pipe flows over time, for demos, training and what-if checks. Two models: a fast **mass-balance** model and a **hydraulic** model with friction, fitting losses and pump curves. Results are always labelled `SIMULATED`.

```sh
npm install @sakibcoolz/simulation @sakibcoolz/core @sakibcoolz/components
```
ESM only · Node.js 20+ or browser · TypeScript types included · MIT

## Quick start

```js
import { createSimulation } from '@sakibcoolz/simulation';

const at = (id, type, properties) => ({
  id, type, position: { x: 0, y: 0, z: 0 }, rotation: { x: 0, y: 0, z: 0, w: 1 },
  scale: { x: 1, y: 1, z: 1 }, properties,
});
const plant = {
  schemaVersion: 3, units: 'm',
  components: [at('t', 'tank', { level: 80 }), at('v', 'valve', { open: true }), at('p', 'pipe', { length: 2 })],
  connections: [
    { id: 'c1', from: { instanceId: 't', portId: 'outlet' }, to: { instanceId: 'v', portId: 'in' } },
    { id: 'c2', from: { instanceId: 'v', portId: 'out' }, to: { instanceId: 'p', portId: 'in' } },
  ],
};

const sim = createSimulation(plant);               // mass balance (default)
const state = sim.step(30);                         // advance 30 s
state.levels.t;                                     // tank level in %, lower than 80
state.flows;                                        // per connection, source: 'SIMULATED'
state.model;                                        // { name: 'mass-balance', version: 1 }

const hydraulic = createSimulation(plant, { model: 'hydraulic' }).step(30);
```

Show it in 3D by passing the state to the viewer, which then marks levels and flows as SIMULATED: `<Scada3DViewer scene={plant} simulation={state} />` ([`@sakibcoolz/react`](https://www.npmjs.com/package/@sakibcoolz/react)).

## API
- `createSimulation(scene, { model?, feeds?, pumps?, dt?, clock? })` → `{ state(), step(seconds), update(scene), configure({ feeds, pumps }), reset() }`.
  - `feeds`: `[{ at: { instanceId, portId }, rate }]` (m³/s) into a free port or a tank.
  - `pumps`: per pump id, a rate (mass balance) or a curve `{ shutoffHead, design: { rate, head } }` (hydraulic).
  - `update(scene)` keeps tank volumes when topology or valve states change.
- `vesselOf(type, properties?)` — vessel shape from the catalog, following each tank's dimensions: `volumeAt`, `heightAt`, `portHeight`, `percentAt`, `volumeAtPercent`, `maxVolume`.
- `MODEL`, `HYDRAULIC` — model constants; `frictionFactor(re, relativeRoughness)`; `TANK`.

**Mass balance:** gravity drain q = Cd·A·√(2gΔh) through open paths, feeds and pump rates, equal tee splits, closed valves and stopped pumps block; explicit Euler in 0.1 s steps; notes such as `overflow`, `dry`, `blocked`.
**Hydraulic:** elevation and pressure, Darcy–Weisbach friction (Swamee–Jain), K-factor fittings, pump curves, resistance-based tee splits, tank-to-tank flow and backflow; trees only (a loop is reported as `loop`).

## Not a control system
Simulation only: it never reads from or writes to real equipment, and every result carries `source: 'SIMULATED'`.

Licence: MIT
