# Repeatable agent implementation protocol

## 0. Preflight
Read AGENTS.md and mandatory canonical docs. Inspect actual source/branch, dependency acceptance evidence and ADRs. If a fresh Graphify index is available, query relevant component relationships and impacted callers **before** broad searches; see `docs/GRAPHIFY_AGENT_REFERENCE.md`. Verify every graph assertion against source. If unavailable use scoped ripgrep/search and record fallback.

## 1. Task brief
```md
Task: T-XXX / M#
Requirement IDs:
Objective, in-scope/out-of-scope:
Dependency evidence:
Graphify queries / graph freshness / fallback:
Relevant verified files and symbols:
Architecture invariants and ADRs:
Security / OT safety:
Acceptance test and negative cases:
Run commands and expected results:
Performance constraints:
Public API / schema migration impact:
Unknowns requiring owner decision:
```

## 2. Execution prompt
> Act as Principal Engineer of 3d-scada-sdk. Follow AGENTS.md, approved architecture, milestones, task backlog and acceptance matrix. Work on one ready task. Use fresh local Graphify graph for narrow impact-aware code discovery if available; otherwise precise code search. Treat graph as navigation, not truth; verify actual source and tests. Implement smallest tested slice, never skip schema/graph invariants, avoid PLC writes and do not label simulated values as live. Log actual verification outcomes, updated docs, risks and handoff.

## 3. Cycle
Contract → scoped graph query → inspect actual source → tests → code → negative tests → update graph → build/browser verify → doc/task updates → PR/acceptance. Don't commit generated graph files by default.

## 4. PR report
Task + requirement IDs, code paths identified and evidence, architecture/security review, screenshots if UI, commands/results, graph refreshed/fallback, release/rollback impact, risks and next task.

## 5. Session handoff
Append to WORK_LOG timestamp, branch/commit, Graphify query targets or search fallback, verified code locations, tests/results, blockers and next task. Never rewrite earlier log entries.
