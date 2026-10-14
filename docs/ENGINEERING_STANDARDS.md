# Engineering standards

## TypeScript and packages
- strict TS, no unreviewed `any`, public return types, ESM exports, typed error variants.
- Semantic domain logic pure and unit-testable; keep WebGL/React out of core.
- pnpm workspace, explicit package dependencies, reproducible lockfile, pinned Node and CI.
- Public exports through index/exports map; avoid importing another package's private src paths.
- No circular package dependencies; ensure tree-shaking where feasible.

## Quality
- No swallowed errors, unbounded intervals/subscriptions or undisposed geometries/textures.
- Validate untrusted JSON, URLs and external assets; restrict remote file loading policies.
- Avoid shared mutable singleton editor state; multiple editor instances must coexist.
- Time-based animation driven by frame delta, not tied to variable render FPS.
- Minimize per-frame allocations and mesh/material churn; measure before optimizing.
- Semantic version public API/schema changes; document migration and deprecations.

## Review gates
Format/lint/typecheck, unit tests, integration tests, browser smoke, dependency audit appropriate to change. Require at least one independent review for schema and security boundary changes.

## Code architecture checklist
Separation of command/read model; typed domain objects; clear error handling; cleanup; no Z-Factory-specific identifiers; portable TS packages; deterministic fixture tests; docs co-edited with behavior changes.

## Branches and commits
Feature branch per task (`feat/T-007-port-snapping`), descriptive commits, PR to develop, linked backlog task, no undocumented changes. Prefer small diffs and conventional commit prefixes.
