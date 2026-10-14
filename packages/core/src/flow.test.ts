import { describe, expect, it } from 'vitest';
import {
  createEmptyScene,
  resolveFlow,
  type ComponentInstance,
  type ComponentKind,
  type FlowReading,
  type ScadaScene,
  type SceneConnection,
} from './index';

const NOW = Date.parse('2026-10-15T12:00:00.000Z');
const at = (msAgo: number) => new Date(NOW - msAgo).toISOString();

const component = (id: string, type: ComponentKind, properties: ComponentInstance['properties'] = {}): ComponentInstance => ({
  id,
  type,
  position: { x: 0, y: 0, z: 0 },
  rotation: { x: 0, y: 0, z: 0, w: 1 },
  scale: { x: 1, y: 1, z: 1 },
  properties,
});
const edge = (id: string, from: [string, string], to: [string, string]): SceneConnection => ({
  id,
  from: { instanceId: from[0], portId: from[1] },
  to: { instanceId: to[0], portId: to[1] },
});

/** tank -> valve (open) -> tee, tee branches to valve-a and valve-b. */
const network: ScadaScene = {
  ...createEmptyScene(),
  components: [
    component('tank', 'tank'),
    component('valve', 'valve', { open: true }),
    component('tee', 'tee'),
    component('valve-a', 'valve', { open: true }),
    component('valve-b', 'valve', { open: true }),
  ],
  connections: [
    edge('tank-valve', ['tank', 'outlet'], ['valve', 'in']),
    edge('valve-tee', ['valve', 'out'], ['tee', 'left']),
    edge('tee-a', ['tee', 'right'], ['valve-a', 'in']),
    edge('tee-b', ['tee', 'branch'], ['valve-b', 'in']),
  ],
};

const reading = (connectionId: string, rate: number, overrides: Partial<FlowReading> = {}): FlowReading => ({
  connectionId,
  rate,
  quality: 'GOOD',
  source: 'MEASURED',
  sourceTimestamp: at(1000),
  ...overrides,
});

const resolve = (readings: FlowReading[], options = {}) => resolveFlow(network, readings, { now: NOW, ...options });
const stateOf = (readings: FlowReading[], id = 'tank-valve', options = {}) => resolve(readings, options).states.find((s) => s.connectionId === id)!;

describe('resolveFlow', () => {
  it('reports every connection, in connection order, as unknown without readings', () => {
    expect(resolve([]).states).toEqual(
      network.connections.map((c) => ({ connectionId: c.id, direction: 'unknown', reason: 'NO_READING' })),
    );
  });

  it('never infers flow from an open valve', () => {
    expect(stateOf([], 'valve-tee')).toEqual({ connectionId: 'valve-tee', direction: 'unknown', reason: 'NO_READING' });
  });

  it.each([
    [5, 'forward'],
    [-5, 'reverse'],
    [0, 'stopped'],
    [5e-7, 'stopped'],
    [-5e-7, 'stopped'],
  ] as const)('maps a good measured rate of %p to %s', (rate, direction) => {
    expect(stateOf([reading('tank-valve', rate)])).toEqual({
      connectionId: 'tank-valve',
      direction,
      rate,
      quality: 'GOOD',
      source: 'MEASURED',
      sourceTimestamp: at(1000),
      uncertain: false,
    });
  });

  it('uses the configured zero threshold', () => {
    expect(stateOf([reading('tank-valve', 0.01)], 'tank-valve', { zeroThreshold: 0.02 }).direction).toBe('stopped');
  });

  it('keeps the direction of an uncertain reading but flags it', () => {
    expect(stateOf([reading('tank-valve', -2, { quality: 'UNCERTAIN' })])).toEqual(
      expect.objectContaining({ direction: 'reverse', uncertain: true }),
    );
  });

  it.each([
    ['bad quality', { quality: 'BAD' }, 'BAD_QUALITY'],
    ['a reading flagged stale', { quality: 'STALE' }, 'STALE'],
    ['a reading older than the stale limit', { sourceTimestamp: at(10_001) }, 'STALE'],
    ['an unparseable timestamp', { sourceTimestamp: 'yesterday' }, 'INVALID_TIMESTAMP'],
    ['a timestamp too far in the future', { sourceTimestamp: at(-5_001) }, 'INVALID_TIMESTAMP'],
    ['a non-finite rate', { rate: Number.NaN }, 'INVALID_VALUE'],
    ['an unknown quality', { quality: 'OK' as never }, 'INVALID_VALUE'],
  ] as const)('shows %s as unknown, not as flow', (_, overrides, reason) => {
    const state = stateOf([reading('tank-valve', 5, overrides as Partial<FlowReading>)]);
    expect(state.direction).toBe('unknown');
    expect(state.reason).toBe(reason);
    expect(state.rate).toBeUndefined();
  });

  it('keeps the timestamp of a stale reading so the viewer can say since when', () => {
    expect(stateOf([reading('tank-valve', 5, { sourceTimestamp: at(60_000) })])).toEqual({
      connectionId: 'tank-valve',
      direction: 'unknown',
      reason: 'STALE',
      quality: 'GOOD',
      source: 'MEASURED',
      sourceTimestamp: at(60_000),
    });
  });

  it('treats a reading exactly at the stale limit as fresh, and accepts small clock skew', () => {
    expect(stateOf([reading('tank-valve', 5, { sourceTimestamp: at(10_000) })]).direction).toBe('forward');
    expect(stateOf([reading('tank-valve', 5, { sourceTimestamp: at(-5_000) })]).direction).toBe('forward');
    expect(stateOf([reading('tank-valve', 5, { sourceTimestamp: at(20_000) })], 'tank-valve', { staleAfterMs: 30_000 }).direction).toBe('forward');
  });

  it('uses the newest reading per connection regardless of arrival order', () => {
    const older = reading('tank-valve', 5, { sourceTimestamp: at(3000) });
    const newer = reading('tank-valve', -1, { sourceTimestamp: at(2000) });
    expect(stateOf([newer, older]).direction).toBe('reverse');
    expect(stateOf([older, newer]).direction).toBe('reverse');
  });

  it('lets a newer bad reading override an older good one', () => {
    const good = reading('tank-valve', 5, { sourceTimestamp: at(3000) });
    const bad = reading('tank-valve', 5, { quality: 'BAD', sourceTimestamp: at(1000) });
    expect(stateOf([bad, good]).reason).toBe('BAD_QUALITY');
  });

  it('breaks equal timestamps by taking the later reading in the list', () => {
    expect(stateOf([reading('tank-valve', 5), reading('tank-valve', -5)]).direction).toBe('reverse');
  });

  it('ignores simulated readings in measured mode and labels them in simulated mode', () => {
    const simulated = reading('tank-valve', 3, { source: 'SIMULATED' });
    expect(stateOf([simulated]).reason).toBe('NO_READING');
    expect(stateOf([simulated], 'tank-valve', { source: 'SIMULATED' })).toEqual(
      expect.objectContaining({ direction: 'forward', source: 'SIMULATED' }),
    );
    expect(stateOf([reading('tank-valve', 3)], 'tank-valve', { source: 'SIMULATED' }).reason).toBe('NO_READING');
  });

  it('does not split a known inflow across tee branches', () => {
    const { states } = resolve([reading('valve-tee', 4)]);
    expect(states.map((s) => [s.connectionId, s.direction])).toEqual([
      ['tank-valve', 'unknown'],
      ['valve-tee', 'forward'],
      ['tee-a', 'unknown'],
      ['tee-b', 'unknown'],
    ]);
  });

  it('reports readings for connections that are not in the scene', () => {
    expect(resolve([reading('ghost', 1), reading('tank-valve', 1), reading('ghost', 2)]).unmatchedConnectionIds).toEqual(['ghost']);
  });

  it('does not mutate its inputs', () => {
    const readings = [reading('tank-valve', 5), reading('tee-a', -1)];
    const before = structuredClone({ network, readings });
    resolve(readings);
    expect({ network, readings }).toEqual(before);
  });
});
