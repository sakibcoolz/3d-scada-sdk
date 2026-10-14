# Authoritative Implementation Backlog

Statuses: TODO / IN_PROGRESS / BLOCKED / REVIEW / DONE. No task DONE without PR, tests and objective evidence. Dependency order and scope are specified in DEVELOPMENT_PLAN.md.

| ID | Gate | Priority | Depends on | Status | Deliverable and proof |
|---|---|---|---|---|---|
| T-001 | M0 | P0 | — | DONE | fresh clone pnpm install/typecheck/build passes (PRs #6, #7) |
| T-002 | M0 | P0 | T-001 | DONE | CI, unit/E2E runner and browser smoke (PRs #8, #9; develop CI green) |
| T-003 | M1 | P0 | T-002 | DONE | runtime scene schema and referential validation (`validateScene`, v1 shape; PR #10) |
| T-004 | M1 | P0 | T-003 | DONE | world-space port transforms and unit fixtures (`rotateVector`, `portToWorld`; PR #11) |
| T-005 | M1 | P0 | T-003 | TODO | versioned deterministic scene roundtrip |
| T-006 | M2 | P0 | T-004 | DONE | aligned industrial geometry, ports, disposal (part descriptors, elbow, geometry disposal; PR #13) |
| T-007 | M3 | P0 | T-004,T-006 | DONE | compatible snap search and transform solver (`findSnapCandidates`, `snapComponent`; PR #14) |
| T-008 | M3 | P0 | T-003,T-007 | REVIEW | persistent graph, cycles, tee and occupancy (`connect`, `disconnect`, `removeComponent`, traversal) |
| T-009 | M3 | P0 | T-008 | TODO | pipe routing, elbow and tee geometry |
| T-010 | M4 | P0 | T-007,T-009 | TODO | 3D canvas raycast drag/drop |
| T-011 | M4 | P0 | T-005,T-010 | TODO | gizmos and atomic undo/redo |
| T-012 | M4 | P0 | T-011 | TODO | scene import/export and browser roundtrip |
| T-013 | M5 | P1 | T-008,T-009 | TODO | measured/simulated flow-state resolver |
| T-014 | M5 | P1 | T-013 | TODO | animated directional flow and stale cases |
| T-015 | M5 | P1 | T-006,T-011 | TODO | glass, X-ray, cutaway, water and heat |
| T-016 | M6 | P1 | T-012,T-013 | TODO | read-only telemetry, tag quality/timestamps |
| T-017 | M6 | P1 | T-016 | TODO | optional DataProvider snapshot/subscribe or setTagValues API; no-network test and cleanup |
| T-018 | M6 | P1 | T-017 | TODO | host-owned transport integration examples (REST, WebSocket, MQTT/backend OPC UA), not SDK dependencies |
| T-019 | M7 | P1 | T-006 | TODO | sanitized SVG extrusion/reference mapping |
| T-020 | M7 | P1 | T-019 | TODO | glTF importer, provenance and disposal |
| T-021 | M7 | P2 | T-013,T-016 | TODO | mass-balance simulation and fixtures |
| T-022 | M7 | P2 | T-021 | TODO | optional pressure model, verified assumptions |
| T-023 | M7 | P1 | T-002,T-015,T-018,T-020 | TODO | perf/security/a11y and API hardening |
| T-024 | M8 | P0 | T-023 | TODO | independent consumer release verification |
| T-025 | Research | P2 | T-021 | TODO | CFD research ADR; not MVP |
| T-026 | Research | P2 | T-011 | TODO | optional rigid-body ADR; not core |
| T-027 | Tooling | P1 | T-001 | TODO | local Graphify index, source-linked query/freshness, agent integration, token benchmark |

## Execution rules
- Pick earliest unblocked P0 unless owner changes priority; T-027 may proceed alongside M1 after T-001.
- Graphify guides navigation but doesn't replace code inspection, tests or accepted requirements.
- Mark DONE only with PR and evidence. Block uncertain safety/security requirements rather than improvising.
