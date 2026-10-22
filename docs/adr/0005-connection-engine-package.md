# ADR-0005: Split snapping/graph into `@scada3d/connection-engine` and routing into `@scada3d/pipe-routing`

Status: Rejected for the MVP (owner, 2026-10-15). Snapping, graph and routing stay in `@scada3d/core`; revisit only if a consumer needs core without them.

> Note (2026-10-22, T-070): the packages were published as `@sakibcoolz/*` from 0.1.1 (T-059, ADR-0019 amendment). The `@scada3d/*` names in this record are historical.

## Context
ARCHITECTURE.md §3 assigns compatibility, snapping and graph traversal to a `connection-engine` package. To avoid an unapproved boundary change, T-007 (`snapping.ts`), T-008 (`graph.ts`) and T-009 (`routing.ts`) were added to `@scada3d/core`. ARCHITECTURE.md assigns routing to a separate `pipe-routing` package.

## Options considered
1. Keep everything in core until a second consumer needs the split.
2. Create `packages/connection-engine` (snapping, graph) and `packages/pipe-routing` (routing), both depending on core; core keeps schema, validation (including `portsCompatible`) and transforms.
3. Split further now (separate validation package).

## Proposed decision
Option 2, as a standalone move-only refactor PR with no behaviour change.

## Trade-offs
One more workspace package and lockfile entry; consumers import from two packages. Gains a clearer boundary and lets routing depend on graph code without pulling it into core.

## Migration
The packages are private and unpublished, so no external consumers exist. Move the files and tests, re-export nothing from core, update imports in `@scada3d/components` tests and `@scada3d/react`.

## Tests
All existing snapping and graph tests move unchanged and pass; typecheck confirms core no longer exports them.

## Outcome
The owner chose to keep one core package for the MVP: fewer packages to install, version and publish. The public surface is fixed by explicit exports and API snapshot tests instead (T-023, docs/API.md).

## Date / Approvers
2026-10-15 / rejected by repository owner (sakibcoolz).
