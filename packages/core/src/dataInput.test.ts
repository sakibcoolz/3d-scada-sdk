import { describe, expect, it, vi } from 'vitest';
import { connectProvider, createObservationStore, type DataProvider, type Observation } from './index';

const obs = (tagId: string, value: number, secondsAgo = 1, overrides: Partial<Observation> = {}): Observation => ({
  tagId,
  value,
  quality: 'GOOD',
  sourceTimestamp: new Date(Date.parse('2026-10-15T12:00:00Z') - secondsAgo * 1000).toISOString(),
  ...overrides,
});

describe('createObservationStore', () => {
  it('starts empty and keeps the newest observation per tag', () => {
    const store = createObservationStore();
    expect(store.get()).toEqual([]);
    store.set([obs('LT-1', 10, 5), obs('LT-1', 20, 2), obs('TT-1', 30)]);
    expect(store.get()).toEqual([obs('LT-1', 20, 2), obs('TT-1', 30)]);
  });

  it('ignores an older observation that arrives late', () => {
    const store = createObservationStore();
    store.set([obs('LT-1', 20, 2)]);
    expect(store.set([obs('LT-1', 10, 5)])).toBe(0);
    expect(store.get()).toEqual([obs('LT-1', 20, 2)]);
  });

  it('keeps measured and simulated values of a tag apart', () => {
    const store = createObservationStore();
    store.set([obs('LT-1', 20), obs('LT-1', 99, 1, { source: 'SIMULATED' })]);
    expect(store.get()).toHaveLength(2);
  });

  it('returns the same array until something changes', () => {
    const store = createObservationStore();
    store.set([obs('LT-1', 20)]);
    const first = store.get();
    store.set([obs('LT-1', 10, 9)]);
    expect(store.get()).toBe(first);
    store.set([obs('LT-1', 30, 0)]);
    expect(store.get()).not.toBe(first);
  });

  it('notifies listeners only on change, and stops after unsubscribe', () => {
    const store = createObservationStore();
    const listener = vi.fn();
    const unsubscribe = store.subscribe(listener);
    store.set([obs('LT-1', 20)]);
    store.set([obs('LT-1', 10, 9)]);
    expect(listener).toHaveBeenCalledTimes(1);
    unsubscribe();
    store.set([obs('LT-1', 30, 0)]);
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('bounds memory by refusing new tags past maxTags', () => {
    const store = createObservationStore({ maxTags: 2 });
    expect(store.set([obs('A', 1), obs('B', 2), obs('C', 3)])).toBe(2);
    expect(store.get().map((o) => o.tagId)).toEqual(['A', 'B']);
    expect(store.set([obs('A', 5, 0)])).toBe(1);
  });

  it('clears everything and notifies', () => {
    const store = createObservationStore();
    const listener = vi.fn();
    store.subscribe(listener);
    store.set([obs('LT-1', 20)]);
    store.clear();
    expect(store.get()).toEqual([]);
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it('copies observations so later mutation by the host cannot change stored values', () => {
    const store = createObservationStore();
    const input = obs('LT-1', 20);
    store.set([input]);
    input.value = 999;
    expect(store.get()[0].value).toBe(20);
  });
});

describe('connectProvider', () => {
  it('loads a synchronous snapshot and live batches, then unsubscribes once on disconnect', () => {
    const store = createObservationStore();
    let push: ((o: readonly Observation[]) => void) | undefined;
    const unsubscribe = vi.fn();
    const provider: DataProvider = {
      getSnapshot: () => [obs('LT-1', 10, 5)],
      subscribe: (onObservations) => {
        push = onObservations;
        return unsubscribe;
      },
    };
    const disconnect = connectProvider(store, provider);
    expect(store.get()).toEqual([obs('LT-1', 10, 5)]);
    push!([obs('LT-1', 20, 1)]);
    expect(store.get()).toEqual([obs('LT-1', 20, 1)]);
    disconnect();
    disconnect();
    expect(unsubscribe).toHaveBeenCalledTimes(1);
  });

  it('applies an asynchronous snapshot that resolves while connected', async () => {
    const store = createObservationStore();
    connectProvider(store, { getSnapshot: async () => [obs('LT-1', 10)] });
    await Promise.resolve();
    await Promise.resolve();
    expect(store.get()).toEqual([obs('LT-1', 10)]);
  });

  it('drops an asynchronous snapshot that resolves after disconnect', async () => {
    const store = createObservationStore();
    let resolve!: (o: Observation[]) => void;
    const disconnect = connectProvider(store, { getSnapshot: () => new Promise((r) => (resolve = r)) });
    disconnect();
    resolve([obs('LT-1', 10)]);
    await Promise.resolve();
    await Promise.resolve();
    expect(store.get()).toEqual([]);
  });

  it('ignores batches pushed after disconnect by a misbehaving provider', () => {
    const store = createObservationStore();
    let push!: (o: readonly Observation[]) => void;
    const disconnect = connectProvider(store, { subscribe: (fn) => ((push = fn), () => {}) });
    disconnect();
    push([obs('LT-1', 10)]);
    expect(store.get()).toEqual([]);
  });

  it('reports provider failures instead of throwing', async () => {
    const store = createObservationStore();
    const onError = vi.fn();
    connectProvider(store, { getSnapshot: () => Promise.reject(new Error('host down')) }, { onError });
    connectProvider(store, { subscribe: () => { throw new Error('no feed'); } }, { onError });
    await Promise.resolve();
    await Promise.resolve();
    expect(onError.mock.calls.map(([e]) => (e as Error).message).sort()).toEqual(['host down', 'no feed']);
  });

  it('accepts a provider with neither method', () => {
    const disconnect = connectProvider(createObservationStore(), {});
    expect(() => disconnect()).not.toThrow();
  });
});
