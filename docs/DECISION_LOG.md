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

## New ADR template
Title / Status (Proposed/Accepted/Superseded) / Context / Options considered / Decision / Trade-offs / Consequences / Migration / Tests / Date / Approvers. Owner approval required before altering public schema or safety boundaries.

## Planning decisions (no ADR required)
| Date | Decision | Approver |
|---|---|---|
| 2026-10-15 | Split T-023 so the MVP release gate depends on T-002, T-015, T-017 only; post-MVP hardening moves to T-028; T-018–T-020 are post-MVP | repository owner |
