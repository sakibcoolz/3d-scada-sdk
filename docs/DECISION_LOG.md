# Architecture decision index

Use one ADR per significant decision. Accepted decisions are binding; proposals are not. Never remove accepted ADRs — supersede them.

| ADR | Status | Decision |
|---|---|---|
| [0001](adr/0001-core-renderer-separation.md) | Accepted | Separate semantic core from framework/rendering adapters |
| [0002](adr/0002-explicit-port-graph.md) | Accepted | Connections are explicit typed endpoint graph |
| [0003](adr/0003-readonly-telemetry.md) | Accepted | SDK is view-first and read-only for MVP |
| [0004](adr/0004-scene-document-v2.md) | Accepted | Scene document v2 (schemaVersion, units, quaternion, scale) with migration from v1 |
| [0005](adr/0005-connection-engine-package.md) | Rejected (MVP) | Move snapping/graph into `@scada3d/connection-engine` and routing into `@scada3d/pipe-routing` |
| [0006](adr/0006-tag-bindings-in-scene.md) | Accepted | Optional `tagBindings` in scene version 2 |
| [0007](adr/0007-structured-vectors-schema-v3.md) | Accepted | Scene version 3: named `{x, y, z}` / `{x, y, z, w}` vectors in files and the model; v1/v2 migrate |
| [0008](adr/0008-assemblies-parent-child.md) | Accepted | Assemblies: optional `parentId`, rigid group editing, built from connections |
| [0009](adr/0009-pipe-sizes-and-fittings.md) | Accepted | Pipe sizes DN50–DN200 as optional `properties.size` (absent = DN150); reducer and coupler kinds |
| [0010](adr/0010-simulation-package.md) | Accepted | Optional `@scada3d/simulation` package: deterministic mass-balance model (gravity drain, feeds, pumps), shown through a `simulation` prop, always SIMULATED |
| [0011](adr/0011-hydraulic-model.md) | Accepted | Optional `hydraulic` v1 simulation model: Darcy–Weisbach friction, K-factor fittings, quadratic pump curves, tree networks (loops reported) |
| [0012](adr/0012-svg-underlay.md) | Accepted | `@scada3d/asset-import`: allow-list SVG sanitizer without a DOM; optional sanitized `underlay` in scene v3 drawn as a ground-plane reference |
| [0013](adr/0013-conical-tank.md) | Accepted | `conicalTank` kind (legs, cone, side outlet, sight gauge, plate); `lathe` liquid following the vessel; simulation vessel shapes from the catalog |
| [0014](adr/0014-asme-dimensions.md) | Accepted | ASME B36.10M/B16.9 dimensions for pipe, elbows, tees and reducers (values to be verified against the standard); older files re-seated on load with `upgradeDimensions` |
| [0015](adr/0015-flanges-and-welds.md) | Accepted | Joints drawn as ASME B16.5 Class 150 flange pairs (valves, pumps, tanks) or butt-weld beads (pipe and fittings); routed bends at 1.5 × NPS; instanced and display only |
| [0016](adr/0016-valves-and-nozzles.md) | Accepted | Ball valve at ASME B16.10 Class 150 short-pattern face-to-face; tank `nozzleSize` and pump `suctionSize`/`dischargeSize`; `upgradeDimensions` handles files mixing generations |
| [0017](adr/0017-tank-family.md) | Accepted | Vertical tank `diameter`/`height`/`head` (flat or 2:1 dished), capacity on the name plate (`capacityUnit`), `vesselOf` follows dimensions, `componentPresets` in the palette |
| [0018](adr/0018-tank-family-2.md) | Accepted | Horizontal tank (F&D heads, saddles), spherical tank and pool kinds; braced stands; `lathe` axis, `strut`, `holds` and `vesselProfile` for their volumes; cut liquids |
| [0019](adr/0019-open-source-mit.md) | Accepted | Open source under MIT; public repository; `@scada3d/*` published to npm as public packages; v0.1.0 tag and GitHub Release (supersedes T-024's proprietary licence) |
| [0019](adr/0019-open-source-mit.md) (amended) | Accepted | npm packages published under the owner's scope as `@sakibcoolz/*` from v0.1.1 (the `scada3d` organisation did not exist) |
| [0020](adr/0020-webxr-walkthrough.md) | Accepted | Opt-in first-person walkthrough (`walkthrough` prop): desktop Walk (mouse look, WASD, equipment blocks) and WebXR Enter VR (true scale on `local-floor`, teleport, snap turn); view only; no new dependency, no network |
| [0020](adr/0020-webxr-walkthrough.md) (amended) | Accepted | Pick and connect in first person: click selects and C connects at the crosshair (Walk); trigger selects and grip connects (VR); through the view's `onSelect`, so the editor's attach rules apply |
| [0020](adr/0020-webxr-walkthrough.md) (amended, T-064) | Accepted | Edit the selected part while walking: focus returns to the editor, so its R, Delete, PageUp/PageDown, undo/redo and copy/paste shortcuts work; walk keys are taken first |
| [0021](adr/0021-scene-v4-industrial-document.md) | Accepted | Scene version 4, `documentType: "industrial.scene"`: optional project, component identity (name, typeVersion, manufacturer, model), labels and namespaced extensions; v1–v3 migrate losslessly; credential-like keys rejected (`SECRET_FIELD`) |
| [0022](adr/0022-open-component-registry.md) | Accepted | Open component registry: host types are namespaced ids (bare names reserved for built-ins); core `resolveType`; `createComponentRegistry` in components; viewer/editor `registry` prop; unknown types still rejected by validation |
| [0023](adr/0023-port-and-connection-domains.md) | Accepted (implemented T-073..T-076) | Port and connection domains: `kind` is the port domain (`fluid, mechanical, power, signal, network`; `electrical` deprecated); optional signal/power/network metadata and `maxConnections` (default 1); per-domain compatibility rules under `INCOMPATIBLE_PORTS`; optional connection `domain`/`relationship`/`properties`; port-less logical links in a separate root `associations` array; filtered graph traversal |
| [0024](adr/0024-runtime-variables-and-data-sources.md) | Accepted (implemented T-077..T-079) | Tag engine: optional root `dataSources` (protocol, device, opaque `endpointRef`, no credentials) and `runtimeVariables` (tag id, data type, unit, read-only access, protocol-typed OPC UA/Modbus address, descriptive linear scaling); binding type/unit checks; `DISCONNECTED` quality; pure `projectAcquisition`, `reviewTags` and `suggestVariables` (never auto-applied) |
| [0020](adr/0020-webxr-walkthrough.md) (amended, T-065) | Accepted | Place new parts at the Walk crosshair: P parts menu, click places (editor's drop plan, snapping, undo), X or right-click stops; the view's `walkPlacing` prop, supplied by the editor |

## New ADR template
Title / Status (Proposed/Accepted/Superseded) / Context / Options considered / Decision / Trade-offs / Consequences / Migration / Tests / Date / Approvers. Owner approval required before altering public schema or safety boundaries.

## Planning decisions (no ADR required)
| Date | Decision | Approver |
|---|---|---|
| 2026-10-15 | Split T-023 so the MVP release gate depends on T-002, T-015, T-017 only; post-MVP hardening moves to T-028; T-018–T-020 are post-MVP | repository owner |
| 2026-10-22 | Industrial SDK plan (T-067, docs/INDUSTRIAL_SDK_PLAN.md): evolve the scene to v4 with `documentType: "industrial.scene"` (integer schemaVersion); `ajv` allowed as a test-only dev dependency for JSON Schema agreement; 2D views in a new `@sakibcoolz/views-2d`; command requests are describe-plus-host-callback only and need an ADR amending ADR-0003 first; SDK stays host-independent, with no Z-Factory changes, adapters or docs; M9 ships as 0.2.0 | repository owner |
