# Component authoring standard

## Contract
Each catalog entry must supply:
- immutable unique type ID / schema version / category / display label;
- dimensions and unit-aware editable properties with defaults, min/max and validation;
- local-space geometry origin, bounding box, coordinate convention and optional LOD;
- typed named ports, local position, outward unit direction, nominal diameter and constraints;
- rendering implementation for normal and glass/X-ray where applicable;
- process value mapping (e.g. temperature, level, RPM), alarm indication, stale state;
- safe resource disposal on unmount, test fixture, visual demo and usage documentation.

## Current catalog (T-006)
`@scada3d/components` exports `componentCatalog: Record<ComponentKind, IndustrialComponentDefinition>`. Each entry adds to the core `ComponentDefinition`:
- `bounds`: axis-aligned local bounds in the default (open) state; `defaultSize` is derived from them.
- `parts`: framework-neutral `GeometryPart` descriptors (`cylinder`, `sphere`, `box`, quarter-torus `bend`) in local metres, each with a `role` (`shell`, `liquid`, `valve-ball`, `valve-handle`) that tells the renderer which live state applies.

Fluid ports default to nominal bore 0.15 m (DN150) and nozzles of outer radius `pipeOuterRadius` (0.084 m). Joints (T-051, ADR-0015): flanged (ASME B16.5 Class 150 weld-neck pair with bolts) where a valve, pump or tank is on either side; butt-weld beads between pipe and fittings; a free flanged port shows a single flange (`jointStyle`, `asmeFlange`, `flangePairParts`, `flangeParts`, `weldParts`). Dimensions (T-050, T-052, ADR-0014, ADR-0016): pipe outside diameters follow ASME B36.10M, elbows (long radius), equal tees and concentric reducers follow ASME B16.9, and the ball valve's face-to-face follows ASME B16.10 Class 150 short pattern (178–292 mm) (`asme` table; values to be verified against the standard, not a certified design tool). Pipe sizes (T-045, ADR-0009): `pipeSizes` lists DN50, DN80, DN100, DN150 and DN200 (bore = `nominalSize`, outer diameters 60.3, 88.9, 114.3, 168 and 219.1 mm). Pipe, elbow, tee, valve, reducer and coupler take `properties.size` (absent = DN150); every port and every part ending at a port is drawn at that size. Pipe and coupler ports do not move with size; ASME fittings and the valve scale. Tank nozzles take `nozzleSize` and the pump `suctionSize`/`dischargeSize` (DN50–DN200, absent = DN150; ports never move); `sizeParameterFor(type, portId)` names the choice for a port. The **reducer** (0.3 m; `size` inlet, `outletSize` outlet, default DN150 → DN100, sizes must differ) joins different sizes through a cone; the **coupler** (`size`, `length` 0.05–0.2 m, default 0.1 m) is a short sleeve between equal ends. Every port direction is axis-aligned and points away from the bounds face the port lies on. Kinds: vertical tank (inlet, outlet, liquid column; `diameter` 0.6–12 m and `height` 0.8–20 m, default 2 × 3 m (T-053, ADR-0017); `head` flat or dished (2:1 semi-ellipsoidal, depth D/4); `standHeight` 0–3 m, absent = no stand, new tanks 0.8 m: four legs with feet, X-braced from 0.3 m; palette presets in `componentPresets`), horizontal tank (ADR-0018: along X, `diameter`/`length`, 2:1 dished ends, four cross-braced legs `standHeight` below, top inlet, end outlet), spherical tank (`diameter`, four legs at the equator, top inlet, low side outlet), pool (open basin `length`/`width`/`depth`, 0.15 m walls, inlet near the rim, outlet near the floor, plate on the front wall), conical tank (ADR-0013: 2 m cylinder over a 1 m cone on three legs; top inlet; tip outlet bending out to +X 0.4 m above ground; liquid as a `lathe` part cut by `liquidProfile`). Both tanks carry the shared front `levelGauge` (glass tube with its own liquid column, 10 % ticks, name plate showing the capacity from `capacityOf` in `capacityUnit`: m³, L or US gal), straight pipe, 90° elbow (bend radius 0.3 m, origin at the axis intersection), tee (left, right, branch), ball valve (flanged, B16.10 face-to-face; ball, stem and lever within it), centrifugal pump placeholder (suction, discharge). Sensor and motor are placeholders without ports.

`@scada3d/react` builds Three.js geometry from the parts (`createEquipmentGeometries`) and disposes it on unmount (`disposeGeometries`). Tests check, against the real Three.js vertices, that geometry fills exactly the declared bounds, that each fluid port is centred on a pipe opening of `pipeOuterRadius`, and that no geometry extends past any port plane.

Configurable dimensions (T-033, T-045): a definition may declare shape `parameters` stored in `properties`: numeric (`NumberParameterSpec`: label, unit, default (what an absent value means), min, max, step, optional `initial` for new parts and `keepsBottom` to keep the lowest point in place when edited) or a fixed choice (`ChoiceParameterSpec`: label, choices, default; `isChoiceParameter`). Geometry parts are cylinders, spheres, boxes, bends and cones (`radiusStart` at the −axis end). The straight pipe declares `length` (m, default 2, 0.2–20); `definitionFor(type, properties)` returns the per-instance definition (ports, bounds and parts follow the length; cached per value), `validateProperties` reports out-of-range values, and `catalogResolvers` bundles `resolvePorts`/`resolveBounds` (both receive the component's properties), `resolveBindable` and `validateProperties` for core. Not yet: sized tank/pump nozzles, eccentric reducers, drain port, mechanical/signal ports for motor and sensor, per-file component directories below.

## Proposed directories (target)
```
packages/components/src/tanks/vertical-tank/
  definition.ts
  ports.ts
  geometry.ts
  materials.ts
  telemetry.ts
  fixtures.ts
  index.ts
```

## Equipment hierarchy
Fluid: tank, silo, vessel, pipe, elbow, tee, cross, reducer, valve, pump, heat exchanger, filter. Electrical/mechanical: motor, switch, conveyor, actuator. Instrumentation: temperature, pressure, level, flow sensors.

## Geometry requirements
Use real 3D primitives or licensed GLB/glTF assets; source SVGs can inform shape but cannot represent hidden internal geometry on their own. Avoid z-fighting, reversed normals, leaking water through caps and material transparency ordering. Use correct tee branch geometry and clearance.

## Animation semantics
A valve can be open visually without implying verified process flow. Flow animation requires validated source state, direction and quality; tank fill should derive from explicit level tag (or labelled demo simulation), not decrement autonomously in production.

## Acceptance example
Vertical tank with configurable dimensions, lid, inlet/outlet/drain ports, 0–100% fill, normal and glass shell, safe disposal, port transforms and validation tests.
