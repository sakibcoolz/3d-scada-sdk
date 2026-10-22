# Industrial Scene Document: Specification (schema version 4)

Status: **Implemented** in `@sakibcoolz/core` (T-068, ADR-0021); JSON Schema published (T-069).
Sections marked **PLANNED** describe later M9 phases (docs/INDUSTRIAL_SDK_PLAN.md) and are not implemented.

A scene file is **one versioned JSON document** that holds the engineering configuration of a plant:
- what equipment exists and where;
- how it is connected;
- which host tags drive which values;
- identity and metadata.

It **never** holds live measurements, credentials or executable code. Live values arrive separately as observations (ADR-0003, ARCHITECTURE §4).

## 1. Identification
| Field | Value |
|---|---|
| `schemaVersion` | `4` (integer, `SCENE_SCHEMA_VERSION`) |
| `documentType` | `"industrial.scene"` (`SCENE_DOCUMENT_TYPE`) |
| Media type / extension | `application/json`, `*.scene.json` recommended |
| Encoding | UTF-8 JSON (RFC 8259) |
| JSON Schema | `@sakibcoolz/core/schema/industrial-scene.v4.schema.json` (draft 2020-12, `$id` `urn:sakibcoolz:3d-scada-sdk:industrial-scene:4`) |
| Authoritative validator | `validateScene` / `parseScene` in `@sakibcoolz/core`. It runs in plain Node or the browser, with no renderer and no dependencies. |

## 2. Coordinates and units
- Right-handed, Y-up. Lengths are metres (`units: "m"`, the only accepted value).
- Positions are world space.
- Rotations are unit quaternions `{x, y, z, w}`, length 1 within 1e-6, never renormalised.
- Scales are positive. Components with ports must keep scale `{1, 1, 1}` (ADR-0004).

## 3. Root object
| Field | Required | Type | Notes |
|---|---|---|---|
| `schemaVersion` | yes | `4` | |
| `documentType` | yes | `"industrial.scene"` | |
| `units` | yes | `"m"` | |
| `project` | no | object | `{id?, name?, revision?, description?}`, all strings (id ≤ 128, text 1–1024 characters) |
| `components` | yes | array (≤ 10,000) | §4 |
| `connections` | yes | array (≤ 20,000) | §5 |
| `tagBindings` | no | array (≤ 20,000) | §6 |
| `underlay` | no | object | §7 |
| `extensions` | no | object | §8 |

Unknown fields are rejected (`UNKNOWN_FIELD`), never dropped.

## 4. Components
| Field | Required | Type | Notes |
|---|---|---|---|
| `id` | yes | string, 1–128 | stable key, unique in the document, never renumbered |
| `name` | no | string, 1–1024 | display name |
| `type` | yes | component kind | one of the built-in kinds today: `tank, conicalTank, horizontalTank, sphericalTank, pool, pipe, elbow, tee, valve, reducer, coupler, pump, sensor, motor`. **PLANNED (Phase 2, new ADR):** namespaced type IDs from an open registry. |
| `typeVersion` | no | string | version of the definition the instance was authored against |
| `manufacturer`, `model` | no | string | equipment identity |
| `parentId` | no | id | assembly parent (ADR-0008); no cycles |
| `position` | yes | `{x, y, z}` | metres |
| `rotation` | yes | `{x, y, z, w}` | unit quaternion |
| `scale` | yes | `{x, y, z}` | positive |
| `properties` | yes | object (≤ 64) | engineering and display properties: string (≤ 1024 characters), finite number, or boolean. Names and ranges are checked by the component definition (`validateProperties`, `INVALID_PROPERTY`). |
| `labels` | no | object (≤ 64) | identification tags such as asset number, area or maintenance class. String values; names 1–128 characters; no credential-like names. |
| `extensions` | no | object | §8 |

Ports are **not** stored in the file. They come from the component definition through the host's `resolvePorts`, so geometry upgrades never edit topology (ADR-0002, ADR-0014).

## 5. Connections
`{ id, from: { instanceId, portId }, to: { instanceId, portId } }`
- Each connection joins two existing ports on two different components.
- The ports must be compatible: same kind, and the same nominal size within 0.1 mm.
- Each port takes one connection. Duplicate edges in either direction are rejected.
- Routes between ports are derived and never saved.
- **PLANNED (Phases 3–4, new ADRs):**
  - a `domain` field (fluid, mechanical, power, signal, network, logical) and a `relationship` field;
  - edge `properties`;
  - association edges without ports;
  - `maxConnections` per port.

## 6. Tag bindings
Two shapes (ADR-0006):
- `{ id, tagId, kind: "property", instanceId, property, unit? }` drives a bindable component property, such as a tank's `level` or a valve's `open`.
- `{ id, tagId, kind: "flow", connectionId, unit? }` drives the flow on a connection.

Rules:
- `tagId` is the ID observations carry.
- A unit must be accepted for the property's quantity.
- One binding per target.
- Bindings to a removed component or connection are dropped by the graph helpers.

**PLANNED (Phase 5, new ADR):** `runtimeVariables` (data type, access, scaling, source device and variable, typed protocol addresses) and `dataSources` (credential *references* only). Existing bindings stay valid.

## 7. Underlay
`{ svg, position: { x, z }, width, rotation, opacity }` (ADR-0012):
- `svg` is sanitized markup of at most 512 KiB UTF-8;
- `width` is in metres, above 0 and at most 1000;
- `rotation` is in degrees about +Y;
- `opacity` is 0 to 1.

The underlay is display only. Hosts sanitize the SVG through `validateUnderlay` (`INVALID_UNDERLAY`).

## 8. Extensions
Root and component `extensions` hold host or library data:
- **Keys:** reverse-DNS namespaces, such as `"com.example.app"`.
- **Values:** plain JSON (null, boolean, finite number, string of at most 1024 characters, array, object).
- **Limits:** at most 16 levels deep and 10,000 values per document.
- **Rejected keys:** `__proto__`, `constructor` and `prototype`, at any depth.
- **Handling:** core preserves extensions exactly, with sorted keys, and never interprets them.

## 9. Credentials and safety
- **No secrets in documents.** A label or extension key that names a credential is rejected with `SECRET_FIELD`. That covers password, passwd, pwd, secret, credential, API key and private key, matched after removing `-`, `_`, `.` and spaces, and any name ending in "token".
  - Store a *reference* that the host resolves instead, for example `endpointRef: "host:gateway-3/vfd-101"`.
- **No live values, no code.** Documents never contain executable content. Geometry builders and plugins are registered by the host at runtime, never loaded from JSON.
- **Software validation is an engineering aid.** It does not verify physical wiring, safe operating limits or functional safety.
- **Read-only.** The SDK never writes to devices (ADR-0003).

## 10. Canonical serialization
`serializeScene` writes one canonical form, so save → load → save is byte-identical:
- two-space indent and a trailing newline;
- root key order: `schemaVersion, documentType, units, project?, components, connections, tagBindings?, underlay?, extensions?`;
- component key order: `id, name?, type, typeVersion?, manufacturer?, model?, parentId?, position, rotation, scale, properties, labels?, extensions?`;
- vectors in `x, y, z(, w)` order; `-0` written as `0`;
- keys of `properties`, `labels` and `extensions` sorted at every level; array order preserved;
- only authored fields are written.

## 11. Versioning and migration
| Input | Read as | Result |
|---|---|---|
| `version: 1` (`kind`, Euler XYZ radians, no scale) | v1 rules | migrated, `migratedFrom: 1` |
| `schemaVersion: 2` (array vectors) | v2 rules | migrated, `migratedFrom: 2` |
| `schemaVersion: 3` (named vectors, `parentId`, `underlay`) | v3 rules | migrated losslessly, `migratedFrom: 3` |
| `schemaVersion: 4` | v4 rules, `documentType` required | current, no `migratedFrom` |
| anything else | newest rules | `UNSUPPORTED_VERSION` |

- Saving always writes version 4. SDK 0.1.x cannot open version 4 files (ADR-0021, release 0.2.0).
- A version-3 file using a version-4 field is rejected (`UNKNOWN_FIELD`): fields are never guessed.
- **Separate from schema migration:** catalog geometry changes are handled by `upgradeDimensions`, which re-seats parts after dimension changes and never edits connections (ADR-0014).

## 12. Limits (`defaultSceneLimits`)
| Limit | Default |
|---|---|
| components / connections / bindings | 10,000 / 20,000 / 20,000 |
| ID length | 128 |
| properties or labels per component | 64 |
| string length | 1024 characters |
| underlay | 512 KiB |
| extensions | depth 16, 10,000 values per document |
| `parseScene` text | 10,000,000 characters |

Hosts may change the limits through `validateScene`'s `limits` option. The JSON Schema describes the defaults.

## 13. Error codes
- **Structure:**
  - `NOT_AN_OBJECT`, `INVALID_JSON`;
  - `UNSUPPORTED_VERSION`;
  - `INVALID_FIELD`, `UNKNOWN_FIELD`, `LIMIT_EXCEEDED`;
  - `SECRET_FIELD`.
- **Components:**
  - `UNKNOWN_COMPONENT_KIND`, `DUPLICATE_COMPONENT_ID`;
  - `UNSUPPORTED_SCALE`, `INVALID_PROPERTY`;
  - `UNKNOWN_PARENT`, `PARENT_CYCLE`.
- **Connections:**
  - `DUPLICATE_CONNECTION_ID`;
  - `UNKNOWN_INSTANCE`, `UNKNOWN_PORT`;
  - `SELF_CONNECTION`, `INCOMPATIBLE_PORTS`, `PORT_OCCUPIED`, `DUPLICATE_EDGE`.
- **Bindings:**
  - `UNKNOWN_CONNECTION`, `UNBINDABLE_PROPERTY`, `INVALID_UNIT`;
  - `DUPLICATE_BINDING_ID`, `DUPLICATE_BINDING_TARGET`.
- **Underlay:** `INVALID_UNDERLAY`.

Every error has `{ code, path, message }`. The path uses the input's own field names, for example `connections[2].to.instanceId`. All errors are reported, in input order, and the input is never repaired.

## 14. JSON Schema boundary
- **The guarantee:** the published schema accepts everything `validateScene` accepts with the default limits. This is proven by `packages/core/src/schema.test.ts` on every example and on 1500 seeded mutations.
- **Validator-only checks** (the schema passes them through):
  - unit-length rotations;
  - references between components, ports, connections and bindings;
  - port compatibility and occupancy;
  - the scale policy and assembly cycles;
  - units per quantity;
  - credential-like key names;
  - extension depth and value budgets.
- **Examples:** in `schema/fixtures/valid`, `invalid` and `validator-only`, each with its expected error.

## 15. Example
```json
{
  "schemaVersion": 4,
  "documentType": "industrial.scene",
  "units": "m",
  "project": { "id": "plant-7", "name": "Milk line 2", "revision": "12" },
  "components": [
    {
      "id": "T-101",
      "name": "Raw milk tank",
      "type": "tank",
      "manufacturer": "ACME",
      "model": "RT-10",
      "position": { "x": 0, "y": 2.335, "z": 0 },
      "rotation": { "x": 0, "y": 0, "z": 0, "w": 1 },
      "scale": { "x": 1, "y": 1, "z": 1 },
      "properties": { "level": 60 },
      "labels": { "area": "Hall B", "assetNumber": "A-00412" }
    }
  ],
  "connections": [],
  "tagBindings": [{ "id": "b1", "tagId": "LT-101", "kind": "property", "instanceId": "T-101", "property": "level", "unit": "%" }],
  "extensions": { "com.example.maintenance": { "intervalDays": 90 } }
}
```

## 16. Portability and assets
- **Today:** a scene is a single JSON file. The only embedded asset is the sanitized SVG underlay.
- **PLANNED (with the glTF importer, T-020):**
  - Root `assets[]` with `{id, uri, sha256, bytes}`. Binary files stay outside the JSON.
  - Hosts load assets only from an allow-list.
  - An optional package layout (`scene.json` plus `assets/`) is documented, not required.
