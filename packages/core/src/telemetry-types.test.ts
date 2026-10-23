import { describe, expect, it } from 'vitest';
import { createEmptyScene, resolveTelemetry, valueFitsDataType, type DataType, type Observation, type RuntimeVariable, type ScadaScene } from './index.js';

// Normalized telemetry (ADR-0029, T-092): a tag's declared data type is checked against what arrives.

const NOW = Date.parse('2026-10-23T12:00:00.000Z');
const variable = (id: string, dataType: DataType, extra: Partial<RuntimeVariable> = {}): RuntimeVariable => ({ id, dataType, access: 'read', ...extra });
const scene: ScadaScene = {
  ...createEmptyScene(),
  components: [{ id: 'tank', type: 'tank', position: { x: 0, y: 0, z: 0 }, rotation: { x: 0, y: 0, z: 0, w: 1 }, scale: { x: 1, y: 1, z: 1 }, properties: {} }],
  connections: [],
  runtimeVariables: [variable('LT', 'float32', { unit: '%' }), variable('COUNT', 'int16'), variable('RAW', 'int16', { unit: '%', scaling: { kind: 'linear', rawMin: 0, rawMax: 27648, min: 0, max: 100 } }), variable('RUN', 'bool')],
  tagBindings: [
    { id: 'b-lt', tagId: 'LT', kind: 'property', instanceId: 'tank', property: 'level' },
    { id: 'b-count', tagId: 'COUNT', kind: 'property', instanceId: 'tank', property: 'count' },
    { id: 'b-raw', tagId: 'RAW', kind: 'property', instanceId: 'tank', property: 'level2' },
    { id: 'b-run', tagId: 'RUN', kind: 'property', instanceId: 'tank', property: 'running' },
    { id: 'b-free', tagId: 'FREE', kind: 'property', instanceId: 'tank', property: 'free' },
  ],
};
const obs = (tagId: string, value: unknown, extra: Partial<Observation> = {}): Observation => ({ tagId, value: value as Observation['value'], quality: 'GOOD', sourceTimestamp: new Date(NOW - 100).toISOString(), ...extra });
/** The state of one tag's binding. */
const state = (o: Observation) => {
  const binding = scene.tagBindings!.find((b) => b.tagId === o.tagId)!;
  const p = resolveTelemetry(scene, [o], { now: NOW }).properties.find((x) => x.bindingId === binding.id)!;
  return p.status === 'ok' ? `ok ${String(p.value)}` : p.reason;
};

describe('valueFitsDataType', () => {
  it('checks each type: booleans, integers in range, finite floats, strings', () => {
    const cases: [unknown, DataType, boolean][] = [
      [true, 'bool', true], [1, 'bool', false],
      [-32768, 'int16', true], [32767, 'int16', true], [32768, 'int16', false], [1.5, 'int16', false],
      [0, 'uint16', true], [-1, 'uint16', false], [65535, 'uint16', true], [65536, 'uint16', false],
      [-2147483648, 'int32', true], [2147483648, 'int32', false], [4294967295, 'uint32', true], [4294967296, 'uint32', false],
      [3.4e38, 'float32', true], [3.5e38, 'float32', false], [1e300, 'float64', true],
      [Number.NaN, 'float64', false], [Infinity, 'float32', false], ['1', 'float32', false], ['x', 'string', true], [1, 'string', false],
    ];
    for (const [value, type, fits] of cases) expect(valueFitsDataType(value, type), `${String(value)} as ${type}`).toBe(fits);
  });

  it('accepts any finite number for a scaled variable, which carries engineering values', () => {
    expect(valueFitsDataType(55.3, 'int16', true)).toBe(true);
    expect(valueFitsDataType(Number.NaN, 'int16', true)).toBe(false);
    expect(valueFitsDataType(true, 'int16', true)).toBe(false);
  });
});

describe('resolveTelemetry with declared data types', () => {
  it('accepts a value that fits, with or without a matching stated type', () => {
    expect(state(obs('LT', 55))).toBe('ok 55');
    expect(state(obs('LT', 55, { dataType: 'float32' }))).toBe('ok 55');
    expect(state(obs('COUNT', 7, { dataType: 'int16' }))).toBe('ok 7');
    expect(state(obs('RUN', true, { dataType: 'bool' }))).toBe('ok true');
  });

  it('marks a stated type that differs from the declared one as TYPE_MISMATCH, before anything else', () => {
    expect(state(obs('LT', 55, { dataType: 'int16' }))).toBe('TYPE_MISMATCH');
    expect(state(obs('LT', 55, { dataType: 'decimal' as DataType }))).toBe('TYPE_MISMATCH');
    expect(state(obs('LT', 55, { dataType: 'int16', quality: 'BAD' }))).toBe('TYPE_MISMATCH');
  });

  it('marks a value that does not fit the declared type as INVALID_VALUE', () => {
    expect(state(obs('COUNT', 70000))).toBe('INVALID_VALUE');
    expect(state(obs('COUNT', 1.5))).toBe('INVALID_VALUE');
    expect(state(obs('LT', '55'))).toBe('INVALID_VALUE');
    expect(state(obs('RUN', 1))).toBe('INVALID_VALUE');
  });

  it('lets a scaled integer tag carry an engineering value', () => {
    expect(state(obs('RAW', 55.3))).toBe('ok 55.3');
  });

  it('checks a tag without a variable against its stated type only, and leaves it alone otherwise', () => {
    expect(state(obs('FREE', 1.5))).toBe('ok 1.5');
    expect(state(obs('FREE', 1.5, { dataType: 'int16' }))).toBe('INVALID_VALUE');
    expect(state(obs('FREE', 1.5, { dataType: 'float32' }))).toBe('ok 1.5');
  });

  it('turns a mistyped flow reading into an invalid rate', () => {
    const flowScene: ScadaScene = { ...scene, runtimeVariables: [variable('FT', 'float32')], tagBindings: [{ id: 'f', tagId: 'FT', kind: 'flow', connectionId: 'c' }] };
    const [reading] = resolveTelemetry(flowScene, [obs('FT', 2, { dataType: 'int32' })], { now: NOW }).flowReadings;
    expect(reading.rate).toBeNaN();
    expect(resolveTelemetry(flowScene, [obs('FT', 2)], { now: NOW }).flowReadings[0].rate).toBe(2);
  });
});
