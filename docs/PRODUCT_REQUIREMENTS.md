# Product Requirements — Industrial 3D SCADA SDK

**Status:** Baseline v0.1. **Audience:** SDK maintainers, coding agents, industrial application developers.

## Product intent
A reusable, framework-neutral 3D industrial visualization engine plus a React editor/viewer adapter; developed independently from Z-Factory and embeddable in any compliant application. It is a visualization and layout-authoring SDK, **not a PLC runtime or safety controller**.

## Personas / use cases
1. Process designer drags tanks, silos, pipes, elbows, tees, cross-junctions, valves, pumps, motors, sensors, conveyors and other equipment into a scene.
2. Designer moves/rotates/scales equipment and connects typed ports with snapping and routed pipes.
3. Operator views liquid fill, valve position, motor motion, pressure and temperature in a read-only live view.
4. Integrator imports/exports versioned scene JSON and supplies telemetry through a documented adapter; embeds renderer without editor UI.
5. Author adds new components without modifying core editor or renderer.

## Functional requirements (IDs)
- FR-01 component catalog, metadata, geometry and configurable dimensions.
- FR-02 typed connection ports with world transforms and compatibility checking.
- FR-03 deterministic graph for explicit edges, tees, elbows, reducers and cycles.
- FR-04 drag/drop, transform handles, snap, connect/disconnect, undo/redo.
- FR-05 process visualization: fill/drain, directional pipe-flow, heat/temperature, alarm states.
- FR-06 normal, glass, X-ray and section/cutaway modes (with meaningful interior representation).
- FR-07 stable scene JSON import/export, validation, migrations and deterministic serialization.
- FR-08 framework-neutral core API and React integration with editor/viewer exports.
- FR-09 transport-independent, optional read-only observation inputs (imperative updates or host DataProvider); stale/quality indicators and safe subscription disposal; editor/viewer must run fully offline without WebSocket.
- FR-10 accessible editor controls, keyboard basics and selection inspection.
- FR-11 loadable reusable GLB/glTF models; SVG is **input reference only** unless geometry can be reconstructed correctly.
- FR-12 examples, searchable component documentation and extensibility guide.

## Nonfunctional constraints
- NFR-01 TypeScript strict, modules with explicit package exports and typed public contracts.
- NFR-02 no PLC credentials or commands inside core components; separate trust domains.
- NFR-03 deterministic scene persistence; isolated rendering; robust cleanup on unmount.
- NFR-04 testable topology/math without WebGL; integration and browser smoke tests.
- NFR-05 configurable quality levels and measurement-based rendering budgets; no invented FPS guarantees.
- NFR-06 consistent units: metres, radians, seconds, °C / kPa / litres via explicit display conversions.
- NFR-07 no proprietary SVG, logo, model, texture or FUXA asset inclusion without verified license.

## Explicit non-goals of early milestones
Physics-grade CFD, real-time safety control, automatic engineering CAD conversion, formal IEC 62443 certification, vendor PLC emulation and plant-wide safety interlocks.

## MVP acceptance scenario
Place a vertical tank, connect an outlet to a ball valve then straight pipe and tee branch; save/reload the exact topology; change valve and level via simulated telemetry; display directional flow and stale data; toggle shell transparency; edit/undo without corrupting connections. Verify in automated tests and playground.
