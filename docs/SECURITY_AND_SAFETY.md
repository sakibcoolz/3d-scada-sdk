# Security, OT boundary and safety

## Scope statement
The SDK is visualization and editor software. It is **not** certified for IEC 62443, functional safety or unattended industrial control. No certification may be claimed based on architecture docs alone.

## Trust boundaries
Browser SDK <-> host application <-> telemetry service <-> edge/PLC are distinct zones. The SDK should consume least-privilege, read-only, quality-tagged observations by default. Never embed PLC secrets, admin tokens, hard-coded device IPs or control credentials in front-end bundles.

## Requirements
- Validate scene JSON and imported metadata before instantiating content; size/depth/count limits prevent UI denial-of-service.
- Sanitize untrusted labels; use safe framework text rendering; do not execute embedded scene scripts.
- Remote glTF/assets require explicit allowlist/caching and license review; reject unsafe URLs where applicable.
- Connectors implement auth/TLS, authorization and reconnection policies in host systems; provide stale/unavailable states, not misleading healthy values.
- Reject out-of-order timestamps per tag quality policy; display source timestamp; never treat simulation as live.
- Use appropriate CSP and dependency audit for host deployment; no privileged access from renderer.
- A future command/write feature requires a separate approved ADR, threat model, RBAC, audit logs, confirmation, safety interlocks and OT-owner review before implementation.
- Never bypass PLC permissives, E-stop, hardware protection or physical safety authority from cloud/UI.
- Include vulnerability disclosure and licensing review before external package publication.

## Threat model starter
Assets: operational state, layout IP, credentials, availability. Threats: malicious scene payload, asset URL exfiltration, XSS, stale readings, unauthorized writes, package compromise and browser exhaustion. Mitigations: schema validation, restrictive fetch, no command API, signed releases, review and tests.

## Agent stop condition
If requirements imply real actuator commands, emergency switching, disabling alarms, or using an unverified process value for safety actions, stop and seek a documented architectural/safety review.

## Port compatibility checks (ADR-0023)
- `checkPorts` and validation compare the port details a host describes: signal direction and range, power kind, voltage and phases, network medium and protocols.
- They are an engineering aid. They never verify physical wiring, protective earth, cable sizing or functional safety, and the SDK never claims they do.

## Acquisition descriptions (ADR-0024)
- Data sources hold an opaque `endpointRef`, never credentials. A URL with user info is rejected, as are credential-like keys in source properties and custom addresses.
- Runtime variables are read-only (`access: "read"`). No document can claim a writable tag before an approved command boundary (D5).
- The SDK describes acquisition and never performs it: no connections, polling or writes.

## Host and edge contracts (ADR-0029)
- **Typed observations:** a value that does not fit its tag's declared data type, or a gateway that reports another type, is shown as unknown (`INVALID_VALUE`, `TYPE_MISMATCH`), never as a value.
- **Transport examples (T-094):** host code in `examples/transports/`, not part of any package.
  - They refuse URLs with credentials, validate every message's shape, drop messages over a size limit, and never send on a socket.
  - While a link is down they mark its tags `DISCONNECTED`, never leaving the last value shown as current.
- **Command requests (T-093):** describe-only plus a confirmed host callback. The SDK still has no device write method, holds no credentials, and opens no connection; a test checks that the command modules contain no network or write call.
  - **When offered:** only in `ScadaRuntime`, only when the host passes `onCommandRequest`, and only for a digest-pinned document. Each request names the approved revision and digest.
  - **Limits:**
    - writable variables must have bounded numeric limits within their data type, or be on/off; text cannot be commanded;
    - the gateway gets the limits in the projection and must enforce them itself. The SDK's check is a convenience, not the protection.
  - **Refused** while the variable's reading is unknown (disconnected, stale, bad, missing, mistyped) or telemetry is simulated, and re-checked at the moment of sending.
  - **Sending:**
    - every request needs a form and a confirmation. Cancel has focus at confirmation, so a stray Enter sends nothing;
    - the same variable rests 2 s after a send;
    - there are no retries, queues or batches, and no keyboard shortcut sends.
  - **No optimistic display:** the shown value changes only when telemetry reports it.
  - **The confirmation states** that the host's authorization and the controller's interlocks decide whether anything happens. Authorization, audit and the write itself are the host's.

## Runtime mode and approved revisions (ADR-0028)
- **No edit path:** `ScadaRuntime` is built from the viewer and the 2D views only. It cannot reach the editor, the history, the tag editor, keyboard moves or the workspace, which `runtime.test.ts` checks over the import graph.
- **Pinned documents:** it shows a document only when it is valid and matches the host's approval record: the exact `project.revision`, and `sceneDigest` (SHA-256 of the canonical serialization, FIPS 180-4, implemented in core and tested against the standard vectors and Node's own SHA-256).
- **Integrity, not authenticity:** the digest proves the runtime shows exactly the approved document, not who approved it. Signing approval records, access control and roles remain the host's.
- **Not a security boundary:** a browser user can still change what the host sends. The guarantee is that the SDK itself never changes the document.
- **Alarms (T-091):** host-supplied and display only. The SDK never evaluates limits, raises, clears or acknowledges an alarm. There is no acknowledge control: that would be a command (Phase 10, D5).
  - Host alarm data is untrusted: odd entries are skipped, an unrecognised severity is shown as critical, and an alarm that matches no equipment is still listed.
  - Status colour is never the only cue: alarms have a severity letter badge and text, and unknown values a dashed outline and text.
  - Unknown always outranks ok, so a simulated value never hides an unknown measured one; simulated values are labelled SIMULATED.
  - Blinking is limited to unacknowledged alarms, at 1 Hz, and is off under `prefers-reduced-motion`.

## Scale limits (T-095, owner-approved 2026-10-23)
- **Parse cap 32 MB:** the default `parseScene` `maxLength` and the editor's `MAX_SCENE_FILE_BYTES`, raised from 10 MB.
  - Why: a document at every default count limit is about 16 MB and failed to load again.
  - A 16 MB document parses and validates in about 130 ms. Hosts may pass a lower `maxLength`.
- **Variable addresses:** each address has its own budget of 64 JSON values, separate from the document-wide 10,000-value extension budget. The total is therefore bounded by `maxVariables` × 64.

## M9 security review (T-096, 2026-10-23)
**Scope:**
- every surface added since 0.1: v4 sections, host types and symbols, 2D views, tag engine and Tags… dialog, the runtime pin, alarms, command requests and the transport examples;
- T-028's transport and SVG parts.

**Method:**
- an independent read-only review of the code;
- new seeded fuzzing;
- a regression test per finding. Each test was checked to fail on the unfixed code.

### New fuzzing
- **v4 documents:** the fuzz base now has writable variables with command limits, and the hostile values include `constructor`, `toString`, `__proto__` and `hasOwnProperty` as ids and names.
- **The runtime pin:** for 2,000 mutated documents, every accepted one has a stable digest across save and load, and no two different saved texts share one.
- **Hostile host data:** alarms and observations for `componentStatus`, `resolveTelemetry` and `resolveVariableValues` (1,000 rounds).
- **Command values:** 5,000 random inputs. Whatever is accepted is a plain decimal within the limits, on a step and of the type.
- **Tags… dialog:** 2,000 hostile forms. They never throw, and what is committed is exactly what validation keeps.
- **Host type registration:** 2,000 mutated definitions with a 2D symbol. Each either registers or fails with the listed problems.
- **Transport examples:** 3,000 hostile messages for `parseBatch`.
- **Extra seeds:** the registry fuzz and the core T-096 fuzz also passed with 10 extra seeds each, run once and not kept in the suite.

### Findings and fixes
| Finding | Effect | Fix |
|---|---|---|
| Bindable properties and units were looked up on plain objects, so `constructor`, `toString` or `__proto__` matched inherited values | **`validateScene` threw** on such a binding with a variable unit. Without one it validated, and then `resolveTelemetry` threw on the first observation, taking down the runtime | own-key lookups (`ownValue`); such bindings are `UNBINDABLE_PROPERTY` |
| The same flaw in the 2D view model: saved symbols, routes and port anchors | a component `constructor` was drawn at NaN, so the diagram was blank; an id `toString` with saved routes threw | own-key lookups; null-prototype anchor maps |
| A confirmation open while the approved document changed | a value checked against the old limits was sent under the new revision | re-checked against the current document at Send (`recheckCommand`); the panel is reset per digest |
| Alarm folding copied arrays per alarm (quadratic) | 40,000 alarms on one component took 4.2 s per evaluation, every second | linear folding; the unlinked list shows 100, then a count |
| Credential checks missed component properties, `passphrase`, `accessKey`, `auth`, endpoint refs with a leading space, and secret query parameters | such values validated and came out unchanged in `projectAcquisition` | wider `isSecretKey`; component properties checked; `endpointRef` trimmed, and secret-named parameters refused |
| An alarm message, id or command status that is an object | `String()` threw in `componentStatus`; React would throw on an object child | alarms normalised to plain text (`componentStatus`); host command status shown only with a known state (`hostCommandStatus`) |
| `null` in the `telemetry.observations` prop | `resolveTelemetry`/`resolveVariableValues` threw | non-objects skipped |
| `Number()` takes `0x10`, `0b11`, `0o7` | a hex value could be requested or saved as a limit | plain decimals only (`parseDecimal`), in the command dialog and the Tags… dialog |
| The step check's tolerance grew with the step count | half-steps were accepted beyond 5×10⁸ steps from `min` | fixed tolerance in steps |
| Host definitions: a non-object parameter, non-finite limits, a symbol with a bad size, or an array with its own `constructor` | `createComponentRegistry` threw a `TypeError` instead of listing problems | shape checks; `Array.from` in place of `.map` |
| Transport examples | the tag map was unbounded, and REST read the whole body before the size check | `maxTags` (50,000), with drops counted as `TOO_MANY_TAGS`; the body read stops at `maxMessageChars` |
| Clipboard copies | `labels` and `extensions` were shared with the original | deep copies |

### Checked and sound
- **SHA-256:** matches `node:crypto`, including padding edge lengths.
- **Digest canonicalization:** sorted keys, `-0` written as 0, and a lone surrogate distinct from U+FFFD.
- **The runtime pin:** `validateScene` returns a fresh copy, so mutating the input after approval changes nothing shown.
- **Command requests:** they need a digest pin, limits are required, and requests are refused on simulated or unknown readings.
- **No markup sinks:** there is no `dangerouslySetInnerHTML`. All host and document text renders as React text, and host SVG is reduced to path data, numbers and hex colours.
- **Prototype pollution:** guarded in `readJson`, `parseBatch` and the tag forms.
- **No network access** anywhere in the SDK.

### Open, not changed
- **The digest pins the document, not the component types.** A different host registry can change geometry, ports or symbols under the same digest, and `typeVersion` is not compared with the definition's `version`. A host should pin its registry version next to the digest; an SDK check needs a design decision.
- **Host type definitions are trusted host code:**
  - registration copies them only one level deep;
  - a parametric `build()` result is not validated.
- **No count limit on host alarms:** folding is linear and the list is capped on screen, but the count itself is unlimited.
- **Underlay provenance:** the source file name and hash are not recorded (part of T-028). Adding them is a schema change for a later task. The underlay's sanitizing and resource limits are as in "SVG underlays" below.
- **glTF import (T-020):** not built, so T-028 stays open for it.
- **Dependency audit:**
  - `pnpm audit --prod`: no known vulnerabilities.
  - Development only, never shipped: three moderate advisories, all in test tools. `vitest` 4.1.11 needs ≥ 4.1.12 (GHSA-qxg6-89mg-rqv8, GHSA-xp26-3454-mjgp), and `ajv` 8.17.1 needs ≥ 8.18.0 (GHSA-2g4f-4pwh-qvx6). The `ajv` advisory needs the `$data` option, which the tests do not use. Upgrading is proposed to the owner.

## Transport-independent SDK rule
The SDK must never require a WebSocket connection, broker, network endpoint, credentials or OPC UA service to initialize, edit or render a scene. Host applications own acquisition and network connections, while the SDK accepts optional validated read-only observations through a snapshot, push call or host-supplied provider. Test offline operation and prevent socket creation from SDK core/render/editor modules.

## MVP security record (T-023 part B, 2026-10-15)

### Untrusted input tests (`packages/core/src/security.test.ts`, `e2e/untrusted-text.spec.ts`)
- Seeded fuzzing: 3,000 mutated scene documents (hostile values and keys such as `__proto__`, `constructor`, BigInt, Symbol, functions, null-prototype objects, sparse arrays) and 2,000 corrupted scene texts. `validateScene`/`parseScene` must never throw, must return typed errors, and anything accepted must round-trip through `serializeScene` unchanged. 1,000 batches of malformed observations/readings through `resolveTelemetry` and `resolveFlow` must not throw.
- Prototype pollution checked at the document root, components, properties, endpoints and bindings.
- Limits: over-limit documents are rejected in under 200 ms; 100,000-deep nested JSON does not overflow the stack; the observation store stays bounded under a 50,000-tag flood.
- Browser: markup in imported ids, property strings and tag ids is rendered as text (no element injection, no script execution, no dialog).

### Defects found by fuzzing and fixed
| Defect | Impact | Fix |
|---|---|---|
| Sparse arrays (`[0, , 0, 1]`) passed tuple checks because `Array.prototype.every` skips holes; a NaN quaternion length passed the `> tolerance` test | invalid scene accepted, then failed to reload | index-by-index finite check; NaN-safe `!(… <= tolerance)` |
| `-0` accepted but written as `0` | accepted scene not byte-identical after reload | `-0` normalised to `0` on validation |
| Error messages used `JSON.stringify(value)` | `validateScene` threw on BigInt | non-throwing value describer |
| Unit lookup used `unit in table` | resolvers threw on null-prototype objects; inherited names could match | own string keys only (`Object.hasOwn`) |
| `Date.parse` on host timestamps | resolvers threw on a Symbol timestamp | non-strings are invalid timestamps |
| Store key built with `JSON.stringify` | store threw on a BigInt tag id | only string tag ids are stored |

### Dependency audit (`pnpm audit`, pnpm 9.15.4)
- Production dependencies (`pnpm audit --prod`): **no known vulnerabilities**.
- Development dependencies: 4 advisories, all through the test runner `vitest@3.2.7` (never shipped in the SDK): GHSA-82fw-gwwq-j7x9 (moderate, vitest/@vitest/mocker path traversal, fixed in ≥ 4.1.11), GHSA-5gmw-xhrv-c9v3 and GHSA-85c8-ppgw-ccpr (critical, tinypool prototype-pollution gadgets, fixed in ≥ 2.1.2). Exposure was limited to running tests on untrusted test code or configuration. **Resolved:** owner approved upgrading to `vitest@^4.1.11` (installed 4.1.11, the smallest release with the fix); `pnpm audit` now reports no known vulnerabilities for all dependencies.

### Licences (`pnpm licenses list --prod`, includes playground tooling)
MIT 111, ISC 8, Apache-2.0 5 (`@mediapipe/tasks-vision`, `baseline-browser-mapping`, `draco3d`, `hls.js`, `promise-worker-transferable`, all transitive via drei), BSD-3-Clause 3, CC-BY-4.0 1 (`caniuse-lite`, build-time browser data). No copyleft licences. No third-party 3D assets are bundled (all geometry is procedural).

## SVG underlays (T-019a, ADR-0012)
- Every SVG passes `sanitizeSvg`, an allow-list with no DOM and no entity expansion. It runs when the file is imported, when a scene file is loaded (`validateUnderlay`), and again before drawing.
- Rejected: scripts, event handlers, `href`/`src`, `url()`/`data:`/`javascript:`/`expression()` values, `image`/`use`/`foreignObject`/`iframe`/`object`/`embed`/animation elements, DOCTYPE and entity declarations, processing instructions, CDATA, malformed XML or path data. A forbidden element is rejected even inside a subtree that would be dropped.
- Limits: 512 KiB, 5,000 elements, nesting depth 32, 20,000 path commands. The sanitizer never throws (fuzz-tested).
- Stored markup is written by the SDK from the shape model only. The viewer paints it through an `<img>` (no script execution, no network) onto a texture.

