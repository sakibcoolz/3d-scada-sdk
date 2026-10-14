# Agent Operating Contract (mandatory)

Single entry point for all coding agents (Copilot, Codex, Cursor, Claude Code and humans). Read before editing. Order of authority: owner's specific request > this file > accepted ADRs > canonical plans/contracts > extracted Graphify data > source comments. If unclear, stop for an owner decision.

## Required reading, in order
0. `rules.md` — mandatory coding and safety rules
1. `docs/PROJECT_SUMMARY.md` — project purpose, implemented vs target and source-file map
2. `docs/MVP.md` — committed MVP scope, demonstrations and non-goals
3. `docs/AGENT_FILE_MAP.md` — file reading/connection diagram and task-specific navigation
4. `docs/PRODUCT_REQUIREMENTS.md`
5. `docs/ARCHITECTURE.md` and `docs/DEVELOPMENT_PLAN.md`
6. `docs/TASK_BACKLOG.md` and `docs/IMPLEMENTATION_ACCEPTANCE.md`
7. `docs/COMPONENT_STANDARD.md` and `docs/SCENE_AND_CONNECTIONS.md`
8. `docs/ENGINEERING_STANDARDS.md`, `docs/TEST_STRATEGY.md`, `docs/SECURITY_AND_SAFETY.md`
9. `docs/DECISION_LOG.md` and accepted `docs/adr/`
10. `docs/GRAPHIFY_AGENT_REFERENCE.md` — query-first code discovery when Graphify is available
11. `docs/AGENT_WORKFLOW.md` and `docs/WORK_LOG.md`

## Agent startup contract
Begin with the above file chain, inspect code, identify the earliest dependency-ready backlog task and verify its acceptance cases. `docs/MVP.md` defines release scope; `docs/DEVELOPMENT_PLAN.md` defines sequencing; `docs/TASK_BACKLOG.md` owns task statuses. If an MVP boundary conflicts with planned M7/M8 gates, propose a scoped backlog/ADR change before implementing; never silently change release dependencies. No mandatory network connection is permitted in the SDK.

## Query-first discovery (Graphify)
When Graphify has been installed and its index is fresh: prefer small, task-scoped `graphify query` questions **before broad repo scans**, then read the specific source files/lines referenced by the graph. Refresh after pulling or significant changes. Do not trust an inferred or stale edge without source verification. When the tool/index is unavailable, use targeted repository search; do **not** block development purely because Graphify is unavailable. Avoid full graph dumps to save context tokens. Never send private code to hosted graph services without owner authorization.

## Operating rules
- One dependency-ready, approved backlog task at a time; do not jump from topology to visual polish.
- Preflight: inspect files, current branch, accepted ADRs and task dependencies; write an acceptance-oriented task brief.
- Small PRs on feature branches; no direct changes to develop once bootstrap is merged.
- Add failure tests and smallest production-worthy slice; don't claim simulation/controls or certification not demonstrated.
- Run and record actual typecheck/build/tests and browser verification; unrun checks are NOT RUN, never PASS.
- Update corresponding docs, tests, backlog and append-only WORK_LOG for each finished task.
- No unapproved dependencies, breaking schema changes, safety changes or ADR reversals.
- Maintain framework-independent semantic core, stable typed port graph, right-handed metres/Y-up coordinate system.
- Physical PLC write functionality is outside SDK MVP and requires approved safety boundary design.

## Definition of done
Acceptance fixtures pass, clean build/typecheck, docs current, PR review and objective evidence. If required checks cannot run, status BLOCKED/REVIEW, not DONE.

## Handoff
Task / branch / commit / Graphify queries and graph freshness (or fallback) / source confirmed / tests run with results / risks / next dependency-ready task. Keep handoffs concise.
