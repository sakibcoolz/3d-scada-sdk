# Version, release and compatibility policy

Development packages begin at 0.x. Declare whether version is pre-release; do not claim stable API before M7. Keep workspace packages aligned initially; publish only after CI and consumer install tests pass.

## Versioning
Breaking public API/schema -> explicit major consideration even pre-1.0 and migration guidance. Backward-compatible additions -> minor; bugfix -> patch. Save document `schemaVersion` independently from npm package version.

## Release checklist
- Source tested against supported Node/React/Three dependency matrix.
- Package exports and generated declarations work in a separate consumer application.
- License, notices, model/texture provenance and dependency scanning complete.
- Runtime schema round-trip, migration fixtures and breaking-change notes pass.
- Tag/release has changelog, rollback notes and test artifacts.
- SDK viewer/editor remain reusable without Z-Factory coupling.

## Rollback
Pin previous package version and restore persisted scene schema using documented backward compatibility or migration snapshots; never silently downgrade documents containing unrecognized schema versions.
