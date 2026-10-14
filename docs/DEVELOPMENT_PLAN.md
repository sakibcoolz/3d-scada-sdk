# Master Development Plan

**Rule:** Milestones are sequential by dependency; small tasks within a milestone may run in parallel only when contracts are frozen. A milestone is complete only when its exit gate has objective evidence recorded in `docs/WORK_LOG.md`.

| ID | Milestone | Prerequisite | Deliverable | Exit gate |
|---|---|---|---|---|
| M0 | Repository bootstrap | none | workspace, R3F playground, docs | clean install, typecheck, build, smoke run |
| M1 | Domain model | M0 | scene schema, semantic catalog, port transforms | unit tests: serialization, ID integrity, transform math |
| M2 | Geometry & rendering | M1 | production-grade tank, pipe, tee, elbow, valve | visual examples, disposed meshes, defined dimensions |
| M3 | Connection engine | M1,M2 | compatible snapping, graph, connect/disconnect, routing | automated tee, branch, cycle and disconnect tests |
| M4 | Editor interaction | M3 | drag/drop on canvas, gizmos, history, save/load | browser tests: edit/undo/redo/reload stable |
| M5 | Process visualization | M3,M4 | level, flow direction, valve status, material modes | simulation drives consistent displayed states |
| M6 | Telemetry | M5 | read-only adapter, quality/stale handling, mappings | simulated streams/reconnect/out-of-order tests |
| M7 | SDK hardening | M0–M6 | public APIs, bundle exports, docs, CI, examples | consumer React app installs released artifact |
| M8 | Release integration | M7 | versioned package + integration guide | independent application embeds editor/viewer |

## Work sequence within each milestone
1. Write contract and fixture.
2. Write failing correctness tests.
3. Implement pure domain logic.
4. Wire UI and manual playground validation.
5. Validate errors, disposal and performance baseline.
6. Update README/API/migration notes, record results.
7. PR review and explicit acceptance.

## Milestone notes
M0 is **scaffolded, not verified**. Current playground uses drop-to-add, not world-space positioning; current pipe flow marker is static. M1 must tighten all topology contracts before substantial animation work. Do not mark M2/M3 as complete because meshes/port spheres are visible.

## Scope control
Each feature proposal includes rationale, requirements IDs, task ID, affected packages, acceptance tests, security/performance notes and migration impact. Defer unapproved feature requests to backlog. Breaking changes require version and ADR.

## Gate checklist for any milestone
- [ ] Acceptance criteria demonstrably met
- [ ] Build/typecheck/lint/tests run and logged
- [ ] Automated unit and browser coverage appropriate to changes
- [ ] Documentation and examples current
- [ ] No silent breaking API/schema changes
- [ ] PR reviewed, risks and rollback documented
