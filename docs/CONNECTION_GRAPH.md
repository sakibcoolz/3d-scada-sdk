# Connection graph: domains, relationships and traversal

Status: **Implemented** in `@sakibcoolz/core` (T-073..T-076, ADR-0023).

This document replaces the graph parts of SCENE_AND_CONNECTIONS.md for typed ports, wired connections, associations and queries. Snapping and routing stay in SCENE_AND_CONNECTIONS.

> **Safety.** Every check here is an engineering aid on the model a host describes. It never verifies physical wiring, protective earth, cable sizing or functional safety. The SDK never writes to devices (ADR-0003).

## 1. Two kinds of edge
| Edge | Stored in | Joins | Drawn | Routed / simulated |
|---|---|---|---|---|
| **Connection** | `connections` | a port to a port | fluid and mechanical: pipe or joint; power, signal, network: straight line coloured by domain | fluid and mechanical only |
| **Association** | `associations` | a component to a component, no ports | never | never |

- Connection and association IDs share one namespace.
- Ports are never stored in files; they come from component definitions (ADR-0002).

## 2. Port domains
A port's `kind` is its domain: `fluid`, `mechanical`, `power`, `signal` or `network`. `electrical` is deprecated and compatible only with itself.

Optional details:
- `name`;
- `terminal`, such as `X1:3`;
- `flow` (`in`, `out` or `bidirectional`), which is not the 3D normal;
- `signal {type DI/DO/AI/AO, range, unit}`;
- `power {kind AC/DC/PE, voltage, phases}`;
- `network {medium, protocols}`;
- `maxConnections`: default 1; fluid ports always take 1.

`createComponentRegistry` refuses details that do not fit the port.

## 3. Compatibility (`checkPorts`)
| Domain | Compatible when |
|---|---|
| any | the same domain; nominal sizes within 0.1 mm when both give one |
| signal | one output to one input (DO→DI, AO→AI); never two outputs or two inputs; analog ranges and units equal when both are given |
| power | same kind, voltage and phases when given; PE only to PE; never two `out` ports |
| network | same medium; a shared protocol when both list protocols |

- Missing details never fail a check.
- A failure is `INCOMPATIBLE_PORTS`, with the rule in the message.
- A port refuses connections beyond `maxConnections` (`PORT_OCCUPIED`).
- Snapping, touching and attach use only ports that mate physically (`matesPhysically`: fluid, mechanical and `electrical`).

## 4. Connection fields
`{ id, domain?, relationship?, from, to, properties? }`
- `domain`: when present, it must match the ports. Otherwise it is derived from them and never written into the file.
- `relationship`: a built-in name (`controls, drives, measures, feeds, communicates, wired, associated`) or a namespaced host name (`com.example.supervises`).
- `properties`: edge data such as cable type or length. Credential-like names are rejected.

## 5. Associations
`{ id, relationship, from, to, properties? }`, where `from` and `to` are component IDs.
- **Directed:** the same `(from, to, relationship)` twice is `DUPLICATE_EDGE`; the reverse direction is a different fact.
- **References:** both ends must exist and differ.
- **Removal:** removing a component removes its associations.
- **Helpers:** `addAssociation` and `removeAssociation`. The list is left out of the file when it is empty.

## 6. Queries
Every query is pure, deterministic (scene order, breadth first) and derived **only from explicit edges**. Nothing is inferred from names.

| Function | Returns |
|---|---|
| `neighbours(scene, id, filter?)` | components one followed edge away, each once |
| `relatedComponents(scene, id, filter?)` | everything reachable, breadth first, excluding `id` |
| `pathBetween(scene, a, b, filter?)` | the shortest chain of `GraphStep`s (`edge`, `id`, `from`, `to`, `forward`, `domain?`, `relationship?`), `[]` for `a === b`, or undefined |

`GraphFilter` fields:
- `domains` (associations have no domain, so they are skipped when this is set);
- `relationships`;
- `connections` and `associations` (both default true);
- `direction`: `out`, `in` or `both`;
- `resolvePorts`, which places a connection without a `domain` field in its port's domain. Without it, such connections match no domain filter.

```ts
relatedComponents(scene, 'PLC-01', { relationships: ['controls', 'drives'], direction: 'out' }); // ['VFD-101', 'M-101']
pathBetween(scene, 'M-101', 'PLC-01', { domains: ['power', 'signal'], resolvePorts });          // power edge, then signal edge
neighbours(scene, 'PLC-01', { domains: ['network'], resolvePorts });                           // ['SW-1']
```

**Older helpers:**
- `connectionsOf`, `reachableComponents` and `connectedGroups` keep their results and never follow associations.
- They take an optional `{ domains, resolvePorts }` filter.
- `lockConnectedAsChildren(scene, id, { resolvePorts })` locks only physically joined parts (`physicalDomains`), so a cable does not bolt two parts together. The editor passes its registry.

## 7. Tests
- `port-domains.test.ts`: the rule table and capacity.
- `connection-fields.test.ts`: connection fields, saving and routing.
- `associations.test.ts`: associations.
- `graph-queries.test.ts`: the acceptance scenes (PLC → VFD → Motor → pump, a PLC on Ethernet with an HMI and a VFD, a 4–20 mA transmitter into a PLC AI).
- `registry.test.ts`: the metadata rules.
- The consumer `node-check.mjs` repeats the PLC → VFD → Motor chain through the packed packages.
