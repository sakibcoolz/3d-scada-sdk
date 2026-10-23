# Transport examples (host code, not published)

Three ways for a host application to turn a live feed into a `DataProvider` for `ScadaRuntime`, `Scada3DViewer` or `Scada3DEditor`. They are worked examples, not SDK packages: copy the folder into your app and adapt it. They use browser APIs only and have no dependencies (ADR-0029 §4, T-094). The guide is [RUNTIME_INTEGRATION.md](../../docs/RUNTIME_INTEGRATION.md).

| File | Feed | Browser API |
|---|---|---|
| `rest.ts` | `createRestProvider({ url, intervalMs })`: GET on an interval | `fetch` |
| `sse.ts` | `createSseProvider({ url, event })`: one event per batch | `EventSource` |
| `websocket.ts` | `createWebSocketProvider({ url, protocols })`: one text message per batch | `WebSocket` |
| `link.ts` | shared: one link for all subscribers, reconnection, DISCONNECTED marking, statistics | `setTimeout` |
| `observations.ts` | shared: message validation and URL checks | — |

```tsx
import { createWebSocketProvider } from './transports/websocket';

const provider = createWebSocketProvider({ url: 'wss://gateway.example/telemetry', onStats: (s) => setLink(s) });
<ScadaRuntime scene={approved} expected={{ revision, digest }} telemetry={{ provider }} />
```

## Message format
Each poll response, event or message is JSON: an array of observations, or `{ "observations": [...] }`.
```json
[{ "tagId": "FT-101.PV", "value": 12.4, "quality": "GOOD", "sourceTimestamp": "2026-10-23T08:00:00.000Z", "unit": "m3/h" }]
```
- **The shape is checked here:** the fields are those of `Observation`, with no others.
- **Meaning is checked by the SDK:** timestamps, units and data types against the scene.
- **Anything that does not fit is dropped and counted** in `stats().dropped`, by reason: `TOO_LARGE`, `NOT_TEXT`, `NOT_JSON`, `NOT_A_BATCH` (whole message) or `INVALID_OBSERVATION` (one entry).

## Behaviour
- **One link for all subscribers:** it opens with the first subscriber and closes with the last.
- **When the link is down:**
  - every tag already shown is sent as `DISCONNECTED`, with its own last timestamp, so a value at least as new replaces the marker after reconnection;
  - the waits between attempts double from `initialDelayMs` (500 ms) up to `maxDelayMs` (30 s), each randomized in its upper half, so browsers do not reconnect in step after a gateway restart.
- **A link that is up but silent:** the SDK marks values `STALE` after `staleAfterMs`. Have the gateway re-send unchanged values periodically.
- **Refused URLs:** a URL with a user name or password, and one with the wrong protocol (`http:`/`https:` for REST and SSE, `ws:`/`wss:` for WebSocket). The check runs when the provider is created.
- **Authentication:**
  - use cookies;
  - for REST, a `fetch` wrapper that adds a header;
  - never a secret in the URL or the page source.
- **Read only:** nothing is ever sent on the WebSocket, and REST only uses GET. Command requests go through `onCommandRequest`, which your app handles (ADR-0029 §3).
- **SSE retry:** the browser's own EventSource retry is not used. On an error the stream is closed and the backoff applies, as for the other two.

## Tests
`transports.test.ts` runs in the root `pnpm test`:
- REST and SSE run against a Node `http` server on 127.0.0.1;
- WebSocket runs against a fake socket;
- nothing goes beyond loopback.
