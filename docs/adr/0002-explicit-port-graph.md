# ADR-0002: Typed explicit connection graph

Status: Accepted (architecture baseline)

## Context
Overlapping 3D pipe meshes do not provide trustworthy topology or validation.

## Decision
Use immutable unique IDs for component instances and explicit edges between declared local-space port IDs. Geometry is derived from validated graph and world transforms. Tees are branching nodes with three named ports.

## Consequences
Snapping, occupancy, moves and deletion must update graph transactionally. Edges survive serialization without depending on meshes.

## Verification
Edge validation, branch/cycle tests, movement, undo and save/reload.
