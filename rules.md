# rules.md — Mandatory Engineering Rules for 3D SCADA SDK

> **Status:** REQUIRED for all human and AI contributors. This file is a practical checklist, not a replacement for [AGENTS.md](AGENTS.md) or accepted architecture decision records. Read AGENTS.md first. If rules conflict, follow repository-owner instructions, then AGENTS.md and accepted ADRs; flag unresolved conflicts rather than silently changing direction.

## 1. Mission and scope
- Build a reusable, platform-independent **3D industrial SCADA visualization SDK** with React bindings. Do not couple SDK internals to Z-Factory.
- The SDK includes industrial component models, ports, snapping, topology, routing, editor history, transparent/X-ray presentation, flow visualization, validated scene persistence, and read-only live telemetry.
- **Never imply this library is safety-certified or appropriate for direct PLC actuation.** Device writes, alarm bypasses and safety interlock logic are out of scope without a separately approved safety design.
- Graphical water movement is **visualization** unless a separately tested simulator is explicitly selected. An open valve does not prove actual flow.

## 2. Required sources of truth
Before making changes consult:
1. `AGENTS.md`
2. `docs/PRODUCT_REQUIREMENTS.md`, `docs/ARCHITECTURE.md`
3. `docs/DEVELOPMENT_PLAN.md` and `docs/TASK_BACKLOG.md`
4. `docs/IMPLEMENTATION_ACCEPTANCE.md`
5. `docs/COMPONENT_STANDARD.md`, `docs/SCENE_AND_CONNECTIONS.md`
6. `docs/ENGINEERING_STANDARDS.md`, `docs/TEST_STRATEGY.md`, `docs/SECURITY_AND_SAFETY.md`
7. Accepted `docs/adr/` decisions and `docs/DECISION_LOG.md`
8. `docs/GRAPHIFY_AGENT_REFERENCE.md` and `docs/AGENT_WORKFLOW.md`

Do not duplicate competing implementation plans. Update the canonical documents when requirements change.

## 3. Task discipline
- Work on **one dependency-ready task** from `docs/TASK_BACKLOG.md` at a time; identify its ID in branch/PR.
- Before coding define objectives, scope, prerequisites, expected interfaces, failure cases, tests, and migration impact.
- Do not skip milestones, reclassify unverified functionality as DONE, or introduce unapproved features.
- Favor small cohesive commits, reviewed pull requests, and explicit ownership of changes.
- Required PR description: task, acceptance evidence, changed packages, validation, risks, compatibility, rollback and next step.
- Append outcomes to `docs/WORK_LOG.md`; do not overwrite prior sessions.

## 4. Agent navigation and token efficiency
- If Graphify is installed with a **fresh local index**, run a narrowly scoped query to identify relevant code symbols and consumers before broad repository exploration.
- Validate inferred graph relationships against actual source and tests; extracted graph content is not authority.
- Limit queries to the active task and relevant dependency neighborhood. Never dump the whole knowledge graph into context by default.
- Refresh the graph after branch changes and significant code edits. If unavailable or stale, use targeted file search and document the fallback.
- Do not transmit private source to hosted indexing services without owner approval.
- Token savings are an **optimization hypothesis**, not an established result, until measured.

## 5. Architecture boundaries
- `core`: framework-agnostic domain, types, scene schema, graph rules and deterministic transforms. **No React, browser APIs, WebGL or Three.js rendering dependencies inside core.**
- `components`: industrial component definitions, properties, ports and geometry contracts.
- `connection-engine`: port compatibility, topology, snapping, connect/disconnect; `pipe-routing`: route solving and geometry representation.
- `editor`: commands, drag/drop, transform gizmos, selection and undo/redo.
- `renderer-three` and `react`: rendering and framework-specific bindings.
- `flow-animation` / `simulation`: separate visual effects from modeled physics.
- `telemetry`: read-only observations and quality/status; no embedded PLC credentials or direct control.
- These are **target boundaries**; do not claim all packages exist in the bootstrap.

## 6. Data and graph invariants
- Use right-handed 3D, **Y-up**, metres for geometry, radians for rotation and explicit unit conversion for displayed readings.
- Assign stable unique component instance IDs and locally unique named port IDs.
- Save connections as edges between `(instanceId, portId)` endpoints, **never** visual overlaps, screen coordinates or mesh UUIDs.
- Validate port type, direction, nominal bore/tolerance, occupancy and coordinate transforms before creating edges.
- Represent tees and branches with explicit junction ports. Traversals must handle cycles safely.
- Disconnect/delete/move/rotate/undo/redo must not leave dangling edges or stale routes.
- Keep persisted scene topology separate from live telemetry, simulator state, editor selection and camera/material presentation settings.
- Version and validate imported JSON. Never silently coerce invalid connections or unsupported schema versions.

## 7. Component contract
Every industrial component must specify:
- Unique type ID and name, dimensions and bounds, configurable property schema and valid ranges.
- Geometry or authorized/licensed 3D asset, normalized local origin, material modes and resource disposal.
- Explicit typed inlet/outlet/branch/signal/mechanical ports and outward local normals.
- Optional telemetry mappings, animations, error/quality visualization and documented defaults.
- Tests for dimensions, port placement/compatibility and serialization.
- For SVG sources, **do not claim flat SVG extrusion reconstructs true machinery internals**. Use controlled path conversion, modeling templates or licensed GLB/glTF.

## 8. Code quality and security
- Strict TypeScript, typed public APIs, explicit package exports, pure testable domain functions; avoid unreviewed `any`.
- Avoid circular dependencies, global mutable state, hidden data mutation, unnecessary dependencies and unbounded render allocations.
- Cleanup subscriptions, animations, meshes, textures, event handlers and GPU resources.
- Validate untrusted scenes/assets and external URLs. Never run scripts embedded in SVG or imported layouts.
- Do not commit secrets, keys, tokens, customer PLC addresses, unlicensed models or generated private Graphify indexes.
- Require an ADR and owner approval for breaking schema/public API, package-boundary and safety-trust changes.

## 9. Testing and completion
- Write positive, negative and boundary-case acceptance tests for each task, preferably before implementation.
- Run and record the **actual** available install, typecheck, build, unit, integration and browser checks relevant to the change.
- At M0: `pnpm install`, `pnpm typecheck`, `pnpm build`. Follow `docs/TEST_STRATEGY.md` for current scripts; do not invent test commands.
- Prioritize snapping/graph invariants, tee branching, reverse/zero/unknown flow, undo/redo determinism, scene roundtrips and stale telemetry.
- Performance requirements must be benchmarked on named scenes/hardware; do not promise an FPS number without measurement.
- If verification cannot run, mark **NOT RUN** with a reason and keep task status REVIEW/BLOCKED, not DONE.
- A task is **DONE only** after tests, docs, PR evidence and milestone acceptance.

## 10. Change-management stop conditions
**STOP and seek an explicit decision** if work introduces: direct actuator control, safety-critical behavior, security policy changes, unsupported external assets/licenses, breaking saved-scene formats, unreviewed package dependencies or incompatible architecture.

## 11. Required agent handoff
Every agent session ends with:
```md
Task / milestone:
Branch / commit / PR:
Graphify query + freshness (or search fallback):
Verified symbols and changed files:
Implemented / explicitly not implemented:
Tests (PASS / FAIL / NOT RUN with command evidence):
Security, safety and migration notes:
Known blockers:
Next dependency-ready task:
```

**Operational principle:** correctness of the 3D process topology and trustworthy data interpretation always comes before appearance or animation polish.
