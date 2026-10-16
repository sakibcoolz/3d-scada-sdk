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
| [0018](adr/0018-tank-family-2.md) | Accepted | Horizontal tank, spherical tank and pool kinds; braced stands; `lathe` axis, `strut`, `holds` and `vesselProfile` for their volumes; cut liquids |

## New ADR template
Title / Status (Proposed/Accepted/Superseded) / Context / Options considered / Decision / Trade-offs / Consequences / Migration / Tests / Date / Approvers. Owner approval required before altering public schema or safety boundaries.

## Planning decisions (no ADR required)
| Date | Decision | Approver |
|---|---|---|
| 2026-10-15 | Split T-023 so the MVP release gate depends on T-002, T-015, T-017 only; post-MVP hardening moves to T-028; T-018–T-020 are post-MVP | repository owner |
