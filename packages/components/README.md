# @sakibcoolz/components

The **industrial parts catalog** of the [3D SCADA SDK](https://github.com/sakibcoolz/3d-scada-sdk): tanks, pipes, ASME fittings, valves and pumps, each described as plain data — **ports** (where pipes connect), **size settings**, **bounds** and framework-free **3D geometry parts**. It does not draw anything itself; use it with [`@sakibcoolz/core`](https://www.npmjs.com/package/@sakibcoolz/core) (scene model, validation, routing) and [`@sakibcoolz/react`](https://www.npmjs.com/package/@sakibcoolz/react) (3D viewer and editor).

```sh
npm install @sakibcoolz/components @sakibcoolz/core
```
ESM only · Node.js 20+ · TypeScript types included · MIT

## The parts

| Kind (`type`) | Ports | Settings (`properties`) |
|---|---|---|
| `tank` (vertical) | `inlet`, `outlet` | `diameter`, `height`, `head` (`flat` / `dished`), `standHeight`, `nozzleSize`, `capacityUnit`; live `level`, `temperature` |
| `conicalTank` | `inlet` (top), `outlet` | `nozzleSize`, `capacityUnit` |
| `horizontalTank` | `inlet` (top), `outlet` (end) | `diameter`, `length`, `standHeight`, `nozzleSize`, `capacityUnit` |
| `sphericalTank` | `inlet` (top), `outlet` | `diameter`, `standHeight`, `nozzleSize`, `capacityUnit` |
| `pool` (open basin) | `inlet`, `outlet` | `length`, `width`, `depth`, `nozzleSize`, `capacityUnit` |
| `pipe` | `in`, `out` | `length`, `size` |
| `elbow` (90°, long radius) | `in`, `out` | `size` |
| `tee` | `left`, `right`, `branch` | `size` |
| `valve` (ball valve) | `in`, `out` | `size`, `open` |
| `reducer` | `in`, `out` | `size` (inlet), `outletSize` |
| `coupler` | `in`, `out` | `size`, `length` |
| `pump` (centrifugal) | `suction`, `discharge` | `suctionSize`, `dischargeSize` |
| `sensor`, `motor` | — | placeholders |

- Pipe sizes **DN50, DN80, DN100, DN150 (default), DN200**. Ports only join when their sizes match.
- Dimensions follow commonly published ASME tables: B36.10M pipe OD, B16.9 long-radius elbows, tees and reducers, B16.10 Class 150 ball-valve face-to-face, B16.5 Class 150 flanges.
- Leave a setting out and its default applies (e.g. a 2 m × 3 m flat-topped vertical tank).
- Each tank's name plate shows its computed capacity (m³, L or US gal).

## Quick start: describe and check a plant

A scene is plain JSON: components with a position (metres, Y up) and rotation (quaternion), plus connections between named ports.

```js
import { parseScene, findOpenJoints, routeScene } from '@sakibcoolz/core';
import { asme, catalogResolvers } from '@sakibcoolz/components';

const at = (id, type, x, y, properties = {}) => ({
  id, type, position: { x, y, z: 0 }, rotation: { x: 0, y: 0, z: 0, w: 1 },
  scale: { x: 1, y: 1, z: 1 }, properties,
});
const F = asme.DN150.valveFaceToFace; // 0.267 m

const scene = {
  schemaVersion: 3, units: 'm',
  components: [
    at('T1', 'tank', 0, 1.535, { level: 60 }),          // outlet at x = 1.2, y = 0.635
    at('V1', 'valve', 1.2 + F / 2, 0.635, { open: true }),
    at('P1', 'pipe', 1.2 + F + 1, 0.635, { length: 2 }),
  ],
  connections: [
    { id: 'c1', from: { instanceId: 'T1', portId: 'outlet' }, to: { instanceId: 'V1', portId: 'in' } },
    { id: 'c2', from: { instanceId: 'V1', portId: 'out' }, to: { instanceId: 'P1', portId: 'in' } },
  ],
};

const result = parseScene(JSON.stringify(scene), catalogResolvers);
if (!result.ok) throw new Error(result.errors[0].message); // unknown port, size mismatch, bad setting…
findOpenJoints(result.scene, catalogResolvers);             // [] — every joint meets
routeScene(result.scene, catalogResolvers);                 // pipe routes for connections that do not touch
```

**`catalogResolvers` is the bridge to core.** It tells core where each part's ports are, how big it is and which settings are valid. Pass it to every core function: `parseScene`, `validateScene`, `snapComponent`, `attachComponents`, `routeScene`, `findOpenJoints`, `findCollisions`, `upgradeDimensions`, …

To see it in 3D, hand the scene to [`@sakibcoolz/react`](https://www.npmjs.com/package/@sakibcoolz/react): `<Scada3DViewer scene={result.scene} />`.

## Working with a single part

```js
import { definitionFor, capacityOf, formatCapacity, validateProperties, componentPresets } from '@sakibcoolz/components';

const silo = definitionFor('tank', { diameter: 3, height: 4.5, head: 'dished', standHeight: 0.8 });
silo.ports;   // inlet at (-1.7, 1.55, 0) facing -X; outlet at (1.7, -1.65, 0) facing +X (local metres)
silo.bounds;  // local box, used for placement and collisions
silo.parts;   // cylinders, cones, lathes… to draw it with any 3D library
formatCapacity(capacityOf(silo.parts), 'L');      // "35,300 L"

validateProperties('tank', { diameter: 50 });     // [{ property: 'diameter', message: 'must be between 0.6 and 12 m' }]
componentPresets.map((p) => p.label);             // "Vertical Tank (Large)", "Cylindrical Tank (Small)", …
```

`definitionFor(type, properties)` is the main entry point: it returns the part's actual ports, bounds, geometry and parameter specs for those settings (cached, so the same settings return the same object). Ports are in the part's local frame; use `portToWorld(component, port)` from core for world positions.

## API overview

| Export | Purpose |
|---|---|
| `componentCatalog` | default definition of every kind |
| `definitionFor(type, properties)` | definition for given settings (ports, bounds, parts, parameters) |
| `catalogResolvers` | `resolvePorts`, `resolveBounds`, `resolveBindable`, `validateProperties`, `bendRadiusFor` for core |
| `validateProperties`, `sizeParameterFor(type, portId)` | check settings; which setting sizes a port |
| `pipeSizes`, `outerRadiusFor`, `sizeOfPort`, `isPipeSize`, `DEFAULT_SIZE` | pipe sizes |
| `asme` | ASME dimensions per size (OD, wall, elbow, tee, reducer, valve face-to-face) |
| `jointStyle`, `asmeFlange`, `flangePairParts`, `flangeParts`, `weldParts`, `hasFlangedEnds` | flanged / welded joint hardware |
| `capacityOf`, `formatCapacity`, `vesselProfile`, `vesselSegments`, `segmentVolume`, `CAPACITY_UNITS` | vessel volumes |
| `componentPresets` | ready-made tank variants for palettes |
| `liquidProfile`, `isChoiceParameter` | rendering and UI helpers |
| `legacyCatalogResolvers` | with core's `upgradeDimensions`, brings scenes saved by older versions up to date |

Types: `IndustrialComponentDefinition`, `GeometryPart`, `PartRole`, `Bounds`, `ParameterSpec`, `PipeSize`, `AsmeSize`, `AsmeFlange`, `CapacityUnit`, `ComponentPreset`, `VesselProfile`, `VesselSegment`.

## Notes
- Changing a size or dimension can move a part's ports; re-check joints with `findOpenJoints`.
- ASME values are as published in common tables and **must be verified before engineering use** — this is not a certified design tool.
- The SDK visualises and simulates; it does not connect to or control PLCs or physical equipment.

Full API reference: [docs/API.md](https://github.com/sakibcoolz/3d-scada-sdk/blob/develop/docs/API.md) · Working app: [examples/consumer-vite](https://github.com/sakibcoolz/3d-scada-sdk/tree/develop/examples/consumer-vite) · Licence: MIT
