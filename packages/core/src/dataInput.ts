import { isNewer } from './observation';
import type { Observation } from './telemetry';

/**
 * Optional host-implemented source of observations. The SDK never opens a connection itself:
 * the host decides where values come from (REST, WebSocket, MQTT bridge, file, simulator) and
 * hands them over through these callbacks.
 */
export interface DataProvider {
  /** Current values, read once when the provider is connected. */
  getSnapshot?(): readonly Observation[] | Promise<readonly Observation[]>;
  /** Pushes later batches; returns the function that stops them. */
  subscribe?(onObservations: (observations: readonly Observation[]) => void): () => void;
}

/** Latest observation per tag and source, with change notification. */
export interface ObservationStore {
  /** Adds a batch; returns how many observations changed the store. */
  set(observations: readonly Observation[]): number;
  /** Current observations; the same array until something changes. */
  get(): readonly Observation[];
  subscribe(listener: () => void): () => void;
  clear(): void;
}

/**
 * Keeps only the newest observation per (tag, source), so memory is bounded by the number of tags
 * (`maxTags`, default 50,000; further new tags are refused) and late, older values are ignored.
 */
export function createObservationStore(options: { maxTags?: number } = {}): ObservationStore {
  const maxTags = options.maxTags ?? 50_000;
  const latest = new Map<string, Observation>();
  const listeners = new Set<() => void>();
  let snapshot: readonly Observation[] = [];
  const changed = () => {
    snapshot = [...latest.values()];
    for (const listener of [...listeners]) listener();
  };
  return {
    set(observations) {
      let accepted = 0;
      for (const o of observations) {
        // Host data is untrusted: only string tag ids are stored (other values cannot be bound anyway).
        if (typeof o?.tagId !== 'string') continue;
        const key = JSON.stringify([o.source === 'SIMULATED' ? 'SIMULATED' : 'MEASURED', o.tagId]);
        const current = latest.get(key);
        if (!current && latest.size >= maxTags) continue;
        if (current && !isNewer(o, current)) continue;
        latest.set(key, { ...o });
        accepted++;
      }
      if (accepted > 0) changed();
      return accepted;
    },
    get: () => snapshot,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    clear() {
      latest.clear();
      changed();
    },
  };
}

/**
 * Feeds a store from a provider: the snapshot (sync or async) and every pushed batch. Returns a
 * disconnect function that unsubscribes exactly once; anything arriving after it is dropped.
 * Provider failures go to `onError` (default: console.error) rather than throwing into the viewer.
 */
export function connectProvider(
  store: ObservationStore,
  provider: DataProvider,
  options: { onError?: (error: unknown) => void } = {},
): () => void {
  const onError = options.onError ?? ((error: unknown) => console.error('DataProvider failed', error));
  let connected = true;
  const accept = (observations: readonly Observation[]) => {
    if (connected) store.set(observations);
  };
  let unsubscribe: (() => void) | undefined;
  try {
    const snapshot = provider.getSnapshot?.();
    if (snapshot && 'then' in snapshot) snapshot.then(accept, onError);
    else if (snapshot) accept(snapshot);
    unsubscribe = provider.subscribe?.(accept);
  } catch (error) {
    onError(error);
  }
  return () => {
    if (!connected) return;
    connected = false;
    try {
      unsubscribe?.();
    } catch (error) {
      onError(error);
    }
  };
}
