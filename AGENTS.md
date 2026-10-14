# Agent Operating Contract (mandatory)

This file is the single entry point for every coding agent, including Copilot, Codex, Cursor, Claude Code and human contributors. Read it before changing code. **Instruction priority:** repository owner request > this contract > approved ADRs > other docs > code comments. In case of conflict, stop, document the conflict and ask for a decision; never silently choose.

## Mandatory reading order
1. `docs/PRODUCT_REQUIREMENTS.md` — vision, users, outcomes, exclusions
2. `docs/ARCHITECTURE.md` — boundaries, dependencies and architecture invariants
3. `docs/DEVELOPMENT_PLAN.md` — milestone order, dependencies, exit gates
4. `docs/COMPONENT_STANDARD.md` and `docs/SCENE_AND_CONNECTIONS.md` — authoritative contracts
5. `docs/ENGINEERING_STANDARDS.md`, `docs/TEST_STRATEGY.md`, `docs/SECURITY_AND_SAFETY.md`
6. `docs/DECISION_LOG.md` + `docs/adr/` — accepted decisions
7. `docs/AGENT_WORKFLOW.md`, `docs/WORK_LOG.md` — handoff and execution history

## Operating rules
- Work on **one approved milestone/task at a time**. Do not jump to visual polish when core contract and graph correctness are pending.
- Before work: inspect current files and git status; select task from `docs/TASK_BACKLOG.md`; record scope, assumptions, dependencies and acceptance tests. Maintain backward compatibility or provide explicit migration.
- Prefer small, reviewable PRs. Never edit `develop` directly after bootstrap; create feature branches and open PRs.
- Implement the smallest vertical slice that satisfies explicit acceptance criteria. No placeholder claimed as complete; no mocked PLC command presented as production-safe.
- Validate with commands in `docs/TEST_STRATEGY.md`; record actual results and unavailable tests honestly. Do not claim compilation, simulation, certification or field validation without evidence.
- At completion update the relevant task, `docs/WORK_LOG.md`, public API docs and tests; include reproduction and rollback instructions in PR.
- No unapproved dependency, protocol, schema breaking change, new security boundary or ADR reversal. Propose an ADR and obtain review first.
- Files in `docs/legacy/`, if created later, are historical and never override the canonical documents listed above.
- On ambiguous requirements or safety-related interactions, **stop and request clarification**.

## Definition of done
Code + automated tests + typecheck/build + docs + clear acceptance evidence + reviewable PR. Status must be **blocked** if a necessary check cannot run. A passing local demo alone is not done.

## Agent session handoff format
Task ID / branch / files changed / decisions and assumptions / actual commands & results / pending checks / risks / next smallest task. Record in `docs/WORK_LOG.md`.
