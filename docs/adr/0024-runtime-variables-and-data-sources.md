# ADR-0024: Runtime variables and data sources (tag engine)

Status: Accepted (owner, 2026-10-22: read-only access and a separate `reviewTags` explicitly approved); implemented in T-077..T-079. M9 Phase 5 of docs/INDUSTRIAL_SDK_PLAN.md (§5.3, §5.4, §8.2), tasks T-077..T-079.

## Context
Today a tag is an opaque string.
- `tagBindings[].tagId` links a host tag to a component property or a connection's flow (ADR-0006). The document cannot say:
  - what the tag *is*: its data type and unit;
  - where it comes from: which PLC, drive or gateway;
  - how to address it: an OPC UA node or a Modbus register.
- So every host re-describes its acquisition outside the scene, and nothing checks that a 4–20 mA level transmitter's tag is bound to a percentage and not to a valve's open state.

ADR-0023 gave the model typed ports and explicit links (PLC → VFD → Motor). This ADR gives it typed **variables** and **data sources**. The boundary stays as it is:
- the SDK **describes** acquisition;
- the host **performs** it (connectivity, credentials, polling, history);
- live values still arrive only as observations (ARCHITECTURE §4, ADR-0003).

## Decision

### 1. Data sources (root `dataSources`, optional)
```jsonc
{ "id": "ds-plc-01", "name": "Line 2 PLC", "protocol": "modbus-tcp", "deviceId": "PLC-01",
  "endpointRef": "host:gateway-3/plc-01", "properties": { "pollMs": 500 } }
```
- **`protocol`:** `opcua`, `modbus-tcp`, `modbus-rtu`, `host` (the host supplies values by tag ID with no address), or a namespaced custom protocol (`com.vendor.bus`).
- **`deviceId`:** optional. When present, it must name a component, which links the source to its equipment for graph queries and views.
- **`endpointRef`:** an **opaque host reference**, never an address with credentials.
  - Validation rejects a URL carrying user info (`scheme://user:pass@…`) with `SECRET_FIELD`.
  - Credential-like keys in `properties` are rejected, as everywhere (ADR-0021).
- **No secrets, no transport.** The SDK never opens a connection.

### 2. Runtime variables (root `runtimeVariables`, optional)
```jsonc
{ "id": "LT-101", "name": "Raw milk tank level", "componentId": "T-101", "dataType": "float32", "unit": "%",
  "access": "read",
  "source": { "dataSourceId": "ds-plc-01",
              "address": { "area": "holding", "address": 40, "unitId": 1, "byteOrder": "big", "wordOrder": "high-first" } },
  "scaling": { "kind": "linear", "rawMin": 0, "rawMax": 27648, "min": 0, "max": 100 } }
```
- **`id` is the tag ID** that observations and bindings carry. IDs are unique.
- **`dataType`:** `bool | int16 | uint16 | int32 | uint32 | float32 | float64 | string`.
- **`access`:** only `read` in this ADR.
  - `readWrite` waits for the command ADR (decision D5), which amends ADR-0003 under an approved safety-boundary design.
  - So no document can claim a writable tag before that boundary exists.
- **`componentId`:** optional; it must name a component. `unit` is a string of at most 32 characters.
- **`source`:** `{ dataSourceId, variable?, address? }`. The address is a **discriminated union on the data source's protocol**, never a loose string:

  | Protocol | `address` |
  |---|---|
  | `opcua` | `{ nodeId, namespaceUri? }` |
  | `modbus-tcp`, `modbus-rtu` | `{ area: coil \| discrete \| input \| holding, address 0–65535, unitId 0–255, byteOrder?, wordOrder?, bit? }` |
  | `host` | none: the variable is read by its tag ID, or by `variable` |
  | namespaced custom | plain JSON, checked only by the host's optional `validateAddress` |

- **Modbus checks** (definite errors):
  - `coil` and `discrete` hold only `bool`;
  - a register span (16 bits for 16-bit types, 2 registers for 32-bit types, 4 for `float64`) must fit below 65536;
  - `bit` (0–15) only for `bool` in a `holding` or `input` register;
  - `string` is not addressable in Modbus in this ADR.
- **`scaling`:** `{ kind: 'linear', rawMin, rawMax, min, max }`, with `rawMin ≠ rawMax`.
  - It **describes** how the host converts raw values. The SDK does not apply it to observations: observations arrive in engineering units, as today.

### 3. Bindings meet variables
- `tagBindings` are unchanged.
- When a binding's `tagId` names a runtime variable, validation also checks:
  - the variable's `dataType` fits the property's quantity (`bool` ↔ `boolean`; numeric types ↔ `percent`, `temperature`, `flow`; `string` binds to nothing);
  - the variable's unit is accepted for the quantity when the binding gives none (`INVALID_UNIT`).
- A binding to a tag with **no** variable stays valid: an opaque host tag, exactly as today.
  - So existing files keep working.
  - The review (§6) points such bindings out when a document defines variables.
- **Error codes:** existing codes where they fit (`INVALID_FIELD`, `UNKNOWN_INSTANCE`, `INVALID_UNIT`, `SECRET_FIELD`, `LIMIT_EXCEEDED`), plus new ones:
  - `DUPLICATE_VARIABLE_ID`, `UNKNOWN_DATA_SOURCE`, `DUPLICATE_DATA_SOURCE_ID`;
  - `INVALID_ADDRESS`: Modbus range or area/type mismatch;
  - `TYPE_MISMATCH`: a data type that cannot drive the bound property.

### 4. Quality `DISCONNECTED`
- `Quality` gains `DISCONNECTED`: the source link is down, which is different from a bad reading (plan §5.4).
- Telemetry and flow resolution treat it like `BAD`, with its own reason, `DISCONNECTED`. The viewer says "disconnected" and never shows the last value as current.
- `SIMULATED` stays a *source*, never a quality.

### 5. Acquisition projection (core, pure)
`projectAcquisition(scene)` returns `{ sourceRevision, dataSources, variables: [{ tagId, dataSourceId, dataType, unit?, variable?, address?, scaling?, access }] }`.
- No geometry, views or labels: it is exactly what a host's gateway configuration needs.
- The order is deterministic, and `sourceRevision` is `project.revision`.
- The host signs, approves and deploys it. The SDK never sends it anywhere.

### 6. Review and suggestions (core, pure; nothing is applied automatically)
- **`reviewTags(scene, options)`** returns findings, not errors:
  - components with bindable properties but no binding;
  - variables nothing binds to;
  - bindings to tags with no variable (when the document defines variables);
  - variables on one Modbus source and unit whose register spans overlap.

  `validateScene` stays errors-only; this ADR adds no warnings channel to it.
- **`suggestVariables(scene, registry)`** proposes variables and bindings from **variable templates** on component definitions.
  - `ComponentTypeDefinition.variables?: [{ name, dataType, unit?, property? }]`; Phase 6 libraries ship these for the PLC, VFD and sensors.
  - IDs are built as `<componentId>.<name>`.
  - It returns proposals as data. A host or the editor applies them only after the user confirms. Suggestions never guess from component names: they come from the definition and explicit graph edges only.

### 7. Scene file and versioning
- `dataSources` and `runtimeVariables` are new **optional v4 fields**. v4 is still unreleased (0.2.0, D7), so there is no version bump. The fallback is the same as in ADR-0023: if 0.2.0 ships first, they become version 5.
- **Canonical order:**
  - root: `… connections, associations?, dataSources?, runtimeVariables?, tagBindings?, …`;
  - data source keys: `id, name?, protocol, deviceId?, endpointRef?, properties?`;
  - variable keys: `id, name?, componentId?, dataType, unit?, access, source?, scaling?`.
- **Limits:** at most 1,000 data sources and 20,000 variables.
- **JSON Schema:** updated, with fixtures, and the agreement fuzz is extended.

### 8. Not in this ADR
- writes and commands (D5: separate ADR);
- alarms, deadbands and history;
- aliases;
- OPC UA browsing;
- applying scaling;
- unit conversion beyond today's table;
- editor UI for variables (Phase 8);
- any transport, gateway or host-specific adapter (D6).

## Options considered
- **Addresses as strings** (`"40001"`, `"ns=2;s=Speed"`): rejected. They are ambiguous across vendors and cannot be validated. A typed union per protocol can be.
- **Allowing `readWrite` now, with no write path:** rejected. A document would claim writability that no reviewed boundary governs. It waits for the D5 ADR.
- **A warnings channel in `validateScene`:** rejected for now. It changes a result shape every host handles. Advisory findings live in `reviewTags`.
- **Applying scaling in the SDK:** rejected. The host's gateway owns raw values, and the SDK sees engineering values only. Doing it in both places risks double scaling.
- **Credentials in data sources, encrypted:** rejected. Documents never hold secrets, encrypted or not; `endpointRef` is resolved by the host.

## Consequences
- **Additive for files and hosts.** Every new field is optional, and bindings without variables behave as today.
- **TypeScript changes** (0.2.0 notes): `Quality` gains `DISCONNECTED`, and telemetry and flow reasons gain `DISCONNECTED`.
- **One description for both sides.** Hosts can generate gateway configuration from the same validated document the viewer draws, through `projectAcquisition`.

## Tasks and tests
- **T-077, data sources and variables (core):**
  - model, validation, Modbus and OPC UA address rules, `endpointRef` credential check;
  - canonical serialization, schema, fixtures, fuzz; spec section.
  - **Tests:** uniqueness, references, every address rule, data-type rules, the secret check, version 3 rejection, round trip.
- **T-078, bindings and quality:**
  - binding ↔ variable type and unit checks;
  - `DISCONNECTED` through telemetry, flow and the viewer;
  - `projectAcquisition`.
  - **Tests:** a type-mismatch matrix, units, a disconnected e2e, projection determinism, the consumer example.
- **T-079, review and suggestions:**
  - variable templates on definitions, `suggestVariables`, `reviewTags`.
  - **Tests:** components without tags, unbound variables, unknown tags, overlapping registers, and suggestions from templates that are never applied without confirmation.

## Implementation notes (T-077)
- **Model (`scene.ts`):**
  - `SceneDataSource`, `RuntimeVariable`, `ModbusAddress`, `OpcUaAddress` and `VariableAddress`;
  - `dataTypes`, `protocols` and `modbusAreas`;
  - optional `ScadaScene.dataSources` and `runtimeVariables`.
- **Validation:**
  - the sections are read in version 4 only;
  - an address is read as plain JSON, then checked against its data source's protocol once all sources are known;
  - new codes: `DUPLICATE_DATA_SOURCE_ID`, `DUPLICATE_VARIABLE_ID`, `UNKNOWN_DATA_SOURCE` and `INVALID_ADDRESS` (`TYPE_MISMATCH` arrives with T-078);
  - Modbus and OPC UA sources need an address; a `host` source takes none;
  - a namespaced protocol's address goes to the optional `validateAddress(protocol, address)`, and credential-like keys anywhere in it are rejected;
  - `endpointRef` values matching `scheme://…@` are `SECRET_FIELD`;
  - new limits `maxDataSources` (1,000) and `maxVariables` (20,000).
- **Serialization:** the order of §7. Address keys are sorted, like other plain JSON.
- **Removing a component** keeps its data sources and variables but drops their `deviceId` or `componentId`, so acquisition descriptions are never silently lost and the scene stays valid.
- **Copy and paste** do not copy variables, as with tag bindings: a copy must not show another part's live value.
- **Schema:**
  - `dataSources` and `runtimeVariables`, with `dataSource` and `runtimeVariable` definitions;
  - an address is any object in the schema, and checked by protocol in the validator;
  - new fixtures: `valid/acquisition`, `invalid/writable-variable`, `validator-only/modbus-coil-float`, `validator-only/endpoint-with-credentials` and `validator-only/unknown-data-source`;
  - the fuzz base carries a source and a variable, and the security fuzz knows the new codes.

## Implementation notes (T-078)
- **Bindings:** when a binding's `tagId` names a runtime variable, `checkBindings` refuses with `TYPE_MISMATCH` (at `tagBindings[i].tagId`) when:
  - a `string` tag drives anything;
  - a non-`bool` tag drives a boolean;
  - a `bool` tag drives a number.

  When the binding has no unit and the tag's unit is not accepted for the quantity, it is `INVALID_UNIT`. Without `resolveBindable`, only the `string` rule applies. Bindings to undescribed tags are unchanged.
- **Telemetry:** the unit used to convert an observation is the observation's, else the binding's, else the runtime variable's, else canonical.
- **`DISCONNECTED`:**
  - added to `Quality` and `qualities`;
  - `assessObservation` reports it after timestamp checks and like `BAD`;
  - `TelemetryUnknownReason` and `FlowUnknownReason` gain `DISCONNECTED`;
  - the viewer shows "unknown (disconnected)", with flows drawn in the bad-quality colour;
  - the playground demo feed offers it.
- **`projectAcquisition(scene)`:** `{ sourceRevision?, dataSources, variables }`. Only variables with a source are included, in scene order, as deep copies. There are no component links, names, geometry or views.
- **Consumer:** `node-check.mjs` projects a Modbus tag through the packed packages and checks that an endpoint with credentials is refused.

## Implementation notes (T-079)
- **Templates:**
  - `VariableTemplate {name, dataType, unit?, property?}` is in core; `ComponentDefinition.variables` is optional.
  - `createComponentRegistry` checks templates: name pattern, unique names, data type, unit length, and `property` must be bindable. It copies and freezes them.
  - `resolvers.resolveVariables` serves them. Built-in kinds have none yet; the Phase 6 libraries add them.
- **`suggestVariables(scene, { resolveVariables, resolveBindable? })`:**
  - proposes `<componentId>.<name>` read-only tags with no source, and `bind:<tagId>` property bindings for templates that drive a bindable, unbound property;
  - skips existing tags, bound properties and taken binding IDs, so suggesting twice proposes nothing new;
  - changes nothing.
- **`applyTagSuggestions(scene, picked, options)`** adds only the picked proposals and validates the result. It returns `{ ok: false, errors }` rather than an invalid document; this is the confirmation step's safe path.
- **`reviewTags(scene, { resolveBindable? })`** returns `TagFinding`s (`code`, `path`, `message`) in a fixed order: `UNBOUND_COMPONENT`, `UNUSED_VARIABLE`, `UNDESCRIBED_TAG` (only when the scene defines variables) and `OVERLAPPING_REGISTERS`.
  - Spans overlap when they share source, unit ID and area, unless both are different bits of one register.
- **Graph-edge suggestions** (for example a flow tag from a flow meter's connection) are not built. Suggestions use definitions only, which the ADR allows.
