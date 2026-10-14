# Architecture decision index

Use one ADR per significant decision. Accepted decisions are binding; proposals are not. Never remove accepted ADRs — supersede them.

| ADR | Status | Decision |
|---|---|---|
| [0001](adr/0001-core-renderer-separation.md) | Accepted | Separate semantic core from framework/rendering adapters |
| [0002](adr/0002-explicit-port-graph.md) | Accepted | Connections are explicit typed endpoint graph |
| [0003](adr/0003-readonly-telemetry.md) | Accepted | SDK is view-first and read-only for MVP |
| [0004](adr/0004-scene-document-v2.md) | Proposed | Scene document v2 (schemaVersion, units, quaternion, scale) with migration from v1 |
| [0005](adr/0005-connection-engine-package.md) | Proposed | Move snapping and graph operations from core into `@scada3d/connection-engine` |

## New ADR template
Title / Status (Proposed/Accepted/Superseded) / Context / Options considered / Decision / Trade-offs / Consequences / Migration / Tests / Date / Approvers. Owner approval required before altering public schema or safety boundaries.
