# Authoritative Implementation Backlog

Statuses: TODO / IN_PROGRESS / BLOCKED / REVIEW / DONE. **All tasks below are TODO; do not mark DONE without PR, tests, recorded results, and accepted milestone gate.** Priority P0 is blocking, P1 important, P2 optional/advanced. Work topological order; task IDs are durable. See DEVELOPMENT_PLAN.md for engineering details.

| ID | Gate | Priority | Depends on | Status | Deliverable and proof |
|---|---|---|---|---|---|
| T-001 | M0 | P0 | — | TODO | fresh clone `pnpm install/typecheck/build` passes, results recorded |
| T-002 | M0 | P0 | T-001 | TODO | CI + unit/E2E runner + browser smoke; PR checks enforced |
| T-003 | M1 | P0 | T-002 | TODO | scene runtime schema, limits, invalid-reference checks |
| T-004 | M1 | P0 | T-003 | TODO | world-space ports, quaternion transforms, unit fixtures |
| T-005 | M1 | P0 | T-003 | TODO | schema versioning, migrations, deterministic roundtrip |
| T-006 | M2 | P0 | T-004 | TODO | dimensioned tank/pipe/elbow/tee/valve, aligned ports and disposal |
| T-007 | M3 | P0 | T-004,T-006 | TODO | compatible candidate search, snap preview, transform solver |
| T-008 | M3 | P0 | T-003,T-007 | TODO | graph connect/disconnect, occupancy, cycles/branches and deletion |
| T-009 | M3 | P0 | T-008 | TODO | orthogonal pipe paths, fitting mesh, tee branch and route refresh |
| T-010 | M4 | P0 | T-007,T-009 | TODO | pointer raycast world-drop and selectable connections |
| T-011 | M4 | P0 | T-005,T-010 | TODO | command history and transform gizmos, orbit arbitration |
| T-012 | M4 | P0 | T-011 | TODO | JSON import/export, invalid-load UX, undo/redo/reload E2E |
| T-013 | M5 | P1 | T-008,T-009 | TODO | flow resolver for measured vs simulated rate, direction and unknown |
| T-014 | M5 | P1 | T-013 | TODO | animated pipe/tee flow + reverse/zero/stale tests |
| T-015 | M5 | P1 | T-006,T-011 | TODO | glass, X-ray, cutaway and tank fluid/thermal visualization |
| T-016 | M6 | P1 | T-012,T-013 | TODO | read-only telemetry contract/tag bindings, timestamp and quality |
| T-017 | M6 | P1 | T-016 | TODO | WebSocket bridge adapter, reconnect/backpressure/disposal |
| T-018 | M6 | P1 | T-017 | TODO | MQTT/WebSocket adapter and backend OPC UA integration example |
| T-019 | M7 | P1 | T-006 | TODO | safe SVG path ingestion/extrusion and reference mapping fixtures |
| T-020 | M7 | P1 | T-019 | TODO | GLB/glTF ingestion, provenance/license and disposal tests |
| T-021 | M7 | P2 | T-013,T-016 | TODO | volume-balance simulator with mass-conservation fixtures |
| T-022 | M7 | P2 | T-021 | TODO | optional pressure network model; documented assumptions/verification |
| T-023 | M7 | P1 | T-002,T-015,T-018,T-020 | TODO | perf/security/a11y, multi-editor lifecycle, public API hardening |
| T-024 | M8 | P0 | T-023 | TODO | clean consumer install, exports, declarations, migration, version/release |
| T-025 | Research | P2 | T-021 | TODO | separate ADR/scoping feasibility for CFD; NOT MVP commitment |
| T-026 | Research | P2 | T-011 | TODO | separate ADR for optional rigid-body physics; NOT core requirement |

## Ownership and execution rules
- Agent picks earliest unblocked P0 task (unless owner prioritizes otherwise); record session brief via AGENT_WORKFLOW.md.
- Dependencies must have accepted PRs and evidence. P1 tasks may be grouped only if the same acceptance domain; no giant PR.
- Each PR links task ID and FR ID, tests failures plus edge cases, adds docs, notes performance/security and migration impact.
- On blocked requirement, change to BLOCKED with explanation, **do not substitute a superficially similar feature**.
- No PLC writes, unjustified simulation claims or assertion that SVG alone yields a physically accurate 3D component.
