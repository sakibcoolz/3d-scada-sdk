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

## Accessibility (MVP baseline, T-023 part C)
- Every button, input, select and textarea has an accessible name (enforced by `e2e/accessibility.spec.ts`).
- The 3D canvas is wrapped in a `region` named "3D scene view" with a text description of component and connection counts; live summaries (flow, telemetry, drop preview, import results) are text with `aria-live`.
- Everything the mouse can do to a component (select, move, turn, remove, undo) is also possible from the keyboard; a keyboard-only browser test covers the path.
- Not yet covered: colour-contrast audit, screen-reader testing on real assistive technology, focus management inside the 3D view, and reduced-motion handling for flow animation.

## Review gates
Format/lint/typecheck, unit tests, integration tests, browser smoke, dependency audit appropriate to change. Require at least one independent review for schema and security boundary changes.

## Code architecture checklist
Separation of command/read model; typed domain objects; clear error handling; cleanup; no Z-Factory-specific identifiers; portable TS packages; deterministic fixture tests; docs co-edited with behavior changes.

## Branches and commits
Feature branch per task (`feat/T-007-port-snapping`), descriptive commits, PR to develop, linked backlog task, no undocumented changes. Prefer small diffs and conventional commit prefixes.
