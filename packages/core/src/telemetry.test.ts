import { describe, expect, it } from 'vitest';
import {
  createEmptyScene,
  displayScene,
  resolveFlow,
  resolveTelemetry,
  type ComponentKind,
  type Observation,
  type Quantity,
  type ScadaScene,
  type TelemetryOptions,
} from './index.js';

const NOW = Date.parse('2026-10-15T12:00:00.000Z');
const at = (msAgo: number) => new Date(NOW - msAgo).toISOString();

const bindable: Partial<Record<ComponentKind, Record<string, Quantity>>> = {
  tank: { level: 'percent', temperature: 'temperature' },
  valve: { open: 'boolean' },
};

const scene: ScadaScene = {
  ...createEmptyScene(),
  components: [
    { id: 'tank', type: 'tank', position: { x: 0, y: 1.535, z: 0 }, rotation: { x: 0, y: 0, z: 0, w: 1 }, scale: { x: 1, y: 1, z: 1 }, properties: { level: 45, temperature: 20 } },
    { id: 'valve', type: 'valve', position: { x: 1.8, y: 0.635, z: 0 }, rotation: { x: 0, y: 0, z: 0, w: 1 }, scale: { x: 1, y: 1, z: 1 }, properties: { open: true } },
  ],
  connections: [{ id: 'e1', from: { instanceId: 'tank', portId: 'outlet' }, to: { instanceId: 'valve', portId: 'in' } }],
  tagBindings: [
    { id: 'b-level', tagId: 'LT-101', kind: 'property', instanceId: 'tank', property: 'level' },
    { id: 'b-temp', tagId: 'TT-101', kind: 'property', instanceId: 'tank', property: 'temperature', unit: 'K' },
    { id: 'b-open', tagId: 'XV-101', kind: 'property', instanceId: 'valve', property: 'open' },
    { id: 'b-flow', tagId: 'FT-101', kind: 'flow', connectionId: 'e1', unit: 'm³/h' },
  ],
};

const options: TelemetryOptions = { now: NOW, resolveBindable: (t) => bindable[t] };

const obs = (tagId: string, value: Observation['value'], overrides: Partial<Observation> = {}): Observation => ({
  tagId,
  value,
  quality: 'GOOD',
  sourceTimestamp: at(1000),
  ...overrides,
});

const property = (observations: Observation[], bindingId: string, extra: Partial<TelemetryOptions> = {}) =>
  resolveTelemetry(scene, observations, { ...options, ...extra }).properties.find((p) => p.bindingId === bindingId)!;

describe('resolveTelemetry: property bindings', () => {
  it('reports every property binding as unknown without observations', () => {
    expect(resolveTelemetry(scene, [], options).properties.map((p) => [p.bindingId, p.status, p.reason])).toEqual([
      ['b-level', 'unknown', 'NO_READING'],
      ['b-temp', 'unknown', 'NO_READING'],
      ['b-open', 'unknown', 'NO_READING'],
    ]);
  });

  it('passes a good percent value through with its metadata', () => {
    expect(property([obs('LT-101', 62)], 'b-level')).toEqual({
      bindingId: 'b-level',
      instanceId: 'tank',
      property: 'level',
      status: 'ok',
      value: 62,
      quality: 'GOOD',
      source: 'MEASURED',
      sourceTimestamp: at(1000),
      uncertain: false,
    });
  });

  it('converts to the canonical unit using the binding unit, or the observation unit when given', () => {
    expect(property([obs('TT-101', 353.15)], 'b-temp').value).toBeCloseTo(80, 9);
    expect(property([obs('TT-101', 176, { unit: '°F' })], 'b-temp').value).toBeCloseTo(80, 9);
  });

  it.each([
    ['an unconvertible unit', obs('TT-101', 80, { unit: '%' }), 'b-temp', 'INVALID_UNIT'],
    ['a string for a number', obs('LT-101', '62'), 'b-level', 'INVALID_VALUE'],
    ['a non-finite number', obs('LT-101', Number.NaN), 'b-level', 'INVALID_VALUE'],
    ['a number for a boolean', obs('XV-101', 1), 'b-open', 'INVALID_VALUE'],
    ['a unit on a boolean', obs('XV-101', true, { unit: '%' }), 'b-open', 'INVALID_UNIT'],
    ['bad quality', obs('LT-101', 62, { quality: 'BAD' }), 'b-level', 'BAD_QUALITY'],
    ['an old timestamp', obs('LT-101', 62, { sourceTimestamp: at(10_001) }), 'b-level', 'STALE'],
    ['a future timestamp', obs('LT-101', 62, { sourceTimestamp: at(-6000) }), 'b-level', 'INVALID_TIMESTAMP'],
  ] as const)('treats %s as unknown', (_, observation, bindingId, reason) => {
    const state = property([observation], bindingId);
    expect(state.status).toBe('unknown');
    expect(state.reason).toBe(reason);
    expect(state.value).toBeUndefined();
  });

  it('flags uncertain values but keeps them', () => {
    expect(property([obs('XV-101', false, { quality: 'UNCERTAIN' })], 'b-open')).toEqual(
      expect.objectContaining({ status: 'ok', value: false, uncertain: true }),
    );
  });

  it('uses the newest observation per tag regardless of order', () => {
    const older = obs('LT-101', 10, { sourceTimestamp: at(3000) });
    const newer = obs('LT-101', 70, { sourceTimestamp: at(2000) });
    expect(property([newer, older], 'b-level').value).toBe(70);
  });

  it('never mixes simulated and measured observations', () => {
    const simulated = obs('LT-101', 99, { source: 'SIMULATED' });
    expect(property([simulated], 'b-level').reason).toBe('NO_READING');
    expect(property([simulated, obs('LT-101', 10)], 'b-level', { source: 'SIMULATED' })).toEqual(
      expect.objectContaining({ value: 99, source: 'SIMULATED' }),
    );
  });

  it('reports observations for tags that nothing binds', () => {
    expect(resolveTelemetry(scene, [obs('PT-900', 1), obs('LT-101', 1), obs('PT-900', 2)], options).unmatchedTagIds).toEqual(['PT-900']);
  });

  it('accepts numbers and booleans as-is when no bindable resolver is given', () => {
    const state = resolveTelemetry(scene, [obs('TT-101', 300)], { now: NOW }).properties.find((p) => p.bindingId === 'b-temp')!;
    expect(state).toEqual(expect.objectContaining({ status: 'ok', value: 300 }));
  });
});

describe('resolveTelemetry: flow bindings', () => {
  it('turns flow tags into readings in m³/s for resolveFlow', () => {
    const { flowReadings } = resolveTelemetry(scene, [obs('FT-101', 7200)], options);
    expect(flowReadings).toEqual([
      { connectionId: 'e1', rate: 2, quality: 'GOOD', source: 'MEASURED', sourceTimestamp: at(1000) },
    ]);
    expect(resolveFlow(scene, flowReadings, { now: NOW }).states[0].direction).toBe('forward');
  });

  it('gives no reading for a flow tag without observations, so flow stays unknown', () => {
    const { flowReadings } = resolveTelemetry(scene, [], options);
    expect(flowReadings).toEqual([]);
    expect(resolveFlow(scene, flowReadings, { now: NOW }).states[0].reason).toBe('NO_READING');
  });

  it('marks an unusable flow value so resolveFlow rejects it', () => {
    const { flowReadings } = resolveTelemetry(scene, [obs('FT-101', 5, { unit: 'gpm' })], options);
    expect(resolveFlow(scene, flowReadings, { now: NOW }).states[0].reason).toBe('INVALID_VALUE');
  });
});

describe('displayScene', () => {
  it('shows good values and hides bound values that cannot be trusted, without touching the input', () => {
    const before = structuredClone(scene);
    const { properties } = resolveTelemetry(scene, [obs('LT-101', 62), obs('TT-101', 0, { quality: 'BAD' })], options);
    const shown = displayScene(scene, properties);
    expect(shown.components[0].properties).toEqual({ level: 62 });
    // XV-101 has no observation: the authored "open: true" is not shown as if it were live.
    expect(shown.components[1].properties).toEqual({});
    expect(scene).toEqual(before);
  });

  it('returns the same scene when nothing is bound', () => {
    const plain = { ...scene, tagBindings: undefined };
    expect(displayScene(plain, resolveTelemetry(plain, [], options).properties)).toBe(plain);
  });
});
