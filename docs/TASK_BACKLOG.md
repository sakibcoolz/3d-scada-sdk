# Authoritative Implementation Backlog

Statuses: TODO / IN_PROGRESS / BLOCKED / REVIEW / DONE. No task DONE without PR, tests and objective evidence. Dependency order and scope are specified in DEVELOPMENT_PLAN.md.

| ID | Gate | Priority | Depends on | Status | Deliverable and proof |
|---|---|---|---|---|---|
| T-001 | M0 | P0 | — | DONE | fresh clone pnpm install/typecheck/build passes (PRs #6, #7) |
| T-002 | M0 | P0 | T-001 | DONE | CI, unit/E2E runner and browser smoke (PRs #8, #9; develop CI green) |
| T-003 | M1 | P0 | T-002 | DONE | runtime scene schema and referential validation (`validateScene`, v1 shape; PR #10) |
| T-004 | M1 | P0 | T-003 | DONE | world-space port transforms and unit fixtures (`rotateVector`, `portToWorld`; PR #11) |
| T-005 | M1 | P0 | T-003 | DONE | versioned deterministic scene roundtrip (scene v2 per ADR-0004, v1 migration, `serializeScene`/`parseScene`; #18 merged into the T-010 branch by stacking, landed on develop via PR #19) |
| T-006 | M2 | P0 | T-004 | DONE | aligned industrial geometry, ports, disposal (part descriptors, elbow, geometry disposal; PR #13) |
| T-007 | M3 | P0 | T-004,T-006 | DONE | compatible snap search and transform solver (`findSnapCandidates`, `snapComponent`; PR #14) |
| T-008 | M3 | P0 | T-003,T-007 | DONE | persistent graph, cycles, tee and occupancy (`connect`, `disconnect`, `removeComponent`, traversal; PR #15) |
| T-009 | M3 | P0 | T-008 | DONE | pipe routing, elbow and tee geometry (`routeScene`, route meshes, `?demo` network; PR #16) |
| T-010 | M4 | P0 | T-007,T-009 | DONE | 3D canvas raycast drag/drop (ground-plane drop, snap preview, Escape cancel; PR #17) |
| T-011 | M4 | P0 | T-005,T-010 | DONE | gizmos and atomic undo/redo (move/rotate gizmos, snapshot history with gesture merging; PR #20) |
| T-012 | M4 | P0 | T-011 | DONE | scene import/export and browser roundtrip (Export JSON, file/text import, byte-identical e2e roundtrip; PR #21) |
| T-013 | M5 | P1 | T-008,T-009 | DONE | measured/simulated flow-state resolver (`resolveFlow`, per-connection readings; PR #22) |
| T-014 | M5 | P1 | T-013 | DONE | animated directional flow and stale cases (instanced markers, unknown/stale overlays, SIMULATED badge, `flow` prop; PR #23) |
| T-015 | M5 | P1 | T-006,T-011 | DONE | glass, X-ray, cutaway, water and heat (view modes + per-component override, level policy, temperature tint; PR #24) |
| T-016 | M6 | P1 | T-012,T-013 | DONE | read-only telemetry, tag quality/timestamps (tagBindings per ADR-0006, `resolveTelemetry`, `displayScene`, binding editor; PR #25) |
| T-017 | M6 | P1 | T-016 | DONE | optional DataProvider snapshot/subscribe or setTagValues API; no-network test and cleanup (`createObservationStore`, `connectProvider`, `telemetry.provider`, `ScadaHandle.setTagValues`; PR #26) |
| T-018 | M6 (post-MVP) | P2 | T-017 | TODO | host-owned transport integration examples (REST, WebSocket, MQTT/backend OPC UA), not SDK dependencies; not an MVP release blocker |
| T-019 | M7 (post-MVP) | P2 | T-006 | TODO | sanitized SVG extrusion/reference mapping |
| T-020 | M7 (post-MVP) | P2 | T-019 | TODO | glTF importer, provenance and disposal |
| T-021 | M7 | P2 | T-013,T-016 | TODO | mass-balance simulation and fixtures |
| T-022 | M7 | P2 | T-021 | TODO | optional pressure model, verified assumptions |
| T-023 | M7 (MVP gate) | P0 | T-002,T-015,T-017 | IN_PROGRESS | MVP perf baseline, security, accessibility and public API hardening for the shipped SDK (core, components, react); parts: A API surface (DONE, PR #28), B security (REVIEW, PR #29), C accessibility (REVIEW, PR #31), D performance (REVIEW) |
| T-024 | M8 | P0 | T-023 | TODO | independent consumer release verification |
| T-025 | Research | P2 | T-021 | TODO | CFD research ADR; not MVP |
| T-026 | Research | P2 | T-011 | TODO | optional rigid-body ADR; not core |
| T-027 | Tooling | P1 | T-001 | TODO | local Graphify index, source-linked query/freshness, agent integration, token benchmark |
| T-028 | M7 (post-MVP) | P2 | T-018,T-020,T-023 | TODO | hardening for post-MVP surfaces: transport examples, SVG/glTF import (asset sanitisation, provenance, resource limits) |
| T-029 | M7 (post-MVP) | P1 | T-023 | TODO | rendering scale: shared geometry per catalog type, equipment instancing, LOD, allocation-free flow markers; measure against docs/PERFORMANCE.md on a hardware GPU |

## Release-path change (owner-approved 2026-10-15)
T-023 was split so the MVP release gate depends only on MVP-critical work (T-002, T-015, T-017), as MVP.md requires. Hardening of post-MVP surfaces moved to T-028. T-018, T-019 and T-020 are post-MVP and not release blockers. T-024 still depends on T-023.

## Execution rules
- Pick earliest unblocked P0 unless owner changes priority; T-027 may proceed alongside M1 after T-001.
- Graphify guides navigation but doesn't replace code inspection, tests or accepted requirements.
- Mark DONE only with PR and evidence. Block uncertain safety/security requirements rather than improvising.
