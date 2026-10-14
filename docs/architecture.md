# Architecture

The SDK is independent from Z-Factory or any other SCADA server.

## Packages
1. **core**: serializable scene, component instances, local-coordinate typed connection ports, graph interfaces.
2. **components**: geometry definitions + standard catalog.
3. **react**: React Three Fiber viewer and initial drag-to-add editor.
4. **playground**: isolated R&D app. No PLC access.

## Runtime plan
- Build a connection graph from explicit port-to-port edges (not visual overlap).
- Snapping requires compatible port types, size and opposite-facing normals in world space.
- Pipe routing and elbows should generate meshes along connected points.
- Telemetry adapters map read-only process tags into displayed properties.
- Camera visualization state must not affect process data.
- Export/import scenes via versioned schema and validation.
- For industrial deployment separate display from control; command writes require authentication, authorization, validation, audit and safety interlocks at the trusted control boundary.

## MVP-0 implemented
- Editable scene, basic component palette, drag-to-add, port markers, orbit camera.
- Procedural tank, pipe, tee, valve, motor, sensor, pump placeholders.
- Tank liquid level and glass material toggle.
- Manual flow indicator on pipe (not a physically accurate animation).

## Not yet implemented
- Port-to-port snapping and persistent connection editor.
- Automatic pipe routing, animated fluid particles, real fluid simulation.
- Scene import, undo/redo, 3D rotation gizmos, physics, SVG conversion, live PLC adapters.
- Published bundles, automated CI, dependency lockfile.

Do not use the prototype for safety-critical physical control.
