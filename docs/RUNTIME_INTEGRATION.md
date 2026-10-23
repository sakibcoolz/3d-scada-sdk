# Runtime integration (host guide)

How a host application connects the SDK to live plant data. This guide is host-neutral (decision D6): it names no host product, and the SDK ships no host-specific code. Decisions: ADR-0003, ADR-0024, ADR-0028 and ADR-0029.

> **Status:** draft.
> - T-092 and T-093 are in.
> - Transport examples are added in T-094.

## 1. Who does what
| | SDK (`@sakibcoolz/*`) | Host application |
|---|---|---|
| **Scene document** | validates (`validateScene`), serializes, digests (`sceneDigest`) | stores, versions, approves revisions, signs approval records |
| **Acquisition** | describes it (`projectAcquisition`): pure, no network | deploys the plan to its gateway; owns discovery, connections, credentials, polling and subscriptions, recovery and history |
| **Telemetry** | resolves observations against the scene: quality, freshness, units, data types | delivers observations (`DataProvider`, `setTagValues` or the `telemetry` prop) |
| **Alarms** | displays host alarms per component (`componentStatus`) | evaluates limits, raises, clears, shelves and acknowledges |
| **Commands** | describes writable variables, and raises a confirmed request | authorizes, audits, enforces limits, and writes; the controller's interlocks stay authoritative |

The SDK never opens a connection, holds a credential or writes to a device.

## 2. Approve, project, deploy
1. **Validate the engineer's export** with `validateScene` and the same component registry the editor used.
2. **Approve a revision:** set `project.revision`, record `sceneDigest(scene)`, and sign that record if you need authenticity.
3. **Project** with `projectAcquisition(scene)`. The plan gives:
   - `sourceRevision`;
   - the data sources, with `endpointRef` as an opaque reference, never a credential;
   - each sourced variable: `tagId`, `dataSourceId`, `dataType`, `unit`, `variable`, `address`, `scaling` and `access`.

   The plan has no geometry, views, bindings or variable labels. Deploy it with your own transport; the gateway resolves `endpointRef` to real endpoints and secrets.
4. **Show the approved document** in `ScadaRuntime` with `expected={{ revision, digest }}`. A different document is refused.

Golden examples of the plan are in `@sakibcoolz/core/schema/fixtures/projection/` (`acquisition.plan.json`, `control-line.plan.json`), next to the scenes they come from in `schema/fixtures/valid/`.

## 3. Observations
```ts
interface Observation {
  tagId: string;                         // the runtime variable's id
  value: number | boolean | string;
  quality: 'GOOD' | 'UNCERTAIN' | 'BAD' | 'STALE' | 'DISCONNECTED';
  sourceTimestamp: string;               // ISO 8601, when the value was observed at its source
  dataType?: DataType;                   // as the gateway read it (ADR-0029)
  unit?: string;                         // the value's unit; else the binding's, then the variable's
  source?: 'MEASURED' | 'SIMULATED';     // default MEASURED; the two are never mixed
}
```
- **Scaling is the gateway's job:**
  - send engineering values (for example 50 %, not raw 13824);
  - for a scaled variable, any finite number is accepted;
  - for an unscaled one, the value must fit the declared type: integers within the type's range, finite floats, booleans for `bool`.
- **Data types:**
  - a value that does not fit is unknown with reason `INVALID_VALUE`;
  - a stated `dataType` that differs from the variable's is unknown with reason `TYPE_MISMATCH`;
  - both are shown as unknown, never as a value.
- **A link that is down:** send its tags as `DISCONNECTED`. The last value is never shown as current.
- **Freshness:**
  - a value older than `staleAfterMs` (default 10 s) becomes `STALE`;
  - timestamps more than 5 s in the future are rejected;
  - re-send unchanged values periodically if you deliver changes only.
- **Unmatched tags:** tags the scene does not bind are reported in `unmatchedTagIds`, so a host can spot configuration drift.

## 4. Delivering observations
- **`telemetry={{ observations }}`:** for state the host already holds.
- **`telemetry={{ provider }}`:** a `DataProvider` with `getSnapshot()` and `subscribe(onObservations) → unsubscribe`. It is subscribed while mounted.
- **`ref.current.setTagValues(observations)`:** push from a host callback.

Newest per tag wins; older or unparseable timestamps lose. (T-094 adds REST, Server-Sent Events and WebSocket provider examples.)

## 5. Alarms
- **Pass `alarms`** (`AlarmState[]`) to `ScadaRuntime`, each with:
  - `id`, `severity` (`critical`, `high`, `medium` or `low`), `message` and `active`;
  - optionally `acknowledged` and `since`;
  - `componentId`, or a `tagId` that maps through bindings and variables.
- **Unmatched alarms** are listed as not linked to equipment.
- **The SDK does not:**
  - evaluate limits;
  - acknowledge: acknowledgement belongs to your alarm system, and the runtime shows what you send.

## 6. Command requests
- **Describe** what may be requested. In the document, a writable variable is:
  ```json
  { "id": "VFD-101.SPEED_SP", "componentId": "VFD-101", "dataType": "float32", "unit": "rpm",
    "access": "readWrite", "source": { "dataSourceId": "gw" },
    "command": { "min": 0, "max": 1500, "step": 10, "confirm": "The pump flow follows the speed." } }
  ```
  Numeric types need `min` and `max` within their data type, `bool` takes neither, and text cannot be writable. The projection gives your gateway the same limits; **enforce them there**.
- **Opt in:** `<ScadaRuntime expected={{ revision, digest }} onCommandRequest={…} commandStatus={…} />`.
  - Without the callback, or without a digest, no command control appears.
- **What the operator sees:**
  - the current value;
  - a form checked against the limits;
  - a confirmation stating that your authorization and the controller's interlocks decide.

  Requests are refused while the reading is unknown or values are simulated.
- **What you receive:** a `CommandRequest`, once per confirmation:
  `{ requestId, tagId, componentId?, dataType, value, unit?, current?, sceneRevision, sceneDigest, requestedAt }`.
  1. Check `sceneDigest` against the revision you deployed.
  2. Authorize the operator, and audit the request.
  3. Write through your gateway, with limit checks and interlocks.
  4. Answer through `commandStatus[requestId] = { state, message? }`.
- **What the SDK never does:**
  - write, retry, queue or batch;
  - treat the request as the new value. The display follows your telemetry, so report the result as an observation.
- **Request IDs:** unique within a runtime session (they do not rely on `crypto.randomUUID`, which needs HTTPS). Keep your own idempotency.

## 7. Testing without a plant
- Use `source: 'SIMULATED'` with `@sakibcoolz/simulation`, or a scripted feed. Simulated values are always labelled.
- `packages/core/src/projection.test.ts` shows a gateway stand-in that reads only the plan, applies scaling and reports types, driving the scene end to end.
