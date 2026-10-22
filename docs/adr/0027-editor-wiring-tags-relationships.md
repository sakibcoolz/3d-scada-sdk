# ADR-0027: Editing ports, wiring, tags and relationships

Status: Accepted (owner, 2026-10-23: wiring through a picker in the Properties panel, the tag editor as a dialog, and connection properties as a key and value list); T-087..T-088 implemented, T-089 pending. M9 Phase 8 of docs/INDUSTRIAL_SDK_PLAN.md (§9), tasks T-087..T-089.

## Context
The document can now describe a whole control line:
- typed ports, wired connections and associations (ADR-0023);
- data sources and read-only runtime variables (ADR-0024);
- library equipment (ADR-0025);
- 2D views (ADR-0026).

But the editor can only **place** parts, join pipes by snapping, and bind a tag ID to a property or a pipe. Wiring a PLC output to a drive input, recording that a PLC controls a drive, describing where a tag is read from, or asking "what feeds this motor?" all require editing JSON by hand. Phase 8 brings these into the editor without changing the document format.

## Decision

### 1. Port and terminal inspector (read only)
- **Ports section:** when a component is selected, the Properties panel gains a "Ports" section with one row per port:
  - name or ID, terminal label and domain;
  - ratings: signal type, range and unit; power kind, voltage and phases; network medium and protocols; fluid nominal size;
  - connections used out of `maxConnections`;
  - what each connection joins to, as "VFD-101 · run (DI1)".
- **Navigation:** a row's "go to" selects the other component, which in a workspace (ADR-0026) also selects it in 2D.
- **Pure model:** `describePorts(scene, componentId, registry)` in `@sakibcoolz/react`, unit-tested and with no rendering.

### 2. Relationship explorer (read only)
- **Related section:** the selected component's neighbours, grouped by:
  - **physical:** pipes and shafts;
  - **power:** "supplied from" and "supplies";
  - **signal** and **network**;
  - **each association relationship in both directions**, for example "controls" and "controlled by", "drives" and "driven by", "measures" and "measured by".
- **Control chain:** the components reachable along `controls`, `drives` and `measures` associations and signal and power wiring. For example, a pump shows motor → drive → PLC.
- **Explicit edges only:** the explorer uses only core's queries over explicit edges (`neighbours`, `relatedComponents`, `pathBetween`), and never guesses from names. Each entry selects that component.
- **Pure model:** `describeRelations(scene, componentId, registry)`.

### 3. Editing wiring and associations
- **Wire:** each free power, signal or network port in the Ports section has a "Wire…" action. It opens a picker of the other components' ports in the same domain:
  - **compatible ports with free capacity** can be chosen;
  - **incompatible or full ports** are listed but disabled, each with the reason from `checkPorts` or "already has N connections", so the user learns why a 230 V motor cannot go on a 400 V drive;
  - choosing one calls core's `connect`, which validates as on load, as one undo step;
  - the picker can filter by component;
  - pure `wiringCandidates(scene, componentId, portId, registry)` returns them.
- **Disconnect:** every wired row can be disconnected (`disconnect`). Pipes keep their current behaviour (snapping, attach, delete).
- **Connection fields:** a wired row may set its `relationship` (the built-in kinds, or none). The free-form `properties` (cable type, length) get a key and value list, limited by the document's own rules (`maxProperties`, string length, no credential-like keys).
- **Associations:** the Related section has "Add relationship" (a relationship and a target component), using `addAssociation`, and removal on each association row, using `removeAssociation`.
- **Locking:** every edit goes through the editor's history and the edit lock. The 2D views (ADR-0026) redraw from the result; drawing wires in the electrical view is a later phase.
- **No physical claim:** editing wiring changes the **model only**. Nothing is checked against real installations, and the UI states that the checks are an engineering aid (ADR-0023).

### 4. Tag and variable editor
- **Tags dialog:** a "Tags…" toolbar button opens a dialog (`role="dialog"`) for the scene's acquisition description (ADR-0024).
  - **Data sources:**
    - ID, name, protocol (`opcua`, `modbus-tcp`, `modbus-rtu`, `host`, or a namespaced host protocol);
    - device (a component), and `endpointRef` as an opaque reference;
    - credentials are refused by core (`SECRET_FIELD`), and the dialog says so next to the field.
  - **Runtime variables:**
    - ID, name, component, data type, unit and source;
    - an address form by protocol: Modbus area, address, unit ID, byte and word order, and bit; OPC UA node ID and namespace URI; none for `host`; raw JSON for namespaced protocols;
    - optional linear scaling.
    - `access` is fixed to `read`: there are no writes (ADR-0003). The command boundary is Phase 10.
- **Validation:** each change is validated with `validateScene` before it is committed. Errors appear next to the field whose path they name, and nothing invalid is committed. Each change is one undo step.
- **Suggestions and review:**
  - "Suggest tags" lists `suggestVariables` proposals with checkboxes, and "Add selected" calls `applyTagSuggestions`;
  - a "Review" list shows `reviewTags` findings, each linked to its component or tag.
- **Bindings:** the existing per-property and per-pipe tag fields offer the scene's variable IDs as suggestions (a datalist). Opaque host tag IDs stay allowed.

### 5. Code layout
- **New modules** in `@sakibcoolz/react`, so that `index.tsx` only wires them in:
  - `inspector.tsx` with `ports.ts` and `relations.ts`, the pure models;
  - `wiring.ts`;
  - `tagEditor.tsx` with `tagForms.ts`.
- **No new dependencies.** Core and components are unchanged except for small helpers if a query is missing; any such addition is listed in the task's notes.
- **Text is never markup:** every label, name, tag and endpoint is React text.

### 6. Not in this ADR
- drawing or dragging wires in the 2D electrical view, or in 3D;
- cable routing and cable schedules;
- bulk import of tag lists (CSV);
- live tag browsing from OPC UA or Modbus devices, since the SDK opens no connections (SECURITY_AND_SAFETY);
- writable tags or commands (Phase 10, D5);
- multi-selection editing.

## Options considered
- **Wiring by dragging in the electrical view:** deferred. It needs terminal hit-testing and live routing in SVG. The picker gives the same result, with the compatibility reasons visible, and works from the 3D editor too.
- **The tag editor as a side panel:** rejected for now. Variables are scene-level, not per component, and need room for address forms. A dialog keeps the 3D view uncluttered and is reachable by keyboard.
- **A free text editor for the acquisition JSON:** rejected. It would bypass per-field validation messages. The existing import already covers bulk JSON.

## Consequences
- **Additive:** no document or schema change, and no new error codes. New UI and pure helpers only.
- **The editor becomes the place to build a control line**, from library parts to wires, relationships and tags, with every step validated and undoable.

## Tasks and tests
- **T-087, inspector and explorer:**
  - the Ports and Related sections, with `describePorts` and `describeRelations`;
  - unit tests on the `?control` scene (ratings, usage, joins, groups, chain);
  - e2e: inspecting the drive, going to the motor, and the pump's control chain.
- **T-088, wiring and associations:**
  - `wiringCandidates`, the picker, disconnect, the relationship and properties fields, and adding and removing associations;
  - unit tests (candidates and reasons, capacity);
  - e2e: wire a DO to the drive's run input; a 230 V motor is shown disabled with its reason; undo; disconnect; add and remove "controls"; the electrical view redraws.
- **T-089, tag and variable editor:**
  - the dialog: data sources, variables, address forms, scaling, inline errors, suggestions, review, and binding datalists;
  - unit tests on the form models;
  - e2e:
    - create a Modbus source and a float32 variable, bind it to the tank level, and save and reload;
    - an endpoint with credentials is refused at its field;
    - the drive's suggested tags are applied;
    - review findings link to their targets.

## Implementation notes (T-087)
- **Models** (`@sakibcoolz/react`, internal, unit-tested):
  - `ports.ts`: `describePorts`, `describeRating` and `portFlow` (a port's `flow`, else DO/AO out and DI/AI in).
  - `relations.ts`: `describeRelations`.
  - Neither is exported from the package yet; T-088 may export them if hosts need them.
- **Ports section:**
  - one row per port in definition order: name (else ID), terminal, kind, usage `used/capacity`, and a rating line;
  - ratings read like "DI", "AI 4–20 mA", "AC 400 V 3-phase out", "PE", "ethernet · modbus-tcp, opcua" or "bore 150 mm";
  - each join reads "M-101 · terminals (U V W)" and selects that component.
- **Related section:** groups in edge order.
  - Pipes and shafts: "Piped or coupled to".
  - Power by this component's port direction: "Supplied from" (in), "Supplies" (out), "Earthed with" (PE) and "Power".
  - Signals: "Receives signal from" (in), "Sends signal to" (out), and "Signal" (bidirectional).
  - "Network".
  - Associations both ways: forward, the relationship capitalised ("Controls"); reverse, passive ("Controlled by", "Driven by", "Measured by"…), and `<name> (from)` for host relationships.
- **Control chain:** breadth first and upstream, following who drives or controls this component, who supplies its power inputs, and who signals its inputs. "Measures" is not acting on, so a tank's chain is empty.
  - In the `?control` demo the pump's chain is M-101, VFD-101, DO-01, AO-01, PLC-01, PSU-01.
  - I/O modules sit in the panel with no modelled backplane, so the chain reaches the PLC through the `controls` association.
- **Read only:** both sections stay open while editing is locked.
- **Tests:** `inspector.test.ts` (6) and e2e `inspector.spec.ts` (2).

## Implementation notes (T-088)
- **`wiring.ts` (pure):**
  - `wiringCandidates(scene, componentId, portId, registry)` lists ports of the **same kind** on other components, choosable ones first, each with a rating and, if refused, a reason:
    - "already wired to this port";
    - else `checkPorts`'s reason (for example "400 V cannot connect to 230 V", "protective earth connects only to protective earth");
    - else "already has N connections, its maximum".
  - Undefined for pipes and shafts (`matesPhysically`) and for unknown ports.
  - Every choosable candidate is accepted by core's `connect`, which a test checks.
  - `parsePropertyValue` reads a typed value as a finite number, `true`/`false`, else the text.
- **Ports section (unlocked only):**
  - "Wire…" on a wired port with free capacity opens a picker with a component filter. Refused entries are disabled, with their reason below them.
  - Each wire has "Details" (relationship select, and a property name and value list) and "Disconnect".
- **Related section (unlocked only):**
  - "Add relationship" (a built-in relationship and a target component);
  - × removes an association, so association entries carry their ID.
- **Editor:**
  - wiring uses core `connect` and `disconnect`, associations use `addAssociation` and `removeAssociation`, and wire details are validated with `validateScene` before commit;
  - a refusal becomes the connection notice ("Cannot wire: …", "Cannot change the connection: …"), never a change;
  - every success is one undo step.
- **Fixed in testing:** an open picker stayed open while switching to another component. The sections are now keyed by component ID.
- **Tests:** `wiring.test.ts` (4) and e2e `wiring.spec.ts` (3):
  - the 230 V motor refused with its reason, then wired at 400 V, the electrical diagram redrawn, undo and redo;
  - DO0 to the drive's run input, with the relationship and cable properties, a credential-like name refused, and disconnect;
  - a relationship added, the duplicate refused, removal, and nothing offered while locked.
