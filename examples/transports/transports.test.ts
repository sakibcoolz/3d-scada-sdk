import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { connectProvider, createObservationStore, dataTypes as coreDataTypes, type DataProvider, type Observation as CoreObservation } from '../../packages/core/src/index.js';
import { backoffDelay, checkFeedUrl, createRestProvider, createSseProvider, createTransportProvider, createWebSocketProvider, dataTypes, parseBatch, type EventSourceLike, type Observation, type TransportProvider, type WebSocketLike } from './index.js';

// ADR-0029 §4 (T-094): the transport examples against a loopback HTTP server and a fake WebSocket.
// Nothing here leaves 127.0.0.1.

const at = '2026-10-23T08:00:00.000Z';
const good = (tagId: string, value: number, sourceTimestamp = at): Observation => ({ tagId, value, quality: 'GOOD', sourceTimestamp });
const fast = { initialDelayMs: 10, maxDelayMs: 40, random: () => 1 };

// Type-level: the examples' shapes are the SDK's, so they plug into `telemetry={{ provider }}`.
const asCore = (o: Observation): CoreObservation => o;
const asProvider = (p: TransportProvider): DataProvider => p;
void asCore;
void asProvider;

describe('messages and URLs', () => {
  it('uses the SDK data types', () => {
    expect([...dataTypes]).toEqual([...coreDataTypes]);
  });

  it('accepts an array or an observations wrapper, and drops bad observations one by one', () => {
    expect(parseBatch(JSON.stringify([good('A', 1)]), 1000)).toEqual({ observations: [good('A', 1)], dropped: [] });
    const bad = [{ tagId: '', value: 1, quality: 'GOOD', sourceTimestamp: at }, { tagId: 'B', value: {}, quality: 'GOOD', sourceTimestamp: at }, { tagId: 'C', value: 1, quality: 'FINE', sourceTimestamp: at }, { tagId: 'D', value: 1, quality: 'GOOD' }, { tagId: 'E', value: 1, quality: 'GOOD', sourceTimestamp: at, dataType: 'int8' }, { tagId: 'F', value: 1, quality: 'GOOD', sourceTimestamp: at, write: true }, { ...good('G', 2), source: 'SIMULATED', dataType: 'float32', unit: 'bar' }];
    const parsed = parseBatch(JSON.stringify({ observations: bad }), 10_000);
    expect(parsed.observations.map((o) => o.tagId)).toEqual(['G']);
    expect(parsed.dropped).toEqual(Array(6).fill('INVALID_OBSERVATION'));
  });

  it('drops whole messages that are not a batch', () => {
    expect(parseBatch('{', 100).dropped).toEqual(['NOT_JSON']);
    expect(parseBatch('{"values":[]}', 100).dropped).toEqual(['NOT_A_BATCH']);
    expect(parseBatch(new ArrayBuffer(4), 100).dropped).toEqual(['NOT_TEXT']);
    expect(parseBatch(JSON.stringify([good('A', 1)]), 10).dropped).toEqual(['TOO_LARGE']);
  });

  it('refuses credentials in the URL and other protocols', () => {
    expect(() => checkFeedUrl('http://operator:secret@127.0.0.1/feed', ['http:'])).toThrow(/credentials/);
    expect(() => checkFeedUrl('https://:token@plant.example/feed', ['https:'])).toThrow(/credentials/);
    expect(() => createRestProvider({ url: 'http://user@127.0.0.1/feed' })).toThrow(/credentials/);
    expect(() => createWebSocketProvider({ url: 'http://127.0.0.1/feed', WebSocket: FakeSocket })).toThrow(/ws: or wss:/);
    expect(() => createRestProvider({ url: 'file:///etc/passwd' })).toThrow(/http: or https:/);
    expect(checkFeedUrl('https://plant.example/feed?site=1', ['https:']).href).toBe('https://plant.example/feed?site=1');
  });

  it('backs off by doubling up to the cap, in the upper half of each wait', () => {
    expect([0, 1, 2, 3, 10].map((n) => backoffDelay(n, 500, 4000, () => 1))).toEqual([500, 1000, 2000, 4000, 4000]);
    expect(backoffDelay(2, 500, 4000, () => 0)).toBe(1000);
    expect(backoffDelay(5000, 500, 4000, () => 1)).toBe(4000);
  });
});

describe('a link that is down', () => {
  it('marks every shown tag DISCONNECTED with its own timestamp, and a value as new replaces the marker', async () => {
    let handlers: Parameters<Parameters<typeof createTransportProvider>[0]>[0] | undefined;
    const provider = createTransportProvider((h) => ((handlers = h), () => undefined), fast);
    const store = createObservationStore();
    const stop = connectProvider(store, provider);
    handlers!.opened();
    handlers!.message(JSON.stringify([good('A', 1), { ...good('A', 9), source: 'SIMULATED' }, good('B', 2, '2026-10-23T07:59:00.000Z')]));
    handlers!.failed('test');
    expect(store.get().map((o) => [o.tagId, o.source ?? 'MEASURED', o.quality, o.sourceTimestamp])).toEqual([
      ['A', 'MEASURED', 'DISCONNECTED', at],
      ['A', 'SIMULATED', 'DISCONNECTED', at],
      ['B', 'MEASURED', 'DISCONNECTED', '2026-10-23T07:59:00.000Z'],
    ]);
    expect(provider.stats()).toMatchObject({ state: 'down', failures: 1, lastError: 'test', retryInMs: 10 });
    // A second failure in the same outage marks nothing again.
    await vi.waitFor(() => expect(provider.stats().state).toBe('connecting'));
    const before = store.get();
    handlers!.failed('again');
    expect(store.get()).toBe(before);
    expect(provider.stats().retryInMs).toBe(20);
    await vi.waitFor(() => expect(provider.stats().state).toBe('connecting'));
    handlers!.opened();
    handlers!.message(JSON.stringify([good('A', 1)]));
    expect(store.get().find((o) => o.tagId === 'A' && !o.source)?.quality).toBe('GOOD');
    expect(provider.stats()).toMatchObject({ state: 'open', reconnects: 1, received: 4 });
    stop();
    expect(provider.stats().state).toBe('stopped');
  });

  it('ignores callbacks from a link it has closed', () => {
    const links: Parameters<Parameters<typeof createTransportProvider>[0]>[0][] = [];
    const provider = createTransportProvider((h) => (links.push(h), () => undefined), fast);
    const seen: Observation[] = [];
    const stop = provider.subscribe((batch) => seen.push(...batch));
    stop();
    links[0].message(JSON.stringify([good('A', 1)]));
    links[0].failed('late');
    expect(seen).toEqual([]);
    expect(provider.stats()).toMatchObject({ state: 'stopped', failures: 0 });
  });
});

// A loopback server whose routes the tests script.
let server: Server;
let base: string;
let route: (req: IncomingMessage, res: ServerResponse) => void;
const requests: string[] = [];
beforeEach(async () => {
  requests.length = 0;
  server = createServer((req, res) => {
    requests.push(req.url ?? '');
    route(req, res);
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterEach(async () => {
  server.closeAllConnections();
  await new Promise((resolve) => server.close(resolve));
});

describe('REST polling', () => {
  it('polls, goes down on an HTTP error, and resumes after the backoff', async () => {
    let status = 200;
    let value = 1;
    route = (_req, res) => {
      res.writeHead(status, { 'content-type': 'application/json' });
      res.end(status === 200 ? JSON.stringify({ observations: [good('FT-101.PV', value), { tagId: 'bad' }] }) : 'down');
    };
    const store = createObservationStore();
    const provider = createRestProvider({ url: `${base}/feed`, intervalMs: 10, ...fast });
    const stop = connectProvider(store, provider);
    await vi.waitFor(() => expect(provider.stats().dropped.INVALID_OBSERVATION).toBeGreaterThanOrEqual(2));
    expect(store.get()).toEqual([good('FT-101.PV', 1)]);
    expect(provider.stats()).toMatchObject({ state: 'open', failures: 0 });

    status = 503;
    await vi.waitFor(() => expect(provider.stats().state).toMatch(/down|connecting/));
    expect(provider.stats().lastError).toBe('HTTP 503');
    expect(store.get()[0].quality).toBe('DISCONNECTED');

    status = 200;
    value = 2;
    await vi.waitFor(() => expect(store.get()[0]).toEqual(good('FT-101.PV', 2)));
    expect(provider.stats()).toMatchObject({ state: 'open', reconnects: 1 });
    stop();
    const count = requests.length;
    await new Promise((resolve) => setTimeout(resolve, 60));
    expect(requests.length).toBe(count);
    expect(provider.stats().state).toBe('stopped');
  });

  it('times out a request that never answers', async () => {
    route = () => undefined;
    const provider = createRestProvider({ url: `${base}/feed`, timeoutMs: 30, ...fast });
    const stop = provider.subscribe(() => undefined);
    await vi.waitFor(() => expect(provider.stats().lastError).toBe('no answer within 30 ms'));
    stop();
  });

  it('shares one link between subscribers, and adds headers through a wrapped fetch', async () => {
    const auth: (string | undefined)[] = [];
    route = (req, res) => {
      auth.push(req.headers.authorization);
      res.end(JSON.stringify([good('A', 1)]));
    };
    const provider = createRestProvider({
      url: `${base}/feed`,
      intervalMs: 1000,
      fetch: (input, init) => fetch(input, { ...init, headers: { ...(init?.headers as Record<string, string>), authorization: 'Bearer test' } }),
    });
    const a: Observation[][] = [];
    const b: Observation[][] = [];
    const stopA = provider.subscribe((batch) => a.push([...batch]));
    const stopB = provider.subscribe((batch) => b.push([...batch]));
    await vi.waitFor(() => expect(b).toHaveLength(1));
    expect(a).toEqual(b);
    expect(requests).toHaveLength(1);
    expect(auth).toEqual(['Bearer test']);
    stopA();
    expect(provider.stats().state).toBe('open');
    stopB();
    expect(provider.stats().state).toBe('stopped');
  });
});

/** Just enough of EventSource for the test (Node 22 has none): one stream over fetch, no retry of its own. */
class TestEventSource implements EventSourceLike {
  static opened: TestEventSource[] = [];
  onopen: ((event: Event) => void) | null = null;
  onerror: ((event: Event) => void) | null = null;
  closed = false;
  private listeners = new Map<string, ((event: MessageEvent) => void)[]>();
  private abort = new AbortController();
  constructor(readonly url: string, readonly init?: { withCredentials?: boolean }) {
    TestEventSource.opened.push(this);
    void this.run();
  }
  addEventListener(type: string, listener: (event: MessageEvent) => void) {
    this.listeners.set(type, [...(this.listeners.get(type) ?? []), listener]);
  }
  close() {
    this.closed = true;
    this.abort.abort();
  }
  private async run() {
    try {
      const response = await fetch(this.url, { headers: { accept: 'text/event-stream' }, signal: this.abort.signal });
      if (!response.ok || !response.body) throw new Error(`HTTP ${response.status}`);
      this.onopen?.(new Event('open'));
      const decoder = new TextDecoder();
      let buffer = '';
      const reader = response.body.getReader();
      for (let chunk = await reader.read(); !chunk.done; chunk = await reader.read()) {
        buffer += decoder.decode(chunk.value, { stream: true });
        let end;
        while ((end = buffer.indexOf('\n\n')) >= 0) {
          const block = buffer.slice(0, end);
          buffer = buffer.slice(end + 2);
          const type = /^event: ?(.*)$/m.exec(block)?.[1] ?? 'message';
          const data = [...block.matchAll(/^data: ?(.*)$/gm)].map((m) => m[1]).join('\n');
          for (const l of this.listeners.get(type) ?? []) l(new MessageEvent(type, { data }));
        }
      }
      throw new Error('stream ended');
    } catch {
      if (!this.closed) this.onerror?.(new Event('error'));
    }
  }
}

describe('Server-Sent Events', () => {
  beforeEach(() => {
    TestEventSource.opened = [];
  });

  it('receives named events, goes down when the stream ends, and reconnects itself', async () => {
    let streams = 0;
    route = (_req, res) => {
      streams++;
      res.writeHead(200, { 'content-type': 'text/event-stream' });
      res.write(`event: telemetry\ndata: ${JSON.stringify([good('LT-101.PV', streams)])}\n\n`);
      res.write('event: other\ndata: ignored\n\n');
      res.write('event: telemetry\ndata: not json\n\n');
      if (streams === 1) setTimeout(() => res.end(), 150);
    };
    const store = createObservationStore();
    const provider = createSseProvider({ url: `${base}/events`, event: 'telemetry', EventSource: TestEventSource, ...fast });
    const stop = connectProvider(store, provider);
    await vi.waitFor(() => expect(store.get()).toEqual([good('LT-101.PV', 1)]), { interval: 5 });
    await vi.waitFor(() => expect(store.get()).toEqual([good('LT-101.PV', 2)]));
    expect(provider.stats()).toMatchObject({ state: 'open', failures: 1, reconnects: 1, lastError: undefined });
    expect(provider.stats().dropped.NOT_JSON).toBe(2);
    expect(TestEventSource.opened.map((s) => s.closed)).toEqual([true, false]);
    stop();
    expect(TestEventSource.opened[1].closed).toBe(true);
  });

  it('goes down on an HTTP error, closing the stream so only the backoff retries', async () => {
    route = (_req, res) => res.writeHead(500).end();
    const provider = createSseProvider({ url: `${base}/events`, EventSource: TestEventSource, initialDelayMs: 1000, random: () => 1 });
    const stop = provider.subscribe(() => undefined);
    await vi.waitFor(() => expect(provider.stats()).toMatchObject({ state: 'down', lastError: 'event stream error', retryInMs: 1000 }));
    expect(TestEventSource.opened.map((s) => s.closed)).toEqual([true]);
    stop();
  });
});

/** A WebSocket the test drives by hand. */
class FakeSocket implements WebSocketLike {
  static all: FakeSocket[] = [];
  onopen: ((event: Event) => void) | null = null;
  onmessage: ((event: MessageEvent) => void) | null = null;
  onerror: ((event: Event) => void) | null = null;
  onclose: ((event: CloseEvent) => void) | null = null;
  closedWith?: number;
  send = vi.fn();
  constructor(readonly url: string, readonly protocols?: string | string[]) {
    FakeSocket.all.push(this);
  }
  close(code?: number) {
    this.closedWith = code;
  }
  open() {
    this.onopen?.(new Event('open'));
  }
  receive(data: unknown) {
    this.onmessage?.({ data } as MessageEvent);
  }
  drop(code = 1006) {
    this.onerror?.(new Event('error'));
    this.onclose?.({ code } as CloseEvent);
  }
}

describe('WebSocket', () => {
  beforeEach(() => {
    FakeSocket.all = [];
  });

  it('receives text batches, drops binary, marks DISCONNECTED when dropped, and reconnects', async () => {
    const store = createObservationStore();
    const provider = createWebSocketProvider({ url: 'wss://gateway.plant.test/telemetry', protocols: 'scada.v1', WebSocket: FakeSocket, ...fast });
    const stop = connectProvider(store, provider);
    const [first] = FakeSocket.all;
    expect([first.url, first.protocols]).toEqual(['wss://gateway.plant.test/telemetry', 'scada.v1']);
    first.open();
    first.receive(JSON.stringify([good('PT-101.PV', 4.2)]));
    first.receive(new Uint8Array([1, 2]));
    expect(store.get()).toEqual([good('PT-101.PV', 4.2)]);
    expect(provider.stats().dropped).toEqual({ NOT_TEXT: 1 });

    first.drop();
    expect(store.get()[0].quality).toBe('DISCONNECTED');
    expect(provider.stats()).toMatchObject({ state: 'down', failures: 1, lastError: 'socket error' });
    first.receive(JSON.stringify([good('PT-101.PV', 9)]));
    expect(store.get()[0].quality).toBe('DISCONNECTED');

    await vi.waitFor(() => expect(FakeSocket.all).toHaveLength(2));
    FakeSocket.all[1].open();
    FakeSocket.all[1].receive(JSON.stringify([good('PT-101.PV', 4.3, '2026-10-23T08:00:01.000Z')]));
    expect(store.get()).toEqual([good('PT-101.PV', 4.3, '2026-10-23T08:00:01.000Z')]);
    stop();
    expect(FakeSocket.all.map((s) => s.closedWith)).toEqual([1000, 1000]);
    expect(FakeSocket.all.every((s) => s.send.mock.calls.length === 0)).toBe(true);
    await new Promise((resolve) => setTimeout(resolve, 60));
    expect(FakeSocket.all).toHaveLength(2);
  });

  it('keeps retrying a gateway that refuses, with the waits capped', async () => {
    const provider = createWebSocketProvider({ url: 'ws://127.0.0.1:1/telemetry', WebSocket: FakeSocket, ...fast });
    const waits: number[] = [];
    const stop = provider.subscribe(() => undefined);
    for (let i = 0; i < 5; i++) {
      await vi.waitFor(() => expect(FakeSocket.all).toHaveLength(i + 1));
      FakeSocket.all[i].drop(1006);
      waits.push(provider.stats().retryInMs!);
    }
    expect(waits).toEqual([10, 20, 40, 40, 40]);
    stop();
  });
});
