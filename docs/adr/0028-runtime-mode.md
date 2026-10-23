# ADR-0028: Locked runtime mode

Status: Accepted (owner, 2026-10-23: host-supplied alarms displayed only, canonical-form SHA-256 in core, runtime in `@sakibcoolz/react`); T-090 and T-091 implemented. M9 Phase 9 of docs/INDUSTRIAL_SDK_PLAN.md (§8.1), tasks T-090..T-091.

## Context
The SDK has an editor (with an edit lock) and a viewer. An operator screen is neither:
- it must show an **approved** revision of the plant, never a draft;
- it must have **no way to change** the document;
- it must make quality problems and alarms obvious per piece of equipment.

The edit lock (T-038) only disables controls inside the editor. The editing code is still loaded and can be reached by keyboard or by a host bug. The plan (§8.1) asks for a separate `ScadaRuntime` built on the viewer, which:
- accepts only a validated document, optionally pinned by revision and SHA-256;
- shows live values, quality and alarm highlights and the relationship explorer.

UI locks remain **not a security boundary** (SECURITY_AND_SAFETY). Access control and approval belong to the host.

## Decision

### 1. `<ScadaRuntime>` (in `@sakibcoolz/react`)
- **Props:**
  ```ts
  {
    scene: string | object;                    // the approved document, text or parsed JSON
    expected?: { revision?: string; digest?: string };  // the host's approval record
    registry?; telemetry?;                     // as the viewer
    alarms?: readonly AlarmState[];            // host-supplied, see §3
    layout?: '3d' | 'process' | 'electrical' | 'split';  // default '3d'
    selectedIds?; onSelectionChange?;
    onRefused?: (reason: RuntimeRefusal) => void;
  }
  ```
- **Built from viewer parts only:** `Scada3DViewer`, and the 2D views with `editable` off.
  - There is no palette, no history, no gizmo, no import and no Properties editing.
  - The module does not import the editor, which a test checks.
- **Information panel:** the selected component's name and type, live values with quality, its active alarms, and the read-only Ports and Related sections (ADR-0027).
- **Before anything is drawn:**
  - the document is parsed and validated with `validateScene` (with the registry);
  - an invalid document, a `project.revision` that differs from `expected.revision`, or a digest that differs from `expected.digest` shows a **refusal screen** with the reason and draws nothing. It also calls `onRefused` with `{ code: 'INVALID' | 'REVISION_MISMATCH' | 'DIGEST_MISMATCH', … }`.
- **Changing `scene`** re-runs the checks. There is no partial update path.

### 2. Document digest (core)
- **`sceneDigest(scene)`:** the SHA-256 of `serializeScene(scene)`, as lower-case hex.
  - It hashes the canonical form, so whitespace and key order in the stored file do not matter.
  - A host computes it when it approves a revision, and passes it to the runtime as `expected.digest`.
- **`sha256Hex(text)`:** a small pure implementation in core, UTF-8 and FIPS 180-4, tested against the standard vectors.
  - It is synchronous and works in Node and in any browser context.
  - `crypto.subtle` is not used, because it exists only on secure origins (HTTPS or localhost).
  - There is no new dependency.
- **Integrity, not authenticity:** the digest proves the runtime shows exactly the approved text. It does not prove who approved it; signing is the host's job.

### 3. Alarms are host-supplied, displayed only
- **Type:**
  ```ts
  interface AlarmState {
    id: string;
    componentId?: string; tagId?: string;      // what it is about; a tag maps to components through bindings and variables
    severity: 'critical' | 'high' | 'medium' | 'low';
    message: string;
    active: boolean; acknowledged?: boolean;
    since?: string;                            // ISO 8601, shown as given
  }
  ```
- **The SDK never evaluates limits, never raises or clears an alarm, and never acknowledges one.**
  - Alarm management (limits, deadbands, shelving, acknowledgement) is the host's alarm system, for example ISA-18.2-style.
  - An SDK that computed alarms from unverified display values would be a safety claim it cannot back (SECURITY_AND_SAFETY).
  - An "acknowledge" action would be a command, which is Phase 10 (D5).
- **Unmatched alarms:** an alarm whose component or tag does not resolve is still listed, as "not linked to equipment", and is never dropped.

### 4. Status per component (T-091)
- **`componentStatus(scene, resolution, alarms)` (pure)** gives each component one status, highest first:
  1. `alarm` at the highest active severity: critical, then high, medium and low;
  2. `unknown`: any bound value unknown, with the reason (disconnected, stale, bad quality, no reading or invalid);
  3. `uncertain`;
  4. `ok`;
  5. `unbound`: no bound values.
- **Unacknowledged alarms** carry a flag, so views can show them differently. Acknowledged alarms still count while active.
- **Display:**
  - **2D views:** the symbol outline takes the status colour, with a badge for alarms ("!" plus the severity letter).
  - **3D:** a status marker above the component's bounds, a coloured ring that blinks only when unacknowledged and only if the user has not asked for reduced motion.
  - **"Attention" list:** components with alarms first, then unknown values, each selecting its component. An overlay summary gives the counts.
- **Colours** come from one table: critical red, high orange, medium amber, low yellow, unknown grey with a dashed outline, uncertain light blue. They are never the only cue: there is always text, and a dashed outline for unknown.
- **Simulated values** keep the existing SIMULATED labelling, and a simulated value never clears an unknown measured status (ADR-0010).

### 5. Not in this ADR
- acknowledging, shelving or silencing alarms, and any command (Phase 10, D5);
- evaluating alarm limits in the SDK;
- user accounts, roles and authentication (host);
- historian and trends;
- signing approved revisions (host);
- the editor's lock, which stays as it is.

## Options considered
- **The editor with a forced lock as the runtime:** rejected. The edit code paths remain in the bundle and reachable, which is exactly what the plan says to avoid.
- **SDK-evaluated alarms from limits on runtime variables:** rejected for now. That would be a safety claim, plus a schema change, and it duplicates the host's alarm system. It could be revisited as an explicitly "advisory" feature with its own ADR.
- **`crypto.subtle` for SHA-256:** rejected. It is asynchronous and missing on plain-HTTP origins, such as the Tailscale playground and many plant LAN deployments.
- **Hashing the raw text:** rejected in favour of the canonical form. Hosts store files in different formats; the canonical serialization is already byte-stable (INDUSTRIAL_SCENE_SPEC §10).

## Consequences
- **Additive:** new core functions (`sha256Hex`, `sceneDigest`, and in T-091 `componentStatus`), new react exports (`ScadaRuntime`, `AlarmState` and related types). No schema change.
- **Hosts get a clear split:** the editor for engineering, and the runtime for operation, pinned to what they approved.

## Tasks and tests
- **T-090, runtime shell and approval pin:**
  - `sha256Hex` (standard test vectors, UTF-8, empty and long inputs) and `sceneDigest`;
  - `<ScadaRuntime>` with validation, the revision and digest pin, the refusal screen and `onRefused`, viewer and 2D layouts, and the read-only information panel;
  - a test that the runtime module does not import the editor;
  - playground `?runtime` (the control demo, pinned);
  - e2e: no mutation is possible (keyboard, drag, no editing controls); a wrong revision or digest is refused; the layouts work.
- **T-091, quality and alarm status:**
  - `componentStatus`, with alarms resolved through tags;
  - 2D colouring and badges, 3D markers, the Attention list and summary, and reduced motion;
  - playground demo alarms in the feed panel;
  - e2e: an alarm marks its component in 3D and 2D and appears in the list; a disconnected tag gives "unknown"; acknowledged stops the blink; simulated values are labelled.

## Implementation notes (T-090)
- **Viewer and editor split** (`@sakibcoolz/react`):
  - the former `index.tsx` is now `viewer.tsx` (everything the viewer uses, including the collision and open-joint displays) and `editor.tsx` (the editor and its panels, importing the viewer);
  - `index.tsx` only re-exports, so the public API is unchanged;
  - the split was generated from the declaration dependency graph and verified before any other change: 401 react unit tests and all 156 e2e passed;
  - the viewer's `DropPlan` import is `import type`.
- **Core:** `sha256Hex(text)` (FIPS 180-4 over UTF-8, synchronous, no dependency) and `sceneDigest(scene)`, which is `sha256Hex(serializeScene(scene))`.
  - Tests: the empty, "abc", 448-bit and one-million-"a" vectors; UTF-8; agreement with Node's `crypto` at every length from 0 to 130 bytes; and a digest that is independent of the stored file's formatting.
- **`approval.ts`:** `checkApproval(document, expected, options)`.
  - It parses text with `parseScene`, or validates an object with `validateScene`.
  - It then compares `project.revision` exactly (a missing revision fails when one is expected) and the digest case-insensitively.
  - It returns the scene and its digest, or a `RuntimeRefusal` (`INVALID`, `REVISION_MISMATCH`, `DIGEST_MISMATCH`) with a readable message.
- **`runtime.tsx`, `<ScadaRuntime>`:**
  - layouts 3D, Process, Electrical and Split, controlled or uncontrolled;
  - a toolbar showing "‹name› · revision N · digest verified · view only";
  - `Scada3DViewer` with controlled selection, and the 2D views with `editable` off;
  - one telemetry feed shared by all views and the panel;
  - an **Information** panel: name, type, live values, and the read-only Ports and Related sections;
  - a refused document renders only the refusal screen (`role="alert"`, "Runtime refused") and calls `onRefused` once per document.
- **Reachability:** the runtime reaches `inspector.tsx` (shared display; editing only through callbacks the runtime never passes) and its pure `wiring.ts` helper. `runtime.test.ts` asserts it cannot reach `editor.tsx`, `history.ts`, `drop.ts`, `tagEditor.tsx`, `tagForms.ts`, `keyboard.ts`, `workspace.tsx` or `sceneFile.ts`. Type-only imports are skipped, because they are erased at build.
- **Playground:** `?runtime` shows the control demo approved as "Demo line", revision 1, with its digest. `?runtime=tampered` moves one component and keeps the original digest; `&revision=N` expects another revision; `&layout=` sets the layout.
- **Tests:**
  - `digest.test.ts` (3) and `runtime.test.ts` (3);
  - e2e `runtime.spec.ts` (4): no editing controls, keys and drags change nothing, live values follow the feed, panel links, layouts, and digest and revision refusals;
  - consumer `node-check`: the digest equals Node's SHA-256.

## Implementation notes (T-091)
- **Core `status.ts`:** `componentStatus(scene, resolution, alarms)` returns `byComponent`, `attention`, `unlinked` and `counts`. `AlarmState` and the other status types are defined in core, so the pure function can use them, and are re-exported by `@sakibcoolz/react`.
- **Resolution of alarms:**
  - an explicit `componentId` that exists wins;
  - otherwise `tagId` maps through property bindings (the bound component), flow bindings (both ends of the connection) and runtime variables (their `componentId`);
  - only active alarms count;
  - an alarm that resolves to nothing is listed under "Not linked to equipment".
- **Untrusted host data:** non-object entries are skipped, and an unrecognised severity is shown as critical, so it is never under-reported.
- **One status for every view:** `ScadaRuntime` resolves telemetry once and passes the same `status` to the 3D viewer (new optional `status` prop: rings from `statusMarkers.tsx`) and to the 2D views (new optional `status` prop). The colour table `statusColors` and `describeStatus` live in `@sakibcoolz/views-2d` and are shared with 3D.
- **2D:**
  - the outline takes the status colour;
  - alarms get a "!" + severity letter badge, filled while unacknowledged;
  - unknown gets a dashed grey outline;
  - the symbol's accessible name adds the status in words.
- **3D:** a ring centred over the component's world-space bounds. It blinks at 1 Hz only for an unacknowledged alarm and never under `prefers-reduced-motion: reduce`.
- **Runtime panel:**
  - Attention list first (a button per component, then unlinked alarms);
  - the selected component's active alarms as the host gave them;
  - live values with "· SIMULATED" where simulated;
  - a "SIMULATED values, not plant data" badge when the feed is simulated, and a status summary overlay.
- **Playground:** `?runtime` adds a "Demo alarms (host side)" panel: LAH-101 on tag LT-101.PV, VIB-101 on P-101 (inactive), and ZS-999 on a component that is not in the scene. Each can be raised or cleared, acknowledged and re-graded.
