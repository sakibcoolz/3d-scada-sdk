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
