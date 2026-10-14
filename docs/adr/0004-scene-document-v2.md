# ADR-0004: Scene document v2 and migration from v1

Status: Accepted (owner, 2026-10-15); implemented in T-005

## Context
The persisted scene is `ScadaScene` v1: `version: 1`, `kind`, Euler XYZ `rotation` in radians, no `scale`, no `units`. T-003 validates this shape unchanged. ARCHITECTURE.md §4 sketches a target `SceneDocument` with `schemaVersion`, `units: 'm'`, `type`, quaternion rotation and `scale`. Moving to it is a breaking saved-scene change and must not happen silently.

## Options considered
1. Keep v1 permanently; document Euler XYZ order and forbid scale.
2. Introduce v2 with an explicit v1 → v2 migration and keep reading v1.
3. Replace v1 with v2 without migration.

## Proposed decision
Option 2, delivered with T-005 (versioned deterministic roundtrip). v2 adds `units: 'm'`, quaternion `[x, y, z, w]` rotation (avoids Euler order ambiguity for world-port transforms) and `scale` with a documented non-uniform scaling policy for connected parts. The loader accepts v1 and v2, migrates v1 deterministically, and always saves v2.

## Trade-offs
Quaternions are less readable in hand-edited JSON. Migration code and fixtures must be kept for as long as v1 files are supported.

## Migration
v1 Euler XYZ → quaternion; `scale` defaults to `[1, 1, 1]`; `kind` → `type`; `version` → `schemaVersion: 2`. Unknown fields remain errors.

Scale policy chosen at implementation: components whose type has ports must keep scale `[1, 1, 1]` (`UNSUPPORTED_SCALE`); portless types may use any positive scale. Rotation must be a unit quaternion within 1e-6 and is never renormalised.

## Tests
v1 fixture migrates to the expected v2 document; v2 roundtrips byte-identically; unsupported versions are rejected; migrated rotations produce the same world-port positions (T-004 fixtures).

## Date / Approvers
2026-10-15 / accepted by repository owner (sakibcoolz).
