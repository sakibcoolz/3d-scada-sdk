# Repeatable agent implementation protocol

## 0. Preflight
Read `AGENTS.md` and its required references, inspect existing code/current git branch, and verify task dependencies and accepted ADRs. Never assume previous AI statements imply files or tests exist.

## 1. Task brief (write before coding)
```md
Task: T-XXX / M#
Objective:
User-visible outcome:
In scope:
Explicitly out of scope:
Files/packages likely affected:
Dependencies:
Architecture invariants:
Security/process safety:
Acceptance scenarios:
Test plan:
Potential compatibility / migration:
Unknowns requiring owner decision:
```

## 2. Agent execution prompt
> You are principal engineer of industrial-3d-sdk. Follow AGENTS.md, the canonical docs and all accepted ADRs. Work only on TASK_ID. Inspect the repository rather than guessing. Write tests for acceptance cases before or alongside implementation. Preserve the typed port graph, scene schema, units, rendering independence and read-only control boundary. If blocked by a missing decision, report it rather than improvising. Deliver minimal reviewed changes, docs and a proof table of commands/results; do not claim unexecuted tests pass.

## 3. Implementation loop
Plan → contract/fixtures → tests → implementation → verify → review diff → update docs → PR. Re-run verification after final edits. Avoid giant PRs, hidden shortcuts, magic values and fake production PLC data.

## 4. Self-review
- Correctness: IDs, typed ports, transforms, flow state, independent components.
- Boundaries: no React in core; no PLC commands in scene/viewer.
- Operability: install, build, tests, cleanup, errors and logging.
- Compatibility: schema, public API, documented changes.
- UX: keyboard access, zoom and selection, loading/empty/failure states.
- Security: no secrets, untrusted scene validation and no uncontrolled remote execution.

## 5. Required PR report
Scope; task IDs; screenshots/demo instructions (when UI); commands + outcomes; behavior-tested scenarios; open risks; affected docs; rollback; next task. **If tooling unavailable, list tests as NOT RUN with reason.**

## 6. Session handoff
Add an entry to WORK_LOG with timestamp UTC, branch, commit, task, outcome, failures and next action. Never rewrite history of completed sessions.
