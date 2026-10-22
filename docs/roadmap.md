# Roadmap

High-level progress. `docs/TASK_BACKLOG.md` owns task status; a checked box means implemented and tested, not merely planned.

## Delivered (0.1.x)
- [x] Workspace foundation, catalog, basic viewer and drag-to-add playground
- [x] Snap compatible ports and edit the connection graph
- [x] Automatic straight/elbow/tee routing
- [x] Animated directional flow linked to valve state
- [x] Glass, X-ray and cutaway component display modes
- [x] Scene save/load with schema validation and migrations (scene version 4 from 0.2.0, with a published JSON Schema)
- [x] Import sanitized SVG drawings as reference underlays
- [x] Host-supplied, read-only telemetry through `DataProvider` / `setTagValues`. The SDK opens no network connection; transport (WebSocket, MQTT, OPC UA, Modbus) stays in the host.
- [x] Automated tests, CI and publishable public API and bundles (`@sakibcoolz/*` on npm)
- [x] First-person walkthrough: desktop Walk and WebXR (headset path not yet verified on a device)
- [ ] Tank, pump, motor and sensor variants. Tank families and the pump are done; motor and sensor are still geometry-only placeholders.

## Industrial model (M9, docs/INDUSTRIAL_SDK_PLAN.md)
- [x] Phase 1: industrial scene document (scene v4, JSON Schema, specification)
- [ ] Phase 2: open component registry (custom types without SDK changes)
- [ ] Phases 3–4: port and connection domains (power, signal, network, logical)
- [ ] Phase 5: tag engine (labels, runtime variables, data sources, typed protocol addresses)
- [ ] Phase 6: control equipment libraries (PLC, DCS, VFD, sensors, motors, panels)
- [ ] Phase 7: 2D process and electrical views, synchronized with 3D
- [ ] Phases 8–9: advanced editor and locked runtime mode
- [ ] Phase 10: host-neutral acquisition projection and command-request boundary
- [ ] Phase 11: hardening and the 0.2.0 release
