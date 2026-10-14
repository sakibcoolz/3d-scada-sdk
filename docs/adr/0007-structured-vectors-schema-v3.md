# ADR-0007: Structured vectors in scene version 3

Status: Accepted (owner, 2026-10-15); implemented in T-030

## Context
Scene version 2 (ADR-0004) stores `position`, `rotation` and `scale` as arrays (`[x, y, z]`, `[x, y, z, w]`). The owner asked for exported JSON to name each axis so files are self-describing and easy to read and hand-edit.

## Options considered
1. Objects in saved JSON only; in-memory API keeps tuples.
2. Objects in saved JSON **and** the in-memory scene model.
3. Change version 2 in place, versus a new version with migration.
4. Rotation as a quaternion object, versus Euler degrees.

## Decision
Option 2 with a new **schemaVersion 3** and a quaternion object, chosen by the owner:
- `ComponentInstance.position` and `.scale` are `Vector3Like` `{ x, y, z }`; `.rotation` is `QuaternionLike` `{ x, y, z, w }` (unit, radians-free). `THREE.Vector3`/`THREE.Quaternion` satisfy these types structurally.
- Files are written as version 3 with keys in `x, y, z(, w)` order. Version 2 (arrays) and version 1 files load and migrate deterministically (`migratedFrom: 2 | 1`) and are saved as version 3.
- Public rotation helpers (`quaternionFromEuler`, `quaternionToEuler`, `rotateVector`, `identityQuaternion`) and `SnapResult` use the object forms.
- Derived, never-saved geometry keeps tuples: catalog ports and parts, `WorldPort`, routes and centrelines. They are not part of the file format and the maths uses tuples internally.

## Trade-offs
Larger files and a broad API change (no external consumers yet). Quaternions stay unreadable to most people, but exact; Euler degrees were rejected for gimbal-lock and rounding reasons (ADR-0004).

## Migration
v2 → v3: each array becomes the matching object; nothing else changes. v1 → v3 as before (Euler XYZ → quaternion, `kind` → `type`, unit scale), now with objects. Validation of v2 input stays strict (arrays only); v3 input rejects arrays, missing or non-finite axes (INVALID_FIELD) and extra axes (UNKNOWN_FIELD).

## Tests
`schema-v3.test.ts` (object validation, axis paths, canonical text, v2/v1 migration, unsupported version 4), all existing fixtures migrated, e2e export/import roundtrip on version 3.

## Date / Approvers
2026-10-15 / accepted by repository owner (sakibcoolz).
