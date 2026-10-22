# ADR-0025: Control equipment library

Status: Accepted (owner, 2026-10-22: `sdk.` prefix, the equipment list, and motor → pump by association); T-080 implemented, T-081..T-082 pending. M9 Phase 6 of docs/INDUSTRIAL_SDK_PLAN.md (§9), tasks T-080..T-082.

## Context
Phases 2–5 built the machinery:
- host component types (ADR-0022);
- power, signal and network ports with compatibility rules, wired connections, associations and chain queries (ADR-0023);
- typed, read-only tags with variable templates and suggestions (ADR-0024).

But the SDK ships **no control equipment**. The built-in `motor` is a geometry placeholder with no ports, and there is no PLC, drive or transmitter. Every host must define its own before it can draw a PLC → VFD → Motor line. This phase adds a small, honest library of generic control equipment, built **only** from those public mechanisms.

## Decision

### 1. An opt-in library of `sdk.*` types (no core change)
- **Where:** the components package exports `controlLibrary`, an array of ordinary `ComponentTypeDefinition`s. A host opts in with `createComponentRegistry(...controlLibrary, ...ownTypes)`.
  - The 14 built-in kinds, `componentKinds`, core validation and the default palette are **unchanged**.
  - Pure process hosts see nothing new.
- **Type IDs:** namespaced under the reserved prefix `sdk.`, for example `sdk.plc.cpu` and `sdk.vfd`.
  - `createComponentRegistry` refuses an `sdk.*` definition that is not one of the library's own objects, checked by identity. So a host cannot shadow or fake an SDK type.
  - Bare names stay reserved for the original 14 kinds, as in ADR-0022.
- **Why not more bare built-ins** (`plc`, `vfd`): that would grow core's closed `componentKinds` list. Every `Record<ComponentKind, …>` (catalog, legacy ports, joint styles, simulation) would need new entries, and every host's palette would gain seven control parts it may not want. The library is also proof that the registry is enough.
- **The plan's naming is kept.** The `sdk.` prefix was already proposed in docs/INDUSTRIAL_SDK_PLAN.md §5.1 and §9.

### 2. The equipment
These are generic, vendor-neutral types, drawn from the catalog's primitive parts. They have `version: '1'` and a `category` (`control`, `electrical`, `instrument`, `enclosure`, `network`).

| Type | Parameters | Ports | Variable templates |
|---|---|---|---|
| `sdk.plc.cpu`: PLC controller | — | 2 × `network` ethernet (`modbus-tcp`, `opcua`); `power` 24 V DC in; PE | `RUN` bool, `FAULT` bool |
| `sdk.plc.di`: digital input module | `channels` 8 \| 16 | `DI0`…`DIn` signal DI | `DI0`… bool |
| `sdk.plc.do`: digital output module | `channels` 8 \| 16 | `DO0`…`DOn` signal DO | `DO0`… bool |
| `sdk.plc.ai`: analog input module | `channels` 4 \| 8; `signal` 4–20 mA \| 0–10 V | `AI0`… signal AI with that range | `AI0`… float32, in mA or V |
| `sdk.plc.ao`: analog output module | `channels` 2 \| 4; `signal` as AI | `AO0`… signal AO | `AO0`… float32 |
| `sdk.dcs.controller`: DCS controller | — | 2 × `network` (redundant pair); `power` 24 V DC in; PE | `RUN`, `FAULT`, `REDUNDANCY_OK` bool |
| `sdk.vfd`: variable-frequency drive | `ratedPowerKw` 0.75–90 (frame size); `supply` 230 \| 400 \| 480 V | `L1-L3` power AC 3-phase in; `U-V-W` power AC 3-phase out; PE; `run`, `reset` signal DI; `speedRef` signal AI 4–20 mA; `speed` signal AO 4–20 mA; `fault` signal DO; `eth` network | `ACTUAL_SPEED` rpm, `OUTPUT_FREQUENCY` Hz, `OUTPUT_CURRENT` A (float32); `RUNNING`, `FAULT` bool |
| `sdk.motor`: AC induction motor | `ratedPowerKw` (frame size); `voltage` 230 \| 400 \| 480 | `terminals` power AC 3-phase in; PE; `shaft` mechanical | none (a motor's values come through its drive) |
| `sdk.transmitter`: analog transmitter | `measures` pressure \| temperature \| level \| flow | `out` signal AO 4–20 mA; `power` 24 V DC in | `PV` float32, unit by measured quantity |
| `sdk.switch`: digital sensor (level or proximity switch) | — | `out` signal DO; `power` 24 V DC in | `STATE` bool |
| `sdk.network.switch`: Ethernet switch | `ports` 5 \| 8 \| 16 | `P1`…`Pn` network ethernet; `power` 24 V DC in | none |
| `sdk.psu`: 24 V DC power supply | — | `L1` power AC 1-phase in; `24V` power DC out, `maxConnections` 16; PE | `DC_OK` bool |
| `sdk.panel`: control cabinet | `width`, `height`, `depth` | `PE` bar, `maxConnections` 32; `mains` power AC in | none |

- **Geometry:** recognisable but simple. Boxes, a few cylinders and text plates; for example a drive is a tall box with a keypad plate, and a motor is a cylinder with fins and a terminal box. Terminals sit on the front or underside. No vendor shapes, logos or model numbers.
- **Mounting:**
  - Modules, CPUs, PSUs and switches are placed in a panel as assembly children (ADR-0008), with no new mounting model.
  - DIN-rail and rack slot positions are not modelled.
- **Motor to pump:** the existing pump keeps its ports, so its behaviour does not change. A motor drives a pump through an association `{relationship: 'drives'}` (ADR-0023). Its `shaft` port is for host machines that do have one.
- **No behaviour:** the types are passive in simulation (ADR-0022). They render, wire, validate, query and suggest tags; they do not compute anything.
- **Safety:** the ratings (voltage, phases, signal ranges) exist only to drive ADR-0023's compatibility checks. They are not equipment data and certify nothing.

### 3. Demo scene and playground
- `?control` opens a PLC → VFD → Motor → pump vertical slice, as planned for after Phase 5:
  - the existing tank and pump hydraulics;
  - a panel holding a PLC CPU, DI/DO/AI modules, a PSU and a switch;
  - a VFD wired to the motor (power), the PLC (run, fault, speed reference and network), and a transmitter on the tank (4–20 mA to an AI channel);
  - `controls` and `drives` associations;
  - runtime variables on a `host` data source, fed by the existing demo feed, including `DISCONNECTED`.
- The playground loads only the library and the scene file; the editor still has no wiring UI (Phase 8).

### 4. Not in this ADR
- vendor-specific models;
- rack and slot topology;
- terminal-strip and cable-schedule drawings (Phase 7);
- live status visuals on the equipment, such as run lamps (Phase 9);
- editing wiring in the editor (Phase 8);
- safety devices (E-stops, safety relays);
- any change to the 14 built-in kinds.

## Options considered
- **New bare built-in kinds:** rejected for the reasons in §1. Core churn, and a forced palette for every host.
- **A separate npm package** (`@sakibcoolz/control-library`): deferred. It adds a release unit for about 15 definitions. The library can move later without changing type IDs.
- **A mechanical port on the built-in pump:** rejected here. It would change snapping and attach for every existing pump. An association records the coupling.
- **Vendor models** (for example a specific drive series): rejected. They would be the SDK claiming product data it cannot keep correct.

## Consequences
- **Additive:** hosts that do not register `controlLibrary` see no change. The reserved `sdk.` prefix is a new registration rule, but no host could have registered `sdk.*` types for real use yet (0.2.0 is unreleased).
- **Proof:** a full control line built from public mechanisms only, which also exercises ADR-0022 to ADR-0024 end to end.

## Tasks and tests
- **T-080, control and I/O:**
  - `sdk.plc.cpu`, `sdk.plc.di/do/ai/ao`, `sdk.dcs.controller`, `sdk.network.switch`, `sdk.psu`;
  - the reserved-prefix rule;
  - definition tests: every parameter value gives valid, unique, unit-direction ports and in-range templates; port domains and channel counts are right; registration is refused for fakes.
- **T-081, drives, motors, sensors and panel:**
  - `sdk.vfd`, `sdk.motor`, `sdk.transmitter`, `sdk.switch`, `sdk.panel`;
  - compatibility tests: VFD out → motor in passes, a 230 V motor on a 400 V drive is refused, a transmitter → AI 4–20 mA passes, and → AI 0–10 V is refused.
- **T-082, demo and documentation:**
  - the `?control` scene, with e2e: renders, wires drawn, tags shown, a disconnected tag, chain query results in the console example;
  - a consumer example registering the library;
  - a COMPONENT_LIBRARY section in COMPONENT_STANDARD.

## Implementation notes (T-080)
- **Where:** `packages/components/src/library/control.ts` exports `controlLibrary`, a frozen array with `sdk.plc.cpu`, `sdk.plc.di`, `sdk.plc.do`, `sdk.plc.ai`, `sdk.plc.ao`, `sdk.dcs.controller`, `sdk.network.switch` and `sdk.psu`.
- **Parametric definitions:** a small `parametric` helper builds each definition's base shape from the parameter defaults, and gives a `build` for the other choices.
  - `build` may now also return `variables`, so tag templates follow the channel count.
  - Choice parameters are strings: `channels` `"8"`/`"16"`, `signal` `"4-20 mA"`/`"0-10 V"`, `ports` `"5"`/`"8"`/`"16"`.
- **Terminals:** on the front face in two columns, the first half on the left. Port IDs and terminal labels are the channel names (`DI0`…), and so are the template names.
- **Reserved prefix:** `createComponentRegistry` refuses an `sdk.*` definition unless it is one of the library's own objects (a module-private `WeakSet`). Spread copies and invented `sdk.*` IDs are refused.
- **Ratings used for checks:**
  - 24 V DC in on CPUs, the DCS controller and switches; 16 × 24 V DC out on the PSU; 230 V single-phase mains on the PSU; PE;
  - Ethernet with `modbus-tcp`/`opcua` on controllers, and plain Ethernet on switch ports;
  - AI/AO ranges from the `signal` choice.
- **Tests (`library/control.test.ts`, 25):**
  - every parameter combination re-registers under a host ID, which runs every registration rule, and has its terminals inside its bounds;
  - channel ports and templates;
  - the opt-in boundary and the reserved prefix;
  - accepted and refused wiring;
  - tag suggestions.
