# ADR-0029: Host and edge contracts, and the command-request boundary

Status: Accepted (owner, 2026-10-23: all four proposed decisions approved: refuse requests on an unknown reading and on simulated telemetry, commands only in a digest-pinned runtime, numeric commands bounded and no string commands, T-094 closes T-018 with REST/SSE/WebSocket examples); T-092..T-094 implemented. Amends ADR-0003 and ADR-0024 (read-only access). M9 Phase 10 of docs/INDUSTRIAL_SDK_PLAN.md (§8.2, decision D5), tasks T-092..T-094.

## Context
- **What exists:**
  - a host can project a scene's acquisition description (`projectAcquisition`, ADR-0024);
  - it can feed observations through `DataProvider` or `setTagValues`;
  - it can show an approved revision in the locked runtime with alarms and quality (ADR-0028).
- **Gaps the plan (§8.2) leaves for Phase 10:**
  1. **Normalized telemetry:** observations carry no data type, so a gateway that sends a string for a `float32` tag, or 70000 for an `int16`, is only caught when a unit conversion happens to fail.
  2. **Commands:** operators need to request a change (start a pump, change a setpoint). Decision D5 allows only this: the SDK *describes* writable variables and *raises a request* to the host after a confirmation. It never executes, retries or queues a write. ADR-0003 and AGENTS.md forbid any of it until a safety-boundary design is accepted; this ADR is that design.
  3. **Transport examples (T-018):** hosts have no worked example of turning a REST, Server-Sent Events or WebSocket feed into a `DataProvider`.
- **Constraints:**
  - no mandatory network in the SDK;
  - no new dependencies;
  - nothing host-specific (D6);
  - UI locks are not a security boundary.

## Decision

### 1. Normalized telemetry (T-092)
- **`Observation` gains an optional `dataType`** (one of `dataTypes`).
- **When the tag's runtime variable declares a `dataType`:**
  - an observation whose `dataType` differs is unknown with a new reason, `TYPE_MISMATCH`;
  - a value that does not fit the declared type is `INVALID_VALUE`:
    - `bool` needs a boolean;
    - integer types need an integer within range (for example `int16` is −32768..32767);
    - `float32`/`float64` need a finite number;
    - `string` needs a string (shown, never converted).
  - This check applies whether or not the observation states its type.
- **Unchanged:** without a runtime variable, observations behave as today.
- **`DISCONNECTED`, `STALE` and freshness rules** are unchanged (they already exist).
- **Projection fixtures:** golden `projectAcquisition` outputs for the control demo and a Modbus/OPC UA mixed fixture, checked byte for byte, so a host can rely on the shape.
- **Mock-gateway integration test:** projection → a fake gateway that reads only the plan → observations → `resolveTelemetry` → `componentStatus`. It shows end to end that nothing but the plan is needed and no geometry leaks.

### 2. Writable variables in the document (T-093)
- **`access: 'read' | 'readWrite'`** on runtime variables. `readWrite` requires a `command` block:
  ```ts
  command: {
    min?: number; max?: number;  // required for numeric types: unbounded setpoints are refused
    step?: number;               // optional granularity, > 0
    confirm?: string;            // optional extra text shown in the confirmation, plain text
  }
  ```
- **Validation:**
  - `readWrite` is allowed for `bool` and the numeric types only;
  - a `string` variable cannot be commanded;
  - numeric types need `min < max`, both within the type's range;
  - `step`, when given, must be positive;
  - `bool` takes no `min`/`max`;
  - a `readWrite` variable must have a `source` (something to write to), and the usual credential checks apply.
- **Schema:** stays v4. This is an additive widening of `access` plus an optional block; the JSON Schema and fixtures are updated. An older 0.1.x reader refuses such a document with its existing "writable variables wait for…" error, which is the safe direction.
- **`projectAcquisition`** carries `access` and `command` for each variable. The gateway gets the limits and **must enforce them itself**; the SDK's check is a convenience, not the protection.
- **The editor's Tags… dialog** can set access and limits, validated by core like every other field.

### 3. The command-request boundary (T-093)
- **Only in `ScadaRuntime`, and only when the host opts in with `onCommandRequest`:**
  - without that prop there is no command control anywhere, not even a disabled one;
  - the viewer, the editor and the 2D views never offer commands.
- **Only for a pinned document:** commands are offered only when `expected.digest` is given, so every request names the exact approved revision.
- **Flow:**
  1. The Information panel lists the selected component's writable variables, with a "Request change…" button each.
  2. A form takes the value (a number within `min`..`max` and on `step`, or on/off for `bool`), and refuses anything else with the reason.
  3. A confirmation dialog shows:
     - the variable and component;
     - the current value with its quality and time;
     - the requested value and unit, and the limits;
     - the host's `confirm` text;
     - this fixed sentence: **"This sends a request to the host application. It does not change the plant by itself: the host's authorization and the controller's interlocks decide whether anything happens."**
  4. Confirm calls `onCommandRequest(request)` once; Cancel or Escape sends nothing.
- **Request:**
  ```ts
  interface CommandRequest {
    requestId: string;            // unique per runtime session; the host owns idempotency
    tagId: string; componentId?: string;
    dataType: DataType; value: number | boolean; unit?: string;
    current?: { value: number | boolean; quality: Quality; sourceTimestamp: string };
    sceneRevision: string; sceneDigest: string;
    requestedAt: string;          // ISO 8601, the browser clock
  }
  ```
- **The SDK never:**
  - writes, retries, queues or batches;
  - shows the requested value as if it were current. The displayed value changes only when telemetry reports it;
  - sends a request without the confirmation step;
  - sends one from a keyboard shortcut alone.
- **Refused before the form opens:**
  - when the variable's current reading is unknown (disconnected, stale, bad, missing): the operator cannot see the state they would be changing;
  - when telemetry is SIMULATED: requests go to the plant, not to a simulator.

  The reason is shown in either case.
- **Host feedback, display only:** an optional `commandStatus?: Record<requestId, { state: 'pending' | 'accepted' | 'rejected' | 'completed' | 'failed'; message?: string }>` is shown beside the variable as given. The SDK draws no conclusion from it.
- **Rate limit:** one open request form at a time; after a confirm, the same variable's button is disabled for 2 s, to stop double sends from repeated clicks.
- **Import-graph test:** extended. The runtime still cannot reach any module that changes a scene; the command module is pure, plus the dialog.

### 4. Host transport examples (T-094, closes T-018)
- **`examples/transports/`:** plain TypeScript, **not published**, no dependencies. Three `DataProvider` factories using browser APIs only:
  - REST polling (`fetch` on an interval);
  - Server-Sent Events (`EventSource`);
  - WebSocket.
- **Each one:**
  - validates every message's shape and drops bad ones with a counted reason;
  - reconnects with capped backoff;
  - marks its tags `DISCONNECTED` while the link is down;
  - refuses URLs with credentials;
  - stops cleanly on unsubscribe.
- **Tests:** a Node `http` server (REST and SSE) and a fake `WebSocket` class. No network beyond loopback.
- **MQTT and OPC UA:** not given as code, because both need client libraries. `RUNTIME_INTEGRATION.md` explains that a host's gateway translates them into the normalized observation feed.
- **`docs/RUNTIME_INTEGRATION.md`** (new, host-neutral, D6):
  - approve → project → deploy;
  - observations and quality;
  - alarms;
  - the runtime pin;
  - command requests, and the host's duties (authorization, audit, limit enforcement, interlocks).

## Not in this ADR
- **Any write, execution, retry or queue in the SDK;** any protocol client.
- **Authorization, roles and audit trails:** the host's. The request carries what a host needs to audit.
- **Commands from the editor, the viewer or the 2D views.**
- **String or enumerated-value commands, multi-tag sequences, and recipes.** These would need their own ADR.
- **Alarm acknowledgement:** it would be a command too. It could follow the same boundary later, with its own ADR.

## Options considered
- **The SDK performs writes through a host-supplied writer function:** rejected. D5 is "describe plus host callback"; a writer in the SDK puts retries and timing in the SDK's hands.
- **Commands in the editor as well:** rejected. The editor shows drafts, and a request must name an approved revision.
- **Allow requests while the reading is unknown, with a warning:** rejected for now (owner may choose otherwise). It is the conservative default for a first boundary.
- **Schema v5 for `readWrite`:** rejected. The change is additive, and older readers already refuse it safely.
- **`crypto.randomUUID` for `requestId`:** not relied on, because it needs a secure origin. The ID is a session random prefix (`Math.random`) plus a counter; it is unique within the session, and the host owns idempotency.

## Consequences
- **Amends ADR-0003:** the SDK may now raise a *request*, still with no device write method and no credentials. ADR-0003's verification ("no device command methods or secrets in public API") still holds.
- **Amends ADR-0024:** `access` gains `readWrite` with mandatory limits.
- **Additive API:**
  - `Observation.dataType`, `TYPE_MISMATCH`;
  - `RuntimeVariable.command`;
  - `CommandRequest`, `onCommandRequest` and `commandStatus` on `ScadaRuntime`;
  - projection fields.
- **SECURITY_AND_SAFETY gains a command-boundary section,** and the UI copy says that host authorization and controller interlocks are authoritative.

## Tasks and tests
- **T-092, normalized telemetry and projection fixtures:**
  - `dataType` checks per type (ranges, integers, finite) and `TYPE_MISMATCH`;
  - golden projection fixtures;
  - the mock-gateway integration test;
  - first draft of RUNTIME_INTEGRATION.md.
- **T-093, writable variables and command requests:**
  - **schema and validation:** `readWrite`, `command` limits, string refused, unbounded refused; plus fixtures;
  - **projection:** carries the limits;
  - **Tags… dialog:** access and limits;
  - **runtime:** request form, confirmation, `onCommandRequest`, `commandStatus`, refusals (unknown reading, simulated, no digest, no callback), no optimistic display, rate limit;
  - **import-graph test:** extended;
  - **playground:** `?runtime` logs requests in a host-side panel and can answer with a status;
  - **e2e:**
    - no control without the callback;
    - out-of-range refused;
    - cancel sends nothing;
    - confirm sends exactly one request with the revision and digest;
    - the value does not change until telemetry does;
    - refused when disconnected or simulated.
- **T-094, transport examples (closes T-018):**
  - REST polling, SSE and WebSocket providers with tests against loopback and a fake socket;
  - RUNTIME_INTEGRATION.md completed;
  - T-018 marked DONE with T-094.

## Owner decisions (approved 2026-10-23, as proposed)
1. **Refusing requests when the current reading is unknown, and when telemetry is simulated** (proposed: refuse both).
2. **Requiring a digest-pinned runtime for commands** (proposed: yes).
3. **Numeric commands must have `min` and `max`; no string commands** (proposed: yes).
4. **T-094 closing T-018 with REST, SSE and WebSocket examples only** (proposed: yes; MQTT and OPC UA documented, not coded).

## Implementation notes (T-092)
- **`valueFitsDataType(value, dataType, scaled?)`** is exported from core; the T-093 command form reuses it.
- **A variable with `scaling` carries engineering values:**
  - any finite number fits, since the declared `dataType` describes the raw register;
  - without this rule, a scaled `int16` level of 55.3 % would be refused.
- **Where the check runs in `resolveTelemetry`:**
  - **property bindings:** the type check runs before unit conversion and quality, so a mistyped value is `TYPE_MISMATCH` or `INVALID_VALUE` even when its quality is also bad;
  - **flow bindings:** a mistyped value becomes a NaN rate, which `resolveFlow` already treats as invalid.
- **A tag without a runtime variable** is checked only against the type it states, if any. Without either, it behaves exactly as before.
- **Golden files:** `schema/fixtures/projection/{acquisition,control-line}.plan.json`, from the existing mixed Modbus/OPC UA fixture and a new `valid/control-line.scene.json`.
  - The new fixture covers Modbus RTU and TCP, a host source, coils, a register bit, a scaled `int16`, a string and an unsourced variable.
  - The playground's control demo uses `sdk.*` library types, which core's tests cannot load, so the new fixture stands in for it.
- **The mock gateway** in `projection.test.ts` receives the plan as JSON, applies scaling, and reports types and a down source.

## Implementation notes (T-093)
- **Core:**
  - `RuntimeVariable.access` is `'read' | 'readWrite'`, with the new `CommandLimits` type (`command?`);
  - `checkCommand` in validation enforces the §2 rules. Command errors use paths such as `command.max`, and the Tags… dialog maps them to their own fields (`commandMin` and so on), apart from scaling;
  - serialization keeps `min`, `max`, `step`, `confirm` order, and `projectAcquisition` carries `command`.
- **JSON Schema:** `access` becomes an enum, plus a `command` block and three `if`/`then` rules:
  - `readWrite` needs `command` and `source`, and is not `string`;
  - numeric types need `min` and `max`;
  - `bool` takes neither.

  Ajv strict mode required each `required` property to be declared in the same subschema. `min < max` and the type range stay validator-only.
- **Fixtures:**
  - the former `invalid/writable-variable` is now `invalid/writable-without-limits` (expected path `….command`);
  - new: `invalid/writable-string`, `invalid/command-zero-step`, `validator-only/command-max-below-min`, `validator-only/command-out-of-type-range` and `valid/commands.scene.json`.
- **Current values:** new `resolveVariableValues(scene, observations, options)` gives every runtime variable its latest trusted value, bound or not, with the same type, quality and freshness rules. A setpoint is usually not bound to a property, so the binding resolution cannot supply it.
- **React:**
  - `commands.ts` (pure): `writableVariables`, `commandAvailability`, `checkCommandValue`, `createCommandRequest`, `requestIds`, `COMMAND_NOTICE`;
  - `commandPanel.tsx`: the "Request changes" section and the dialog. The form step goes to Review; at the confirmation step, Cancel has focus, so a stray Enter never sends;
  - the reading is re-checked on Send, and nothing is sent if it became unknown;
  - the last request per tag lives in the runtime (`useCommandSession`), so it survives a change of selection;
  - a test checks that both modules contain no network, socket or write call.
- **Playground `?runtime`:**
  - VFD-101 gains `SPEED_SP` (0–1500 rpm, step 10) and `RUN_CMD`, fed by the demo feed;
  - a host-side panel records requests and answers them;
  - `&commands=off` drops the callback; `&pin=revision` approves without a digest.

## Implementation notes (T-094)
- **`examples/transports/`:** `rest.ts`, `sse.ts` and `websocket.ts` only open a link. The shared parts are in two files:
  - `link.ts`: one link for all subscribers, backoff, DISCONNECTED marking and statistics;
  - `observations.ts`: shape validation and URL checks.
  The folder is self-contained so it can be copied; a test checks its types against core.
- **DISCONNECTED markers keep each tag's last `sourceTimestamp`:**
  - the observation store lets ties replace, so the marker replaces the value;
  - a reconnected feed's value at least as new replaces the marker;
  - a marker stamped with the browser clock would have hidden unchanged values sent after reconnection.
- **Backoff is randomized in the upper half of each wait** (500 ms doubling to 30 s), so many operator browsers do not reconnect in step after a gateway restart.
- **SSE closes the EventSource on an error** instead of relying on the browser's own retry, so all three transports follow one backoff.
- **Shape is checked in the example, meaning in the SDK:**
  - unknown fields, a bad quality or a bad data type drop the entry;
  - timestamps, units and type fit are left to `resolveTelemetry`, which shows them as unknown with a reason.
- **Tests:**
  - REST and SSE against a Node `http` server on 127.0.0.1; Node 22 has no `EventSource`, so the test supplies a minimal one over `fetch`;
  - WebSocket against a fake socket, which also checks that nothing is sent.
- **T-018 is closed by T-094.** MQTT and OPC UA are documented as gateway translations in RUNTIME_INTEGRATION.md.
