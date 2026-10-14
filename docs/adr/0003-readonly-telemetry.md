# ADR-0003: Read-only telemetry for SDK MVP

Status: Accepted (architecture baseline)

## Context
Visualization and physical control have very different failure/safety profiles.

## Decision
SDK telemetry bindings expose observation data and status only; no embedded PLC write or control credentials. Any eventual command API is a separate, approved integration boundary.

## Consequences
Valve toggles in playground remain simulated presentation; cannot represent real equipment commands.

## Verification
No device command methods or secrets in public API; simulated quality/staleness tests.
