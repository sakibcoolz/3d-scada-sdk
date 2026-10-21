# ADR-0019: Open source under MIT and publish to npm

Status: Accepted (owner, 2026-10-21); implemented in T-058. Supersedes the licence and distribution part of T-024 (proprietary `UNLICENSED`, tarballs only).

## Context
The owner asked to open-source the SDK, publish the repository and update the tags. The repository was private, every package `UNLICENSED` and `private`, and releases were tarballs only.

## Decision
- **Licence:** MIT for the repository and every package (`LICENSE` copied into each package).
- **Repository:** public on GitHub (`sakibcoolz/3d-scada-sdk`), history published as is (owner choice; the author email in older commits becomes public).
- **Packages:** `@scada3d/core`, `components`, `react`, `simulation` and `asset-import` lose `private` and gain `publishConfig.access: public`, `repository` (with `directory`), `homepage`, `bugs`, `keywords`, `engines` and a README each. The root workspace, playground and examples stay private.
- **Versioning:** the first public release is `v0.1.0`, an annotated tag on `develop` with a GitHub Release carrying the packed tarballs. npm publishing uses `pnpm -r publish --access public` after `npm login` by an account in the `scada3d` npm organisation (the agent cannot enter credentials).
- **Project files:** `CONTRIBUTING.md` (workflow from AGENTS.md, checks, safety boundary) and `SECURITY.md` (private reporting through GitHub advisories).
- Unchanged: no PLC write path; no mandatory network connection; ASME values carry their "verify before engineering use" caveat (ADR-0014 to ADR-0016).

## Checks before publishing
- History scanned for tokens, keys, passwords, private addresses and home paths: none found.
- Third-party runtime licences: MIT, ISC, Apache-2.0, BSD-3-Clause (RELEASE.md licensing check).
- Full check run and `pnpm -r publish --dry-run` package contents.

## Date / Approvers
2026-10-21 / repository owner (sakibcoolz): MIT, history as is, version tag and release, GitHub topics, npm, public.

## Amendment (2026-10-21, T-059): npm scope
The `scada3d` npm organisation did not exist when publishing (npm: "Scope not found"). The owner chose to publish under their own user scope instead: the packages are renamed `@sakibcoolz/core`, `components`, `react`, `simulation` and `asset-import` and released as `v0.1.1`. `v0.1.0` (tag, GitHub Release and tarballs) keeps the `@scada3d` names and was never on npm. The editor's CSS class `.scada3d-editor` is a theming API, not the package scope, and is unchanged.
