# Repeatable agent implementation protocol

## 0. Preflight
Read `AGENTS.md`, `docs/DEVELOPMENT_PLAN.md`, `docs/TASK_BACKLOG.md`, `docs/IMPLEMENTATION_ACCEPTANCE.md` and required references. Inspect source/current branch; verify prerequisites. Do not assume planned packages or features exist.

## 1. Task brief (write before coding)
```md
Task: T-XXX / M#
Requirement IDs:
Objective and user-visible outcome:
In scope / explicitly out of scope:
Files/packages likely affected:
Dependency acceptance evidence:
Architecture invariants / ADRs:
Security, OT/process safety:
Acceptance scenarios and edge-case fixtures:
Test commands and expected assertions:
Performance/resource budget:
API and schema migration:
Unknowns requiring owner decision:
```

## 2. Mandatory execution prompt
> You are principal engineer of 3d-scada-sdk. Follow AGENTS.md, DEVELOPMENT_PLAN.md, TASK_BACKLOG.md, IMPLEMENTATION_ACCEPTANCE.md and accepted ADRs. Select one dependency-ready task, inspect real source, implement smallest tested vertical slice, preserve semantic core and scene/graph invariants. Distinguish measured, simulated and unknown fluid state. Do not introduce PLC command writes. Record actual command output, NOT RUN when unavailable, risk and handoff. Do not claim tasks complete without demonstrable acceptance.

## 3. Loop
Preflight → approved task brief → design contract/fixtures → failing tests → implementation → negative tests → browser verification → docs → PR → accepted evidence → update task and append WORK_LOG. Re-run validation after changes.

## 4. Self-review
Check ID/port uniqueness, graph consistency, world transforms, unit correctness, undo/redo atomicity, telemetry quality, bounded resource usage, import validation, accessibility, public API stability, disposal and complete negative scenarios.

## 5. Required PR report
Task and milestone, requirements, changed packages, accepted dependencies, visual/demo steps, concrete tests and outcomes, behavior matrix, security/OT impact, ADR/migrations, known gaps and rollback. NEVER invent test results.

## 6. Session handoff
Append timestamp UTC, task, branch/commit, decisions, performed commands/results, blockers and next smallest dependency-ready task to WORK_LOG.md.
