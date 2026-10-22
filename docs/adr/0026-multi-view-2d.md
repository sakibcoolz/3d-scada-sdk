# ADR-0026: Process and electrical 2D views over one model

Status: Accepted (owner, 2026-10-23: `views` in v4 without a version bump, `@sakibcoolz/react` depends on `views-2d`, and the phase scope); T-083..T-086 implemented. M9 Phase 7 of docs/INDUSTRIAL_SDK_PLAN.md (§7, decision D4 approved), tasks T-083..T-086.

## Context
The scene already holds:
- the process plant: fluid ports and pipes;
- the control system: power, signal and network wiring (ADR-0023);
- associations and tags (ADR-0024);
- a control equipment library (ADR-0025).

But the only way to see it is in 3D, where a PLC module's 18 wires are a fan of lines into a box a few centimetres wide (the `?control` demo shows this). Engineers read plants as a process diagram (P&ID style) and the control system as an electrical diagram. The plan (§7) asks for both as 2D views over the **same** document, with synchronised selection and saved layouts. Decision D4 approved a separate `@sakibcoolz/views-2d` package (SVG, no new runtime dependency).

## Decision

### 1. One model, layouts per view (core, scene v4, additive)
- **New optional root field:**
  ```ts
  views?: { process?: ViewLayout; electrical?: ViewLayout };
  interface ViewLayout {
    symbols?: Record<string, { x: number; y: number; rotation?: 0 | 90 | 180 | 270; hidden?: true }>; // by component id
    routes?: Record<string, { points: [number, number][] }>;                                          // by connection id
  }
  ```
- **Units and axes:** drawing units of 1 mm on a sheet, with x to the right and y down, as in SVG. A 10-unit grid is a display aid only.
- **Layout only.** Equipment, ports, wiring and tags stay where they are, so a view never holds a second copy of the model.
  - Deleting a component (`removeComponent`) also removes its symbol from every view, along with the routes of its connections.
  - `disconnect` removes the connection's routes.
- **Validation:**
  - finite coordinates within ±1,000,000 units;
  - unknown component or connection IDs are refused as `UNKNOWN_VIEW_REFERENCE`;
  - `routes` need at least two points;
  - only the keys `process` and `electrical`. Host views use `extensions`.
- **Serialization:** fixed key order; the keys of `symbols` and `routes` are sorted. `views` is omitted when empty.
- **No schema version bump:** v4 adds the field (as `associations` was added under ADR-0023). JSON Schema and fixtures are updated, and 0.2.0 is still unreleased.
- **Not saved:** the 3D camera, zoom, pan and selection are UI state. 3D layout is the components' own positions.

### 2. What each view shows
Membership is decided by ports, not by names.
- **Process view:**
  - components with a fluid or mechanical port, plus built-in motors and sensors;
  - fluid and mechanical connections, drawn as process lines;
  - `measures` and `drives` associations, drawn as dashed instrument lines.
- **Electrical view:**
  - components with a power, signal or network port;
  - power, signal and network connections, coloured as the 3D wires (`wireColors`), with terminal labels at each end;
  - `controls` and `communicates` associations, drawn dashed.
- **Both views:** a component can be in both, for example the motor (shaft plus power terminals).
- **Override:** a definition may set `views?: ('process' | 'electrical')[]` to choose its views directly.
- **Hiding:** `hidden: true` hides a symbol in that view only.

### 3. Symbols
- **Built in:** `views-2d` ships symbols for:
  - the 14 built-in kinds;
  - the `sdk.*` library: ISA-5.1-style process symbols, plus IEC-60617-style electrical symbols such as a motor circle with M, a drive box, terminal strips and I/O cards with one terminal per channel.
  - The standards are references only. **No compliance is claimed.**
- **Host types** may give `symbol2D` and/or `electricalSymbol` on their definition: `{ svg: string; width: number; height: number; ports?: Record<portId, [x, y]> }`.
  - The SVG is passed through `sanitizeSvg` (asset-import, DOM-free) at registration.
  - It is rendered from the sanitized shape list as React elements, never as `innerHTML`.
  - An unsafe symbol fails registration with the sanitizer's errors.
- **Fallback:** a labelled rectangle with ports spread around its edge.
- **Labels:** the component's `name` or `id`, and live values, are rendered as React text, so untrusted text is never markup (`untrusted-text` e2e extended).

### 4. Placement and routing (pure functions in views-2d, deterministic, unit-tested)
- **`layoutView(scene, view, registry)`** returns a position for every member. Saved symbols are used as they are.
  - Members without a layout are placed automatically and marked **unplaced**, drawn with a dashed outline until the user moves them.
  - Automatic placement works in layers from the connection graph:
    - process: sources to the left, along `from → to`;
    - electrical: supplies and controllers to the left, then I/O, then field devices.
  - It snaps to the 10-unit grid.
- **Routes:**
  - A saved route's points are used as they are.
  - Otherwise the route is an orthogonal line between the two port anchors, with at most two bends and no obstacle avoidance in this phase. It is never saved unless the user edits it.

### 5. React components (`@sakibcoolz/views-2d`)
- **Components:** `<ProcessView>` and `<ElectricalView>` take these props:
  ```ts
  { scene, registry?, selectedIds?, onSelectionChange?, telemetry?, editable?, onChange? }
  ```
- **Interaction:** pan (drag the background), zoom (wheel or buttons), select (click, Shift-click to add), keyboard focus with Enter to select, and fit to view.
- **Editing:** with `editable`, dragging a symbol writes `views.<view>.symbols[id]` through `onChange` (snapped). That is the only edit in this phase.
  - Wiring edits are Phase 8.
  - Live values: bound property values with their quality, and DISCONNECTED or BAD shown as unknown, the same rules as 3D (ADR-0003).
- **Dependencies:** peer dependencies `react` and `react-dom`; dependencies `@sakibcoolz/core`, `components` and `asset-import`.
  - **No three.js and no new third-party dependency**, so hosts can use 2D alone.
- **Package:** `@sakibcoolz/views-2d`, published with the others (RELEASE.md), and included in the `verify:consumer` pack check.

### 6. Shared selection and the workspace (`@sakibcoolz/react`)
- **Controlled selection:** the editor and viewer gain `selectedIds` and `onSelectionChange(ids)` for components. Without them, behaviour is unchanged (internal selection).
- **Workspace:** `<ScadaWorkspace layout="3d" | "process" | "electrical" | "split">` composes the editor and the two 2D views over one document and one selection.
  - `split` shows 3D beside a process/electrical tab.
  - `@sakibcoolz/react` therefore depends on `views-2d`, which is ours, small and has no three.js.
- **Not saved:** selection is never written to the document.

### 7. Not in this ADR
- editing wiring or associations in any view (Phase 8);
- cable routing in 3D;
- sheets, title blocks and print or PDF export;
- automatic cross-references between sheets;
- a full router with obstacle avoidance;
- connection selection;
- runtime mode (Phase 9).

## Options considered
- **`@xyflow/react` or another graph library:** rejected. It is a new runtime dependency, against D4, and its node model would sit beside ours rather than read it.
- **Storing 2D positions on components** (`component.position2d`): rejected. A component needs a different place in each view, and the views must not change the physical model.
- **Canvas rendering:** deferred. SVG gives accessible, testable, selectable elements. Canvas only becomes worth it far beyond the scales in docs/PERFORMANCE.md.
- **Symbols as host code (React components):** rejected for documents and definitions. Symbols are data so that a definition stays serialisable (plan §4, "No code").
- **`ScadaWorkspace` in views-2d:** rejected. It would pull three.js into the 2D package.

## Consequences
- **Additive:** files without `views` behave as before, and hosts not using 2D see no change except an unused dependency of `@sakibcoolz/react`.
- **New error code:** `UNKNOWN_VIEW_REFERENCE`. The fuzz and security tests learn it.
- **New release unit:** `@sakibcoolz/views-2d`.
- **Performance budget:** 1,000 components in a view render in under 500 ms in the e2e budget run. 5,000 must stay usable, with no virtualisation yet; it is measured and recorded.

## Tasks and tests
- **T-083, views in the document (core):**
  - the `views` type, validation (`UNKNOWN_VIEW_REFERENCE`, limits), serialization, and clean-up in `removeComponent` and `disconnect`;
  - schema and fixtures, fuzz.
- **T-084, `@sakibcoolz/views-2d` with the process view:**
  - package scaffold;
  - process symbols for the built-in kinds and the library;
  - `layoutView` and routes;
  - `<ProcessView>` with selection, pan and zoom, live values, and drag-to-place;
  - unit tests for membership, layout determinism and routes;
  - consumer pack check.
- **T-085, electrical view:**
  - electrical symbols (I/O cards with terminals, drive, motor, PSU, switch, panel);
  - wire colours and terminal labels;
  - host `symbol2D`/`electricalSymbol` with sanitizing at registration;
  - `<ElectricalView>`.
- **T-086, shared selection and the split workspace:**
  - controlled `selectedIds` in the editor;
  - `<ScadaWorkspace>`;
  - playground `?control&layout=split`;
  - e2e: selecting in 2D selects in 3D and the reverse, dragging a symbol saves `views.*` and round-trips, untrusted labels, and the 1,000-component budget.

## Implementation notes (T-083)
- **Types (core `scene.ts`):** `viewKinds`, `ViewKind`, `SymbolPlacement`, `ViewRoute`, `ViewLayout` and `SceneViews`; `ScadaScene.views?`.
- **Validation:**
  - `readViews` checks the structure: only `process` and `electrical`; only `symbols` and `routes`; symbol fields `x, y, rotation?, hidden?`; coordinates finite within ±1,000,000, with `-0` read as 0 so that save and reload is byte-identical.
  - Limits: symbols ≤ `maxComponents`, routes ≤ `maxConnections + maxAssociations`, and 2 to 1,000 points per route. Keys are IDs (1–128 characters), stored as plain data so `__proto__` cannot reach a prototype.
  - `checkViews` refuses unknown IDs with `UNKNOWN_VIEW_REFERENCE`. Routes may name a connection **or an association**, because associations are drawn dashed in the views.
- **Serialization:** `process` before `electrical`; `symbols` before `routes`; IDs sorted; symbol key order `x, y, rotation?, hidden?`.
- **Clean-up (`graph.ts`):** `removeComponent`, `disconnect` and `removeAssociation` drop dangling symbols and routes. Emptied layouts and an emptied `views` field are removed. A scene with nothing to drop keeps its `views` object as it is.
- **Schema:**
  - `views` and `$defs.viewLayout`, with `viewCoordinate` bounds;
  - fixtures: `valid/views`, `invalid/view-rotation` and `validator-only/view-unknown-component`;
  - the fuzz base document now carries views, so the "schema is never stricter" mutation run covers them.
- **Tests:** `views.test.ts` (8) covers acceptance and canonical output, files without views, unknown references, malformed layouts and limits, a `__proto__` ID, and clean-up by each removal. The API and security code lists were updated.

## Implementation notes (T-084)
- **Package:** `packages/views-2d` (`@sakibcoolz/views-2d`).
  - Depends on core and components; react and react-dom are peers. No new third-party dependency.
  - Added to `verify:consumer`. The consumer app gains a "Process" mode, which the consumer browser test checks, and `node-check` runs the pure model in Node.
- **Model (`model.ts`, pure):**
  - `inView`: a definition's `views`; else built-in kinds are process equipment; else the views of its port kinds.
  - `layoutView`: symbols with positions and port anchors, plus lines.
    - Process lines are fluid and mechanical connections, plus `measures` and `drives` associations.
    - Saved symbols and routes are used as they are. Hidden symbols and entries for removed IDs are skipped.
  - Automatic placement:
    - layers follow connection direction in scene order, and a cycle is broken at the first remaining component;
    - columns are 120 units apart and rows 90, snapped to the 10-unit grid;
    - association-only components join their partner's column, below it;
    - unplaced symbols go below the saved ones.
  - Port anchors: a symbol's own `ports` entry, else the port's 3D front-view position (x, y) scaled into the symbol box. Rotation turns them about the centre.
  - Lines:
    - connections run port to port, orthogonal, with at most two bends;
    - associations run between symbol edges, so they never cross either symbol.
  - `placeSymbol` saves a snapped place and keeps rotation and `hidden`.
- **Definitions:** `ComponentDefinition.views?` is checked at registration (non-empty, distinct, `process` or `electrical`). `sdk.transmitter` and `sdk.switch` set both views.
- **Symbols (`symbols.ts`):**
  - data shapes (rect, circle, line, polygon, polyline, text) for the 14 built-in kinds;
  - `sdk.motor`, `sdk.switch` (XS), and `sdk.transmitter`, whose letters follow `measures` (PT, TT, LT, FT);
  - a labelled box for everything else.
- **`<ProcessView>`** is built on a shared `DiagramView`:
  - select by click, Shift-click, Enter or Space; clicking the background clears;
  - pan by dragging the background, zoom with the wheel (non-passive) or the buttons, and Fit;
  - drag to place (with `editable`), and a drag is never also a click;
  - each symbol has a transparent hit area, so the inside of an outline is clickable;
  - live values come from core `resolveTelemetry`;
  - all text is React text.
  - `describeLiveValue` repeats the 3D view's line format; T-086 will share one implementation once `@sakibcoolz/react` depends on this package.
- **Playground:** `?view=process` (with or without `?control`) opens the view under the editor, with a "Process view" toggle. The editor does not take outside edits until T-086, so the playground keeps the 2D layout beside it, and the editor's JSON does not include it yet.
- **Tests:**
  - `views-2d/src/model.test.ts` (11): membership, lines, labels, placement, determinism and cycles, routes and anchors, saved layouts, `placeSymbol`, and server-rendered markup (accessibility, escaped names, live values);
  - registry `views` tests;
  - e2e `process-view.spec.ts` (5): members and lines, live and disconnected values, selection, drag to place, zoom, pan and Fit;
  - the consumer browser test.

## Implementation notes (T-085)
- **Host symbols (components):**
  - `ComponentTypeDefinition.symbol2D` and `electricalSymbol` take `{ svg, width, height, ports? }`.
  - At registration the SVG goes through `sanitizeSvg` (at most 64 KiB and 500 elements); width and height must be 1–1000; `ports` must name real ports with points inside the symbol. Any problem fails registration.
  - The registered definition carries `symbols: { process?, electrical? }` of `RegisteredSymbol { width, height, ports?, drawing: SanitizedSvg }`.
  - `@sakibcoolz/components` now depends on `@sakibcoolz/asset-import`, which is ours and has no dependencies, so there is no cycle.
- **Rendering:** host shapes become `path` symbol shapes, with the viewBox scaled onto the symbol size and pre-multiplied into each path's matrix. Only sanitized path data, a numeric `matrix()` and `#rrggbb` or `none` colours reach the DOM, never markup.
- **Symbol choice:** a host symbol, else the view's built-in, else (electrical) a generated `terminalBlock` or (process) a labelled box.
- **Electrical symbols:**
  - `terminalBlock(title, ports)`: inputs on the left (flow `in`, DI, AI and power in), outputs on the right (flow `out`, DO, AO), network on top and PE at the bottom; 8-unit pitch, labelled by `terminal` else ID; fluid and mechanical ports are left out;
  - the motor is a circle with M, with power on top and PE below;
  - instruments are bubbles with the supply on the left and the output on the right.
- **Electrical placement:** `electricalTier(ports)` gives the columns, left to right:
  - supply (power out, or earth only);
  - controllers and switches (network, no signal);
  - I/O cards (signal ports only);
  - field devices (signal plus others: drive, transmitter, sensor);
  - loads (power in only: the motor).

  Columns are 170 units apart. In both views, rows now stack by symbol height with a 40-unit gap, so a 16-channel card never overlaps the next one.
- **Lines:** wires keep `data-edge-domain` and are drawn in `wireColors`. `controls` and `communicates` associations are dashed. Terminal labels are drawn inside the blocks. Wires may overlap, because there is no obstacle avoidance in this phase.
- **`<ElectricalView>`** shares `DiagramView` with the process view. The playground's `?view=process,electrical` shows both side by side, sharing the layout and the selection.
- **Known placement:** the control cabinet (mains in plus a PE bar) lands in the loads column, because its only non-earth port is a power input.
- **Tests:**
  - `views-2d/src/electrical.test.ts` (7): membership and lines, tier order, no overlap, terminal sides and labels, wire endpoints at terminals, host symbol drawing and markup, and refused symbols (script, `onload`, size, unknown port, point outside, missing SVG);
  - e2e `electrical-view.spec.ts` (3): wires per domain, terminal labels, selection shared across views, and placing in one view leaving the other unchanged;
  - consumer `node-check`: the electrical model and sanitizing at registration in Node.

## Implementation notes (T-086)
- **Controlled selection in the editor:** `selectedIds` and `onSelectionChange(ids)`.
  - The editor's single selection shows the last ID. Selecting in 3D reports `[id]`, and clearing reports `[]`. It reports only when the selection changes.
  - Without the props, behaviour is unchanged.
  - Shift-click in 3D still means attach, so multi-selection stays a 2D feature.
- **Outside layout edits:** `ScadaHandle.setViews?(views)` exists on the editor only.
  - It commits `views` through the editor's history as one step, so a 2D drag undoes and redoes, saves in the editor's JSON, and is refused while locked (returning false).
  - The editor stays the single owner of the scene.
- **`<ScadaWorkspace>`** (`@sakibcoolz/react`, new dependency on `@sakibcoolz/views-2d`):
  - takes the editor's props plus `layout`/`defaultLayout`/`onLayoutChange` (`3d | process | electrical | split`, default split), `defaultDiagram`, `selectedIds`/`onSelectionChange` and `editorRef`;
  - a layout toolbar; in split, a Process/Electrical diagram toggle beside 3D;
  - the editor stays mounted (hidden) in the 2D-only layouts, so the history survives layout switches;
  - the diagrams follow the editor's `onChange`, and are `editable` only while the editor is unlocked;
  - one selection for all views, never saved;
  - telemetry: the same `telemetry` input reaches the editor and the diagrams. Values pushed with `setTagValues` reach the editor only.
- **One live-value format:** `@sakibcoolz/react`'s `describeProperty` now uses views-2d's `describeLiveValue`.
- **Playground:** `?layout=3d|process|electrical|split` opens the workspace, and `?view=process|electrical` is split with that diagram. The T-084/T-085 side panels, which kept the layout outside the editor, are removed.
- **Performance:** about 88 ms for 1,000 components (production build), and 194 ms and 727 ms for 1,000 and 5,000 on the dev server. See docs/PERFORMANCE.md.
- **Tests:**
  - e2e `workspace.spec.ts` (7):
    - selection both ways and cleared with Escape;
    - a 2D drag saved in the scene JSON, undo and redo, export and import with the layout;
    - deleting in 3D removes the symbol and its saved place;
    - the lock applies to the diagrams;
    - switching layouts keeps the history;
    - untrusted names drawn as text;
    - the 1,000-component budget.
  - The process and electrical view specs now run in the workspace.
  - The react API list was updated.
