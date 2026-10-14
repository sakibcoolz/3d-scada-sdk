# ADR-0005: Split snapping/graph into `@scada3d/connection-engine` and routing into `@scada3d/pipe-routing`

Status: Proposed (not accepted; rules.md §8 requires owner approval for package-boundary changes)

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

## Date / Approvers
2026-10-15 / pending owner approval.
