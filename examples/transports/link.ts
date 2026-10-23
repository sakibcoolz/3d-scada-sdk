import { parseBatch, type DropReason, type Observation } from './observations.js';

// The part every transport shares (ADR-0029 §4): one link for all subscribers, reconnection with a
// capped backoff, and DISCONNECTED marking while the link is down. Each transport only opens a link.

export type LinkState = 'connecting' | 'open' | 'down' | 'stopped';

export interface TransportStats {
  state: LinkState;
  /** Observations passed on to subscribers. */
  received: number;
  /** Dropped messages and observations, by reason. */
  dropped: Partial<Record<DropReason, number>>;
  failures: number;
  /** Links opened after a failure. */
  reconnects: number;
  lastError?: string;
  /** While down: the wait before the next attempt. */
  retryInMs?: number;
}

export interface LinkOptions {
  /** First reconnection wait, doubled per failed attempt up to `maxDelayMs`. Default 500 ms. */
  initialDelayMs?: number;
  /** Default 30 s. */
  maxDelayMs?: number;
  /** Messages longer than this are dropped unread. Default 1,000,000 characters. */
  maxMessageChars?: number;
  /** Called on every change of the stats, for a host's connection indicator or log. */
  onStats?: (stats: TransportStats) => void;
  /** For tests; default Math.random. */
  random?: () => number;
}

export interface LinkHandlers {
  /** The link works; may be called more than once. */
  opened(): void;
  /** One message as received; validated here. */
  message(data: unknown): void;
  /** The link is down. Later calls from the same link are ignored. */
  failed(error: string): void;
}

/** Opens one link and returns the function that closes it. */
export type OpenLink = (handlers: LinkHandlers) => () => void;

/** A `DataProvider` (see @sakibcoolz/core), plus its link statistics. */
export interface TransportProvider {
  subscribe(onObservations: (observations: readonly Observation[]) => void): () => void;
  stats(): TransportStats;
}

/**
 * The wait before reconnection attempt `attempt` (0-based): doubling from `initialMs`, capped at
 * `maxMs`, and randomized in its upper half so many browsers do not reconnect in step after a
 * gateway restart.
 */
export function backoffDelay(attempt: number, initialMs: number, maxMs: number, random: () => number = Math.random): number {
  const ceiling = Math.min(maxMs, initialMs * 2 ** Math.min(attempt, 30));
  return ceiling / 2 + (random() * ceiling) / 2;
}

const keyOf = (o: Observation) => JSON.stringify([o.source ?? 'MEASURED', o.tagId]);

export function createTransportProvider(open: OpenLink, options: LinkOptions = {}): TransportProvider {
  const initialDelayMs = options.initialDelayMs ?? 500;
  const maxDelayMs = options.maxDelayMs ?? 30_000;
  const maxMessageChars = options.maxMessageChars ?? 1_000_000;
  const listeners = new Set<(observations: readonly Observation[]) => void>();
  // The last observation per (source, tag), so an outage can mark exactly what was shown.
  const last = new Map<string, Observation>();
  const fresh = (): TransportStats => ({ state: 'stopped', received: 0, dropped: {}, failures: 0, reconnects: 0 });
  let stats = fresh();
  let generation = 0;
  let close: (() => void) | undefined;
  let retry: ReturnType<typeof setTimeout> | undefined;
  let attempt = 0;
  let afterFailure = false;
  let marked = false;

  const update = (patch: Partial<TransportStats>) => {
    stats = { ...stats, ...patch };
    options.onStats?.(stats);
  };
  const emit = (batch: readonly Observation[]) => {
    if (batch.length > 0) for (const listener of [...listeners]) listener(batch);
  };
  const closeLink = () => {
    const c = close;
    close = undefined;
    generation++;
    try {
      c?.();
    } catch {
      // A link that fails to close is abandoned: its callbacks are already ignored.
    }
  };
  // DISCONNECTED keeps each tag's own timestamp: the store lets ties replace, so the marker replaces
  // the last value, and any value at least as new replaces the marker after reconnection.
  const markDisconnected = () => {
    if (marked) return;
    marked = true;
    emit([...last.values()].filter((o) => o.quality !== 'DISCONNECTED').map((o) => ({ ...o, quality: 'DISCONNECTED' as const })));
  };
  const fail = (error: string) => {
    closeLink();
    markDisconnected();
    afterFailure = true;
    const delay = backoffDelay(attempt++, initialDelayMs, maxDelayMs, options.random);
    update({ state: 'down', failures: stats.failures + 1, lastError: error, retryInMs: delay });
    retry = setTimeout(connect, delay);
  };
  function connect() {
    retry = undefined;
    const g = ++generation;
    const live = () => g === generation;
    update({ state: 'connecting', retryInMs: undefined });
    const handlers: LinkHandlers = {
      opened() {
        if (!live() || stats.state === 'open') return;
        attempt = 0;
        update({ state: 'open', lastError: undefined, reconnects: stats.reconnects + (afterFailure ? 1 : 0) });
        afterFailure = false;
      },
      message(data) {
        if (!live()) return;
        const { observations, dropped } = parseBatch(data, maxMessageChars);
        if (dropped.length > 0) {
          const counts = { ...stats.dropped };
          for (const reason of dropped) counts[reason] = (counts[reason] ?? 0) + 1;
          update({ dropped: counts });
        }
        if (observations.length === 0) return;
        for (const o of observations) last.set(keyOf(o), o);
        marked = false;
        update({ received: stats.received + observations.length });
        emit(observations);
      },
      failed(error) {
        if (live()) fail(error);
      },
    };
    let c: (() => void) | undefined;
    try {
      c = open(handlers);
    } catch (error) {
      handlers.failed(error instanceof Error ? error.message : String(error));
    }
    if (live()) close = c;
    else c?.();
  }
  const stop = () => {
    if (retry !== undefined) clearTimeout(retry);
    retry = undefined;
    closeLink();
    last.clear();
    attempt = 0;
    afterFailure = false;
    marked = false;
    update({ state: 'stopped', retryInMs: undefined });
  };

  return {
    subscribe(onObservations) {
      listeners.add(onObservations);
      if (listeners.size === 1) {
        stats = fresh();
        connect();
      }
      return () => {
        if (listeners.delete(onObservations) && listeners.size === 0) stop();
      };
    },
    stats: () => stats,
  };
}
