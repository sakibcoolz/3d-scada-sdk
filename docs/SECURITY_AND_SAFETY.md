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

