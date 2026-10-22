# Authoritative Implementation Backlog

Statuses: TODO / IN_PROGRESS / BLOCKED / REVIEW / DONE. No task DONE without PR, tests and objective evidence. Dependency order and scope are specified in DEVELOPMENT_PLAN.md.

| ID | Gate | Priority | Depends on | Status | Deliverable and proof |
|---|---|---|---|---|---|
| T-001 | M0 | P0 | — | DONE | fresh clone pnpm install/typecheck/build passes (PRs #6, #7) |
| T-002 | M0 | P0 | T-001 | DONE | CI, unit/E2E runner and browser smoke (PRs #8, #9; develop CI green) |
| T-003 | M1 | P0 | T-002 | DONE | runtime scene schema and referential validation (`validateScene`, v1 shape; PR #10) |
| T-004 | M1 | P0 | T-003 | DONE | world-space port transforms and unit fixtures (`rotateVector`, `portToWorld`; PR #11) |
| T-005 | M1 | P0 | T-003 | DONE | versioned deterministic scene roundtrip (scene v2 per ADR-0004, v1 migration, `serializeScene`/`parseScene`; #18 merged into the T-010 branch by stacking, landed on develop via PR #19) |
| T-006 | M2 | P0 | T-004 | DONE | aligned industrial geometry, ports, disposal (part descriptors, elbow, geometry disposal; PR #13) |
| T-007 | M3 | P0 | T-004,T-006 | DONE | compatible snap search and transform solver (`findSnapCandidates`, `snapComponent`; PR #14) |
| T-008 | M3 | P0 | T-003,T-007 | DONE | persistent graph, cycles, tee and occupancy (`connect`, `disconnect`, `removeComponent`, traversal; PR #15) |
| T-009 | M3 | P0 | T-008 | DONE | pipe routing, elbow and tee geometry (`routeScene`, route meshes, `?demo` network; PR #16) |
| T-010 | M4 | P0 | T-007,T-009 | DONE | 3D canvas raycast drag/drop (ground-plane drop, snap preview, Escape cancel; PR #17) |
| T-011 | M4 | P0 | T-005,T-010 | DONE | gizmos and atomic undo/redo (move/rotate gizmos, snapshot history with gesture merging; PR #20) |
| T-012 | M4 | P0 | T-011 | DONE | scene import/export and browser roundtrip (Export JSON, file/text import, byte-identical e2e roundtrip; PR #21) |
| T-013 | M5 | P1 | T-008,T-009 | DONE | measured/simulated flow-state resolver (`resolveFlow`, per-connection readings; PR #22) |
| T-014 | M5 | P1 | T-013 | DONE | animated directional flow and stale cases (instanced markers, unknown/stale overlays, SIMULATED badge, `flow` prop; PR #23) |
| T-015 | M5 | P1 | T-006,T-011 | DONE | glass, X-ray, cutaway, water and heat (view modes + per-component override, level policy, temperature tint; PR #24) |
| T-016 | M6 | P1 | T-012,T-013 | DONE | read-only telemetry, tag quality/timestamps (tagBindings per ADR-0006, `resolveTelemetry`, `displayScene`, binding editor; PR #25) |
| T-017 | M6 | P1 | T-016 | DONE | optional DataProvider snapshot/subscribe or setTagValues API; no-network test and cleanup (`createObservationStore`, `connectProvider`, `telemetry.provider`, `ScadaHandle.setTagValues`; PR #26) |
| T-018 | M6 (post-MVP) | P2 | T-017 | TODO | host-owned transport integration examples (REST, WebSocket, MQTT/backend OPC UA), not SDK dependencies; not an MVP release blocker |
| T-019 | M7 (post-MVP) | P2 | T-006 | DONE | part a (ADR-0012): `@scada3d/asset-import` allow-list SVG sanitizer (no DOM), sanitized scene `underlay` drawn on the ground as a tracing reference, editor Underlay section; part b (extrusion) is T-047 |
| T-020 | M7 (post-MVP) | P2 | T-019 | TODO | glTF importer, provenance and disposal |
| T-021 | M7 | P2 | T-013,T-016 | DONE | optional `@scada3d/simulation` (ADR-0010): deterministic mass-balance model (gravity drain, feeds, pumps, equal tee split), verified against analytic drain and conservation; `simulation` prop on viewer/editor (SIMULATED badge, never mixed with measured); playground `?simulate`; packed and run in the consumer check |
| T-022 | M7 | P2 | T-021 | DONE | `hydraulic` v1 model (ADR-0011, owner-confirmed assumptions): Darcy–Weisbach + Swamee–Jain (water 20 °C, steel), K-factor fittings, quadratic pump curves, head-driven tank flow and backflow, tee split by resistance, trees only (loops reported); verified against independent energy-equation solutions; playground model selector |
| T-023 | M7 (MVP gate) | P0 | T-002,T-015,T-017 | DONE | MVP perf baseline, security, accessibility and public API hardening for the shipped SDK (core, components, react); parts A API surface (PR #28), B security (#29, plus vitest upgrade #30), C accessibility (#31), D performance (#32) |
| T-024 | M8 | P0 | T-023 | DONE | independent consumer release verification: compiled ESM + `.d.ts` per package (`tsc`, `.js` import extensions), tarballs via `pnpm pack` (`publishConfig`), proprietary `UNLICENSED` licence, `examples/consumer-vite` installed from tarballs outside the workspace with npm (typecheck, build, plain-Node check), browser test of its production build, licence inventory ([RELEASE.md](RELEASE.md)); not published |
| T-025 | Research | P2 | T-021 | TODO | CFD research ADR; not MVP |
| T-026 | Research | P2 | T-011 | TODO | optional rigid-body ADR; not core |
| T-027 | Tooling | P1 | T-001 | TODO | local Graphify index, source-linked query/freshness, agent integration, token benchmark |
| T-028 | M7 (post-MVP) | P2 | T-018,T-020,T-023 | TODO | hardening for post-MVP surfaces: transport examples, SVG/glTF import (asset sanitisation, provenance, resource limits) |
| T-029 | M7 (post-MVP) | P1 | T-023 | DONE | rendering scale part A: shared equipment geometry per definition, merged pipe runs with one shared material, one instanced mesh for all flow beads (allocation-free) and one for free-port markers; measured on a hardware GPU (Apple M2) and headless (docs/PERFORMANCE.md) |
| T-030 | M7 (MVP) | P0 | T-005,T-023 | DONE | scene schema version 3: named `{x,y,z}`/`{x,y,z,w}` vectors in files and the model, v1/v2 migration (ADR-0007, owner request) |
| T-031 | M7 (MVP) | P0 | T-006,T-011 | DONE | solid-body collision highlight, on by default: OBB overlap per catalog bounds, red shells, overlay, drop warning; non-blocking (owner request) |
| T-032 | M7 (MVP) | P1 | T-011,T-030 | DONE | rotation form for every component: Euler XYZ degree fields, ±90° world-axis turns, reset (owner request) |
| T-033 | M7 (MVP) | P1 | T-006,T-030 | DONE | adjustable pipe length: per-instance catalog definitions (`definitionFor`, `catalogResolvers`), `INVALID_PROPERTY` validation, Length field keeping the connected end fixed (owner request) |
| T-038 | M7 (MVP) | P1 | T-011,T-033 | DONE | edit lock: view-only mode toggle, `defaultLocked` / controlled `locked` + `onLockedChange`, all edit paths refused while locked (owner request) |
| T-039 | M7 (MVP) | P1 | T-008,T-033 | DONE | connect touching ports: explicit, user-triggered conversion of exactly meeting, facing, compatible ports into connections; doubtful pairs reported (owner request) |
| T-040 | M7 (MVP) | P1 | T-008,T-039 | DONE | assemblies: parent/child locks from connections, rigid moves, saved `parentId` (ADR-0008, owner request); editor layout overflow fix |
| T-041 | M7 (MVP) | P1 | T-040 | DONE | copy and paste of a component or a whole assembly: internal connections and parent links remapped, tag bindings not copied, offset beside original (owner request) |
| T-042 | post-MVP | P2 | T-041 | DONE | editor look (owner UI review 2026-10-15): themed controls with clear hover/disabled/active states, distinct destructive actions, grouped collapsible properties sections, position fields rounded to 1 mm for display, scene JSON/import moved out of the properties column, scene list fits without clipping; visual only, no behaviour or schema change; after T-024 unless owner reprioritises |
| T-043 | M7 (MVP) | P1 | T-040 | DONE | connection message: on-canvas notice naming each joint the user just made (snap drop, connect touching) and whether it joins or leaves out an assembly; notice when an assembly is locked; dismissable, auto-clears, silent on undo/redo/import/paste (owner request) |
| T-044 | M7 (MVP) | P1 | T-043 | DONE | open joints: core `findOpenJoints` (unroutable or too-short connected joints, distance/angle) and `seatOnConnection` (exact seat, roll fitted to other connections, assembly-aware); amber markers and list in viewer/editor (`openJoints` prop, default on); editor "Seat on …" per open joint (owner request after a 15 mm valve gap and a reversed tee) |
| T-045 | M7 (MVP) | P1 | T-044 | DONE | pipe sizes DN50–DN200 (`properties.size`, absent = DN150) on pipe, elbow, tee, valve; reducer and coupler kinds; choice parameters and cone geometry; size-mismatch refusal and size-matching drops in the editor; runs drawn at port size (ADR-0009, owner request) |
| T-046 | M7 (post-MVP) | P2 | T-029 | DONE | rendering scale part B: instanced plain equipment per definition × part in spatial chunks of ≤ 64, `instancing` prop (`'auto'` from 100 components, `'off'`, `'always'`); selected, colliding and non-normal-view parts stay individual; per-second telemetry work removed; chain-5000 at display rate on the Apple M2; LOD deferred (not needed when measured) |
| T-047 | M7 (post-MVP) | P2 | T-019 | TODO | SVG part b: extrude a closed sanitized shape into a custom solid part with separately assigned ports (IMPLEMENTATION_ACCEPTANCE "SVG import"); new component kind and schema per a new ADR |
| T-048 | M7 (post-MVP) | P2 | T-006,T-045 | DONE | conical tank component (ADR-0013, owner request with reference images): legs, cone bottom, top inlet, side outlet; shared front sight gauge with 10 % ticks and name plate on both tanks; adjustable stand on the vertical tank (absent = none, new 0.8 m); snap in plan view for raised ports; lathe liquid following the cone; vessel shapes in both simulation models |
| T-049 | M7 (post-MVP) | P2 | T-044 | DONE | Shift+click attach (owner request): core `attachComponents` (closest free compatible ports, connect + seat, assembly-aware); viewer `onSelect` gains `{ additive }`; editor attaches from the 3D view or scene list, one undo step, refused when locked |
| T-050 | M7 (post-MVP) | P1 | T-045 | DONE | ASME phase 1 (ADR-0014): `asme` table (B36.10M OD/Sch 40, B16.9 LR elbow, equal tee, concentric reducer), fittings rebuilt to it, DN150 at 168.3 mm, `upgradeDimensions` re-seats older files on load, hydraulic lengths from geometry; values to be verified against the standard |
| T-051 | M7 (post-MVP) | P1 | T-050 | DONE | ASME phase 2: flanged joints (B16.5 Class 150 flange pairs with bolts) on valves, pumps and tank nozzles; butt-weld beads on pipe-to-fitting joints; routed-run bends at 1.5D per size |
| T-052 | M7 (post-MVP) | P1 | T-051 | DONE | ASME phase 3: valve face-to-face per B16.10, flanged pump and tank nozzles, with `upgradeDimensions` for older files |
| T-053 | M7 (post-MVP) | P1 | T-052 | DONE | Tank family 1 (owner image): vertical tank `diameter`/`height` parameters with Large/Small/Short palette presets, `head` flat or dished, capacity on the name plate (L, m³, US gal), simulation volume from the shape |
| T-054 | M7 (post-MVP) | P2 | T-053 | DONE | Tank family 2: horizontal tank with dished ends, on saddles or a stand, sized by diameter/length, partial-cylinder volume |
| T-055 | M7 (post-MVP) | P2 | T-053 | DONE | Tank family 3: spherical tank on legs, sized by diameter, spherical-cap volume |
| T-056 | M7 (post-MVP) | P2 | T-053 | TODO | Tank family 4: elevated tank on a lattice tower (the open pool was delivered with T-054/T-055, ADR-0018) |
| T-057 | M7 (post-MVP) | P3 | T-053 | TODO | High-performance HMI view mode: flat grey vessels with a blue level fill (owner: later) |
| T-058 | Release | P0 | T-024 | DONE | Open source (ADR-0019): MIT licence everywhere, public package metadata and READMEs, CONTRIBUTING/SECURITY, v0.1.0 tag and GitHub Release, repository topics, public repository, npm publish of `@scada3d/*` (needs owner `npm login`) |
| T-059 | Release | P0 | T-058 | DONE | Rename packages to the owner's npm scope `@sakibcoolz/*`, release v0.1.1 and publish to npm (ADR-0019 amendment) |
| T-060 | Release | P1 | T-059 | REVIEW | Detailed npm package pages: full README per package (purpose, install, verified quick start, API overview, safety notes), released as 0.1.3 |
| T-061 | M7 (post-MVP) | P2 | T-024 | REVIEW | Floor (owner request): optional `floor` prop on viewer and editor draws a display-only concrete slab sized to the plant; playground shows it by default with a Floor toggle and `?floor=off` |
| T-062 | M7 (post-MVP) | P2 | T-061 | REVIEW | First-person walkthrough (ADR-0020), via the opt-in `walkthrough` prop. Desktop Walk: mouse look, WASD/arrows, Space/Alt rise and sink, Shift runs, equipment blocks, Esc restores the orbit view. Enter VR on a WebXR headset: true scale, teleport and snap turn. View only. Playground HTTPS via `PLAYGROUND_TLS_CERT`/`KEY` |
| T-063 | M7 (post-MVP) | P2 | T-062 | REVIEW | Pick and connect in first person (ADR-0020 amendment): in Walk, click selects and C connects at the crosshair; in VR, trigger selects and grip connects; the editor's attach rules apply (size checks, message, lock, undo) |
| T-064 | M7 (post-MVP) | P2 | T-063 | REVIEW | Edit the selected part while walking (ADR-0020 amendment): editor shortcuts R, Delete, PageUp/PageDown and undo/redo work in Walk; aim label lists them; mouse-look ignores bogus pointer-lock jumps |
| T-065 | M7 (post-MVP) | P2 | T-064 | REVIEW | Place new parts at the Walk crosshair (ADR-0020 amendment): P parts menu, ghost preview with port snapping, click places (keeps holding), X or right-click stops; taps and slow frames made robust |
| T-066 | M7 (post-MVP) | P3 | T-065 | TODO | VR hand palette: place new parts from a palette on the left controller, aimed with the right controller ray |
| T-067 | M9 (industrial model) | P0 | — | DONE | Industrial SDK audit, gap analysis and phased plan (docs/INDUSTRIAL_SDK_PLAN.md), with owner decisions D1–D7 approved 2026-10-22 |
| T-068 | M9 (industrial model) | P0 | T-067 | DONE | Phase 1a: Scene v4 in core (ADR-0021): `documentType`, `project`, component `name`/`labels`/`manufacturer`/`model`/`typeVersion`, `extensions`; lossless v3→v4 migration; deterministic v4 serialization; secret-key rejection |
| T-069 | M9 (industrial model) | P0 | T-068 | DONE | Phase 1b: JSON Schema (draft 2020-12) for v4 with valid/invalid fixtures; `ajv` dev dependency proves schema and validator agree |
| T-070 | M9 (industrial model) | P1 | T-068 | DONE | Phase 1c: INDUSTRIAL_SCENE_SPEC.md and fixes to stale docs found in the audit |
| T-071 | M9 (industrial model) | P0 | T-070 | DONE | Phase 2: open component registry (ADR-0022): namespaced host types, core `resolveType`, `createComponentRegistry`/`builtInRegistry`, viewer/editor `registry` prop, placeholder for unknown types, schema and consumer check |
| T-072 | M9 (industrial model) | P0 | T-071 | DONE | Phase 2b: folded into T-071 (registry rules, placeholder and consumer check shipped there) |
| T-073 | M9 (industrial model) | P0 | T-071 | DONE | Phase 3a (ADR-0023): port domains `power`/`network`, signal/power/network metadata, `maxConnections`, per-domain compatibility rule table, registry rules |
| T-074 | M9 (industrial model) | P0 | T-073 | DONE | Phase 3b (ADR-0023): connection `domain`/`relationship`/`properties`; schema, fixtures, spec; routing only for physically mating ports, simulation fluid-only; viewer draws non-fluid connections as lines |
| T-075 | M9 (industrial model) | P0 | T-074 | DONE | Phase 4a (ADR-0023): root `associations` (port-less logical links), validation, `addAssociation`/`removeAssociation`, schema and spec |
| T-076 | M9 (industrial model) | P0 | T-075 | DONE | Phase 4b (ADR-0023): `neighbours`, `relatedComponents`, `pathBetween` with domain/relationship filters; PLC→VFD→Motor, network and 4–20 mA acceptance scenes; consumer example |
| T-077 | M9 (industrial model) | P0 | T-076 | DONE | Phase 5a (ADR-0024): root `dataSources` and `runtimeVariables`, protocol-typed addresses (OPC UA, Modbus), Modbus range/type rules, `endpointRef` credential check, canonical order, schema, fixtures, spec |
| T-078 | M9 (industrial model) | P0 | T-077 | REVIEW | Phase 5b (ADR-0024): binding ↔ variable data-type and unit checks, `DISCONNECTED` quality through telemetry/flow/viewer, `projectAcquisition`, consumer example |
| T-079 | M9 (industrial model) | P1 | T-078 | TODO | Phase 5c (ADR-0024): variable templates on definitions, `suggestVariables` (proposals only), `reviewTags` findings |

## Release-path change (owner-approved 2026-10-15)
T-023 was split so the MVP release gate depends only on MVP-critical work (T-002, T-015, T-017), as MVP.md requires. Hardening of post-MVP surfaces moved to T-028. T-018, T-019 and T-020 are post-MVP and not release blockers. T-024 still depends on T-023.

## Execution rules
- Pick earliest unblocked P0 unless owner changes priority; T-027 may proceed alongside M1 after T-001.
- Graphify guides navigation but doesn't replace code inspection, tests or accepted requirements.
- Mark DONE only with PR and evidence. Block uncertain safety/security requirements rather than improvising.
