# ADR-0023: Port and connection domains

Status: Accepted (owner, 2026-10-22); T-073, T-074 and T-075 implemented, T-076 pending. M9 Phases 3–4 of docs/INDUSTRIAL_SDK_PLAN.md (§6), tasks T-073..T-076.

## Context
Every port today is a 3D flange: `ConnectionPort = {id, kind, position, direction, nominalSize?}` (`scene.ts:19`).
- `kind` already lists `fluid / electrical / signal / mechanical`, but every catalog port is `fluid`, and compatibility is only "same kind and same size" (`portsCompatible`, `scene.ts:140`).
- A port takes exactly one connection (`PORT_OCCUPIED`).
- A connection is `{id, from, to}` with required port ids. There is no domain, relationship or edge data.

With the open registry (ADR-0022), a host can now add a PLC, a VFD or a sensor, but cannot say that:
- a DO channel drives a DI;
- a 4–20 mA transmitter feeds an AI;
- a VFD output powers a motor;
- a PLC sits on an Ethernet network;
- a PLC *controls* a VFD as a fact, without drawing a wire.

Phases 5–8 (tags, libraries, 2D views, editor) all need this model.

## Decision

### 1. Port domains
- `ConnectionPort.kind` keeps its name; it is the port's **domain**. Renaming it to `domain` would break every host and resolver for no gain, since ports are never stored in files.
- **Values:** `fluid | mechanical | power | signal | network`.
  - `electrical` is **deprecated**. It keeps today's behaviour (compatible only with `electrical`). It is removed in a later major release. No built-in port uses it.
  - There is **no `logical` port**. Logical links are associations (§4), which need no port.
- `position` and `direction` stay **required** for every domain. For power, signal and network ports, they mark the terminal or socket on the equipment: where a wire or cable would attach in 3D, and where 2D views anchor. So routing, picking and rendering code keeps its types.

### 2. Optional port metadata
All new fields are optional, so every existing port and resolver is unchanged.

```ts
interface ConnectionPort {
  id: string;
  kind: PortKind;                       // the domain
  position: Vector3Tuple;
  direction: Vector3Tuple;              // 3D outward normal, as today
  nominalSize?: number;                 // fluid / mechanical, as today
  name?: string;                        // display name, e.g. "Run command"
  terminal?: string;                    // e.g. "X1:3", "DI0.3"
  flow?: 'in' | 'out' | 'bidirectional';// signal or energy direction; NOT the 3D normal
  signal?: { type: 'DI' | 'DO' | 'AI' | 'AO'; range?: [number, number]; unit?: string };
  power?: { kind: 'AC' | 'DC' | 'PE'; voltage?: number; phases?: 1 | 3 };
  network?: { medium: string; protocols?: string[] };  // e.g. 'ethernet', 'rs485'; 'modbus-tcp'
  maxConnections?: number;              // default 1, as today
}
```

- **`flow` vs `direction`:** `direction` stays the 3D outward normal. `flow` carries the signal or energy direction. For signal ports, `flow` follows from the type when absent (DO/AO → out, DI/AI → in).
- **Registration rules** (`createComponentRegistry`):
  - the domain-specific block must match the domain (no `signal` block on a power port);
  - `range` has min < max;
  - `maxConnections` is an integer ≥ 1;
  - fluid ports keep exactly 1, because routing, joints and simulation assume one pipe per flange.

### 3. Compatibility rule table
`portsCompatible(a, b)` becomes a rule table per domain and returns the reason on failure: `checkPorts(a, b): { ok: true } | { ok: false; reason: string }`.

**Missing metadata never fails a check**, the same way a missing `nominalSize` does today. So hosts can start with bare ports and add detail later.

| Domain | Compatible when |
|---|---|
| any | both ports have the same domain |
| fluid, mechanical | nominal sizes within 0.1 mm (today's rule) |
| signal | one output and one input (DO→DI or AO→AI); never two outputs; analog ranges and units equal when both are given |
| power | same `kind`; PE only to PE; voltage and phases equal when both are given; never two `out` ports |
| network | same medium; at least one shared protocol when both list protocols |

- Every failure stays `INCOMPATIBLE_PORTS`. The message names the rule, for example "an output cannot connect to an output" or "4–20 mA cannot connect to 0–10 V". This keeps the error-code list stable for hosts.
- **No warnings channel in this ADR.** Every rule above is a definite mismatch. Advisory checks (cable sizing, voltage drop) are out of scope.
- **Safety wording:** these are engineering-aid checks on the model the host describes. They never verify physical wiring, protective earth or functional safety. The docs and API comments state this (SECURITY_AND_SAFETY).

### 4. Connections and associations
**Physical connections** (`connections`, port to port):
- **New optional fields:**
  - `domain`: when present, it must equal both ports' domain (`INCOMPATIBLE_PORTS` otherwise). When absent, it is derived from the ports, and `serializeScene` does not add it.
  - `relationship` (§5).
  - `properties`: edge data such as cable type, cross-section or length. It uses the same value rules as component properties (string, finite number or boolean; at most 64; credential-like names are rejected).
- **`maxConnections`:** a port refuses a connection once it has `maxConnections` connections (`PORT_OCCUPIED`). The default is 1, so behaviour is unchanged for every existing port.
- **Physical mating** (snapping, touching, attach) stays limited to fluid and mechanical ports. Power, signal and network ports are joined by wires or cables, never by placing two parts against each other.
- **Routing and simulation** follow fluid connections only. `routeScene` returns no pipe route for other domains; the viewer draws them as thin straight lines, coloured by domain.

**Associations** (new optional root array `associations`, component to component):
```jsonc
{ "id": "a1", "relationship": "controls", "from": "PLC-01", "to": "VFD-101", "properties": { … } }
```
- An association records a logical fact, such as "PLC-01 controls VFD-101", with no port and no geometry. It is never drawn as wiring.
- **Why a separate array:** the plan proposed port-less edges inside `connections`. That would make `portId` optional on every connection, and react and simulation read `portId` in 58 places. A separate array keeps `SceneConnection` unchanged, so routing, joints, simulation and flow bindings stay correct by construction.
- **Rules:**
  - IDs are unique across connections and associations, so an ID always names one edge;
  - both ends exist and differ;
  - `relationship` is required;
  - associations are **directed**: an identical `(from, to, relationship)` repeat is `DUPLICATE_EDGE`, but the reverse direction is a separate fact;
  - removing a component removes its associations.
- **Flow tag bindings** still target connections only.

### 5. Relationships
- **Built-in vocabulary:** `controls | drives | measures | feeds | communicates | wired | associated`.
- **Host relationships:** namespaced, as with component types (`com.example.supervises`).
- A connection's `relationship` is optional; an association's is required.
- Core never infers a relationship from names. Every relationship comes from an explicit edge.

### 6. Graph queries (core, dependency-free)
- `neighbours(scene, id, filter?)`: components one edge away.
- `relatedComponents(scene, id, filter?)`: transitive closure.
- `pathBetween(scene, a, b, filter?)`: shortest path as a list of edges.
- **Filters:** `{ domains?, relationships?, associations?: boolean, direction?: 'out' | 'in' | 'both' }`. For example, Motor → VFD (power) → PLC (associated `controls`, followed backwards) is a filtered traversal over explicit edges only.
- **Existing helpers:**
  - `connectionsOf`, `reachableComponents` and `connectedGroups` keep their results for today's scenes.
  - They gain an optional domain filter.
  - They never follow associations unless asked.
- **New helpers:** `addAssociation` and `removeAssociation`, with the same result shape as `connect` and `disconnect`.

### 7. Scene file and versioning
- `connections[].domain`, `connections[].relationship`, `connections[].properties` and root `associations` are new **optional v4 fields**.
  - v4 has not been released yet (0.2.0, D7), so they join v4 with no version bump.
  - If 0.2.0 is published before this lands, they become schema version 5 instead, with lossless migration from 4, as ADR-0021 did.
- **Canonical serialization:**
  - connection key order: `id, domain?, relationship?, from, to, properties?`;
  - association key order: `id, relationship, from, to, properties?`;
  - root `associations` follows `connections`.
- **JSON Schema and spec:** updated, with fixtures and the agreement fuzz extended.
- **Not stored in files:** ports. They still come from definitions (ADR-0002).

### 8. Not in this ADR
- runtime variables, data sources and Modbus addresses (Phase 5);
- the built-in PLC, VFD and sensor library (Phase 6);
- 2D electrical and process views (Phase 7);
- editor UI for wiring, terminals and the relationship explorer (Phase 8);
- cable routing in 3D;
- warnings and advisory checks;
- any device write (ADR-0003).

## Options considered
- **Rename `kind` to `domain`.** Rejected: it would break every resolver and host for a name. The docs call `kind` "the port's domain".
- **Optional `position` for logical ports.** Rejected: every renderer, router and picker would need a guard. Logical links become associations instead.
- **Port-less associations inside `connections` (plan §6).** Rejected for the reason in §4.
- **Warnings for soft mismatches.** Deferred: every rule here is a definite mismatch. A warnings channel needs its own result-shape decision.
- **Open relationships with no vocabulary.** Rejected: 2D views and traversal need shared names. Namespacing still lets hosts extend the vocabulary.

## Consequences
- **Additive for hosts.** All new port and connection fields are optional, `kind` keeps its name, and the default `maxConnections` is 1. Today's scenes, resolvers and tests behave identically.
- **TypeScript change:** `PortKind` gains `power` and `network`. Code that switches exhaustively on it must handle them. This ships in 0.2.0 with the registry widening.
- **Viewer:** draws non-fluid connections as simple lines, so wiring is visible before the Phase 7 views. Joints, routing and simulation stay fluid-only.

## Tasks and tests
- **T-073, port domains (core and registry):**
  - the rule table, with a compatibility matrix test for every domain pair and the signal, power and network cases;
  - `maxConnections` (fan-out allowed, the limit refused, fluid fixed at 1);
  - registration rules for the metadata;
  - a regression check that every built-in fluid port behaves exactly as before.
- **T-074, connection fields:**
  - `domain`, `relationship` and `properties` on connections;
  - validation, canonical serialization, schema and fixtures, fuzz agreement;
  - routing and simulation ignore non-fluid edges;
  - the viewer draws them as lines.
- **T-075, associations:**
  - the root array, validation codes, `addAssociation` and `removeAssociation`;
  - removal with a component;
  - schema, fixtures and spec.
- **T-076, graph queries:**
  - `neighbours`, `relatedComponents` and `pathBetween` with filters;
  - acceptance scenes: PLC → VFD → Motor, PLC on an Ethernet network, a sensor's 4–20 mA output → a PLC AI;
  - a consumer example with host PLC and VFD types.

## Implementation notes (T-073)
- **Core (`scene.ts`):**
  - `PortKind` lists `fluid, mechanical, power, signal, network` plus the deprecated `electrical`;
  - `ConnectionPort` gains the optional `name`, `terminal`, `flow`, `signal`, `power`, `network` and `maxConnections`;
  - new exports `portKinds`, `signalTypes`, `powerKinds`, `checkPorts`, `matesPhysically` and `portCapacity`; `portsCompatible` is `checkPorts(a, b).ok`.
- **Rule table:** as in §3. The nominal-size rule still applies to any two ports that both give a size, as before.
- **Validation:** `INCOMPATIBLE_PORTS` messages now read "Incompatible ports: <rule>." `PORT_OCCUPIED` counts connections against `portCapacity`.
- **Physical mating:** snapping, touching and attach consider only `matesPhysically` ports (fluid, mechanical and the deprecated `electrical`), and count capacity the same way.
- **Gap found and fixed:** `GraphOptions` and `AttachOptions` did not declare `resolveType` (ADR-0022), so `connect` and `attachComponents` accepted host types only when the resolver object happened to carry it. Both now declare it.
- **Registry:** `createComponentRegistry` checks the port metadata rules of §2.
- **Not yet:** associations (T-075), graph queries (T-076).

## Implementation notes (T-074)
- **Model:** `SceneConnection` gains optional `domain` (a `PortKind`), `relationship` and `properties`. `relationshipKinds` and `isRelationship` are exported; a relationship is a built-in name or a namespaced host name.
- **Validation:**
  - the fields are accepted in version 4 only; in older versions they are `UNKNOWN_FIELD`;
  - an unknown domain or relationship is `INVALID_FIELD`;
  - properties follow the component property rules, and credential-like names are `SECRET_FIELD`;
  - a `domain` that differs from the ports' domain is `INCOMPATIBLE_PORTS` at `connections[i].domain`.
- **Serialization:** key order `id, domain?, relationship?, from, to, properties?`, with property keys sorted. Absent fields are never derived into the file.
- **Graph helpers:** `connect` stores the fields; copy and paste carry them to the pasted edge as independent copies.
- **Routing (refines §4):** `routeScene` gives no route to a connection whose ports do not mate physically (`matesPhysically` is false: power, signal, network). So pipes are drawn between fluid ports and, as before, mechanical and deprecated `electrical` ports, which keeps those unchanged. An unresolved endpoint still reports `UNRESOLVED`.
- **Simulation:** unchanged code. It follows fluid ports only, so a wired connection carries no liquid and reports a rate of 0. A test proves the pipe network is unaffected.
- **Viewer:** `WireLayer` draws each wired connection as a straight 2 px line from terminal to terminal (`wireSegments`), coloured power orange, signal blue, network green. Joints, open-joint checks and flow animation skip wired connections because they have no route.
- **Schema:** `connection` gains `domain`, `relationship` and `properties`. New fixtures: `invalid/unknown-relationship`, `validator-only/connection-domain-mismatch` and `validator-only/credential-in-connection`. The fuzz base edge carries all three fields.
- **Playground:** `?custom` also registers an example controller (`com.example.controller`) and drive (`com.example.drive`) with signal and network terminals.

## Implementation notes (T-075)
- **Model:** `SceneAssociation = {id, relationship, from, to, properties?}`, where `from` and `to` are component ids. `ScadaScene.associations` is optional and absent when there are none.
- **Validation:**
  - version 4 only; in older versions it is `UNKNOWN_FIELD`;
  - `relationship` is required (`INVALID_FIELD`);
  - properties follow the edge rules, so credential-like names are `SECRET_FIELD`;
  - IDs share the connections' namespace (`DUPLICATE_CONNECTION_ID`);
  - unknown ends are `UNKNOWN_INSTANCE`, a component linked to itself is `SELF_CONNECTION`, and an identical directed `(from, to, relationship)` is `DUPLICATE_EDGE`;
  - new limit `maxAssociations` (default 20,000), counted separately from connections.
- **Serialization:** `associations` follows `connections`; key order `id, relationship, from, to, properties?`.
- **Graph helpers:**
  - `addAssociation` validates like `connect`;
  - `removeAssociation` fails with `UNKNOWN_ASSOCIATION` for an unknown ID;
  - `removeComponent` drops the component's associations;
  - each drops the `associations` field when the list empties, so an add followed by a remove leaves the file byte-identical.
- **Clipboard:** associations whose both ends are copied are carried along with new IDs. `ComponentClipboard.associations` is optional.
- **Not drawn, routed or simulated.** The editor keeps them through import, delete, undo and export.
- **Schema:** root `associations` and an `association` definition, with shared `relationship` and `edgeProperties` definitions. New fixtures: `valid/associations`, `invalid/association-without-relationship`, `validator-only/association-unknown-component` and `validator-only/association-id-reuses-connection`. The fuzz base carries an association.
