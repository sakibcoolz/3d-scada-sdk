# ADR-0006: Optional tag bindings in scene version 2

Status: Accepted (owner, 2026-10-15); implemented in T-016

## Context
T-016 links host tags to what they drive (tank level/temperature, valve open, connection flow). SCENE_AND_CONNECTIONS already sketched `tagBindings?: TagBinding[]` in the target schema. Scenes are version 2 (ADR-0004) and the validator rejects unknown fields.

## Options considered
1. Optional `tagBindings` field in version 2.
2. New schemaVersion 3 with a v2 → v3 migration.
3. Runtime-only bindings passed by the host, never saved.

## Decision
Option 1. No SDK version has been released, so adding an optional field to version 2 breaks no reader. After a release, any further schema field needs a version bump.

## Shape
`{ id, tagId, kind: 'property', instanceId, property, unit? }` or `{ id, tagId, kind: 'flow', connectionId, unit? }`. `unit` is the unit the tag's values arrive in when an observation does not say; values are converted to the canonical unit of the property's quantity (percent %, temperature °C, flow m³/s, boolean). Bindable properties and quantities are declared per component type in the catalog (`bindable`).

## Rules
Unique binding ids; every target exists; property bindable for its type (when the caller supplies `resolveBindable`); unit accepted for the quantity; one binding per target (a tag may drive several targets). Removing a component or connection drops its bindings. Absent `tagBindings` stays absent on save.

## Consequences
Bindings travel with the scene and can be authored in the editor. Live values never change the saved scene: the viewer draws a display copy (`displayScene`), and bound properties without a trusted value are hidden rather than shown with their authored default.

## Tests
Validation, canonical serialization roundtrip, graph cascades, unit conversion, import rejection of unbindable properties, editor authoring with undo.

## Date / Approvers
2026-10-15 / accepted by repository owner (sakibcoolz).
