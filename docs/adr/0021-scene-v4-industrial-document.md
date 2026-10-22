# ADR-0021: Scene version 4, the industrial scene document

Status: Accepted (owner, 2026-10-22, decisions D1, D2 and D7 of docs/INDUSTRIAL_SDK_PLAN.md); implemented in T-068

## Context
The owner's industrial SDK plan (T-067) needs one versioned engineering document that can carry:
- project metadata;
- equipment identity (name, manufacturer, model, definition version);
- identification tags;
- custom fields.

Later phases add definitions, typed connections, runtime variables, data sources, views and assets. Scene v3 (ADR-0007) has none of these. It also rejects any unknown field, so they cannot be added without a new version.

## Decision
- **Schema version 4** continues the integer line (D2). The constant `documentType: "industrial.scene"` identifies the file kind. There is no parallel semver string.
- **Evolve, do not replace** (D1):
  - v1, v2 and v3 files load and migrate losslessly in `validateScene`, which now reports `migratedFrom: 1 | 2 | 3`.
  - `serializeScene` always writes v4. A v3 file saved by this version cannot be opened by older SDKs; that is the 0.2.0 break (D7).
- **New optional fields in v4.** They are all optional, so every migrated v3 scene is a valid v4 scene without changes.
  - Root:
    - `project {id?, name?, revision?, description?}`
    - `extensions`
  - Component:
    - `name`: display name; `id` stays the stable key.
    - `typeVersion`
    - `manufacturer`, `model`
    - `labels`: string map for identification and metadata tags: asset number, area, maintenance class.
    - `extensions`
- **Extensions:**
  - The value is an object keyed by reverse-DNS namespaces (`com.example.app`).
  - Each value is plain JSON, bounded at depth 16 and 10,000 values per document. Keys `__proto__`, `constructor` and `prototype` are rejected.
  - Extensions are preserved on round trip with deterministic key order (keys sorted at every level).
  - Core does not interpret them.
- **No credentials:** a key in `labels` or anywhere inside `extensions` that names a credential is rejected with `SECRET_FIELD`. Such keys include password, passwd, secret, credential, api key, private key, or a name ending in "token". Hosts store references to secrets, never secrets.
- **Canonical output:**
  - Root key order: `schemaVersion, documentType, units, project?, components, connections, tagBindings?, underlay?, extensions?`.
  - Component key order: `id, name?, type, typeVersion?, manufacturer?, model?, parentId?, position, rotation, scale, properties, labels?, extensions?`.
  - `properties`, `labels` and `extensions` keys are sorted.
- **Unchanged in v4:**
  - component kinds are still the closed catalog list; the open registry is Phase 2, ADR-0022;
  - ports and connections are unchanged;
  - no live values are stored.

## Consequences
- The in-memory type `ScadaScene` has `schemaVersion: 4` and `documentType`. Code that builds scenes by hand updates the literal, or calls `createEmptyScene()`.
- Hosts see a "migrated from version 3" note the first time they open an older file, as they already do for v1 and v2.
- Committed v3 fixtures and demo scenes stay valid inputs; only expectations about the saved bytes change.

## Tests
- Migration v3 → v4 is lossless: same components, connections, bindings and underlay, plus `migratedFrom: 3`.
- v4 round trip is byte-stable, including sorted labels and extensions.
- The new fields are validated: types, limits, unknown keys, the `documentType` constant, namespace keys, depth and value-count limits, forbidden keys, and `SECRET_FIELD` in labels and nested extensions.
- The security fuzz test covers v4 documents.
- JSON Schema (T-069): `packages/core/schema/industrial-scene.v4.schema.json` plus valid, invalid and validator-only examples. An `ajv` test (test-only dependency, decision D3) proves that the schema and `validateScene` agree on every example, and that the schema is never stricter on 1500 seeded mutations.
