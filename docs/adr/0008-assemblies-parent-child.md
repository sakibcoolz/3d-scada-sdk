# ADR-0008: Assemblies (parent/child locks) in scene version 3

Status: Accepted (owner, 2026-10-15); implemented in T-040

## Context
Parts joined port to port should be easy to move as a unit. The owner asked for a parent component with children locked to it, so moving the parent moves the whole build.

## Owner decisions
- Children are taken **from connections**: "Lock connected as children" locks everything reachable through connections to the selected component.
- Locked means **rigid**: moving or rotating any member moves the whole assembly. To move one part alone, unlock it.
- **Saved in the file.**

## Decision
- Optional `parentId` on components in schema version 3 (additive; no release yet, so no version bump, in line with ADR-0006). Positions and rotations stay in **world** space; `parentId` only drives editing. Routing, snapping, collisions, flow and telemetry are unchanged.
- Validation: `parentId` must name an existing component (`UNKNOWN_PARENT`) and must not create a cycle, including a component naming itself (`PARENT_CYCLE`).
- Core: `assemblyOf` (root and all descendants), `moveAssembly` (applies a member's new pose to all members as one rigid motion, so joined ports stay joined), `lockConnectedAsChildren` (makes the selected component the root; replaces earlier locks among the connected parts), `unlockFromParent` (frees a child, or a parent's children). `removeComponent` frees the removed component's children.
- Editor: every pose change (gizmo, keyboard, position fields, rotation form) goes through `moveAssembly`; an Assembly section offers lock and unlock; the scene list shows children under their parent. Changing a shape parameter (pipe length) still adjusts only that component.

## Alternatives rejected
- Local (parent-relative) transforms: would change the meaning of every saved position and every consumer of positions.
- Editor-only assemblies: lost on reload.
- Inferring assemblies from connections on every move: would surprise users who want to rearrange connected parts.

## Tests
Core: file roundtrip, invalid parents, locking, re-rooting, rigid translation and rotation with joined ports, standalone moves, unlocking, parent removal, no mutation. e2e: lock and list, move and turn the parent, move a child, unlock, export/import.

## Date / Approvers
2026-10-15 / accepted by repository owner (sakibcoolz).
