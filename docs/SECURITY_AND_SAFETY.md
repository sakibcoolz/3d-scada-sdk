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
