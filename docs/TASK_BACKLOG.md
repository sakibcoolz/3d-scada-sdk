# Authoritative task backlog

Allowed status: TODO / IN_PROGRESS / BLOCKED / REVIEW / DONE. Agents may update status only with linked evidence. Owner reprioritization requires plan update.

| ID | Milestone | Priority | Status | Smallest deliverable & acceptance |
|---|---|---|---|---|
| T-001 | M0 | P0 | TODO | pnpm clean install, typecheck and build succeed with actual logs |
| T-002 | M0 | P0 | TODO | CI install/typecheck/build and minimal browser smoke |
| T-003 | M1 | P0 | TODO | zod/json schema validates scenes and rejects dangling edges |
| T-004 | M1 | P0 | TODO | world-port position/direction transforms tested with rotations |
| T-005 | M1 | P0 | TODO | versioned save/load and round-trip fixture/migration |
| T-006 | M2 | P1 | TODO | accurate configurable tank, valve, pipe, elbow, tee geometry |
| T-007 | M3 | P0 | TODO | snap compatible ports, disallow invalid connections |
| T-008 | M3 | P0 | TODO | graph connect/disconnect and branch/cycle fixtures |
| T-009 | M3 | P1 | TODO | visual pipe routing with bends and tee branching |
| T-010 | M4 | P1 | TODO | real canvas raycast drag-and-drop on plane |
| T-011 | M4 | P1 | TODO | transform gizmo, property panel, undo/redo |
| T-012 | M5 | P1 | TODO | visibly directional fluid motion tied to graph flow state |
| T-013 | M5 | P1 | TODO | glass/X-ray/section modes and tank interior |
| T-014 | M6 | P1 | TODO | adapter mapping and stale/quality indicators |
| T-015 | M7 | P1 | TODO | packaging/exports/semver, API extraction and consumer demo |
| T-016 | M7 | P1 | TODO | a11y, disposal, load tests and perf measurements |

**Agent start here:** pick the earliest unblocked P0 task with dependencies accepted. Before marking DONE add PR, test evidence and doc links.
