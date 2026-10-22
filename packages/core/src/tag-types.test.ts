import { describe, expect, it } from 'vitest';
import {
  projectAcquisition,
  resolveFlow,
  resolveTelemetry,
  serializeScene,
  validateScene,
  type ComponentType,
  type ConnectionPort,
  type Observation,
  type Quantity,
  type SceneValidationOptions,
} from './index.js';

// Bindings meet runtime variables, DISCONNECTED quality, and the acquisition projection (ADR-0024, T-078).

const bindable: Record<string, Record<string, Quantity>> = {
  'com.example.tank': { level: 'percent', temperature: 'temperature' },
  'com.example.valve': { open: 'boolean' },
};
const fluid = (id: string, x: number, dx: number): ConnectionPort => ({ id, kind: 'fluid', position: [x, 0, 0], direction: [dx, 0, 0] });
const options: SceneValidationOptions = {
  resolvePorts: (t: ComponentType) => (t === 'com.example.tank' ? [fluid('out', 0.5, 1)] : [fluid('in', -0.5, -1)]),
  resolveType: (t) => t in bindable,
  resolveBindable: (t) => bindable[t],
};
const part = (id: string, type: string, x: number) => ({ id, type, position: { x, y: 0, z: 0 }, rotation: { x: 0, y: 0, z: 0, w: 1 }, scale: { x: 1, y: 1, z: 1 }, properties: {} });
const variable = (id: string, dataType: string, unit?: string) => ({ id, dataType, ...(unit !== undefined ? { unit } : {}), access: 'read' });
const doc = (tagBindings: unknown[], runtimeVariables: unknown[]) => ({
  schemaVersion: 4,
  documentType: 'industrial.scene',
  units: 'm',
  components: [part('T', 'com.example.tank', 0), part('V', 'com.example.valve', 2)],
  connections: [{ id: 'c', from: { instanceId: 'T', portId: 'out' }, to: { instanceId: 'V', portId: 'in' } }],
  runtimeVariables,
  tagBindings,
});
const level = (tagId = 'LT', unit?: string) => ({ id: 'b-level', tagId, kind: 'property', instanceId: 'T', property: 'level', ...(unit ? { unit } : {}) });
const open = (tagId = 'XV') => ({ id: 'b-open', tagId, kind: 'property', instanceId: 'V', property: 'open' });
const flow = (tagId = 'FT') => ({ id: 'b-flow', tagId, kind: 'flow', connectionId: 'c' });
const errors = (input: unknown, opts = options) => {
  const r = validateScene(input, opts);
  return r.ok ? [] : r.errors.map((e) => [e.code, e.path]);
};

describe('a binding to a described tag', () => {
  const numeric = ['int16', 'uint16', 'int32', 'uint32', 'float32', 'float64'];

  it.each(numeric)('accepts %s for numbers and refuses it for a bool', (dataType) => {
    expect(errors(doc([level(), flow()], [variable('LT', dataType, '%'), variable('FT', dataType, 'm³/h')]))).toEqual([]);
    expect(errors(doc([open()], [variable('XV', dataType)]))).toEqual([['TYPE_MISMATCH', 'tagBindings[0].tagId']]);
  });

  it('accepts bool only for booleans, and string for nothing', () => {
    expect(errors(doc([open()], [variable('XV', 'bool')]))).toEqual([]);
    expect(errors(doc([level()], [variable('LT', 'bool')]))).toEqual([['TYPE_MISMATCH', 'tagBindings[0].tagId']]);
    expect(errors(doc([flow()], [variable('FT', 'string')]))).toEqual([['TYPE_MISMATCH', 'tagBindings[0].tagId']]);
    const r = validateScene(doc([open()], [variable('XV', 'float32')]), options);
    expect(r.ok ? '' : r.errors[0].message).toBe('Tag "XV" is float32, but this binding needs a bool.');
  });

  it('checks the tag’s unit when the binding gives none, and lets the binding’s own unit win', () => {
    expect(errors(doc([level()], [variable('LT', 'float32', 'mm')]))).toEqual([['INVALID_UNIT', 'tagBindings[0].tagId']]);
    expect(errors(doc([level('LT', '%')], [variable('LT', 'float32', 'mm')]))).toEqual([]);
    expect(errors(doc([level()], [variable('LT', 'float32', '%')]))).toEqual([]);
  });

  it('without resolveBindable, still refuses a string tag', () => {
    const plain = { ...options, resolveBindable: undefined };
    expect(errors(doc([level()], [variable('LT', 'float32', 'mm')]), plain)).toEqual([]);
    expect(errors(doc([level()], [variable('LT', 'string')]), plain)).toEqual([['TYPE_MISMATCH', 'tagBindings[0].tagId']]);
  });

  it('leaves a binding to an undescribed (opaque host) tag valid, as before', () => {
    expect(errors(doc([level('HOST-TAG-7')], [variable('LT', 'bool')]))).toEqual([]);
  });
});

describe('DISCONNECTED quality', () => {
  const now = Date.parse('2026-10-22T12:00:00Z');
  const at = new Date(now - 1000).toISOString();
  const scene = (() => {
    const temperature = { id: 'b-temp', tagId: 'TT', kind: 'property', instanceId: 'T', property: 'temperature' };
    const r = validateScene(doc([level(), temperature, flow()], [variable('LT', 'float32', '%'), variable('TT', 'float32', 'K'), variable('FT', 'float32', 'm³/h')]), options);
    if (!r.ok) throw new Error(JSON.stringify(r.errors));
    return r.scene;
  })();
  const observe = (tagId: string, value: number, quality: Observation['quality']): Observation => ({ tagId, value, quality, sourceTimestamp: at });

  it('makes a property unknown, never showing the last value as current', () => {
    const t = resolveTelemetry(scene, [observe('LT', 0.5, 'DISCONNECTED')], { now, resolveBindable: options.resolveBindable });
    expect(t.properties[0]).toEqual(expect.objectContaining({ status: 'unknown', reason: 'DISCONNECTED', quality: 'DISCONNECTED' }));
  });

  it('makes a flow unknown', () => {
    const t = resolveTelemetry(scene, [observe('FT', 36, 'DISCONNECTED')], { now });
    expect(resolveFlow(scene, t.flowReadings, { now }).states[0]).toEqual(expect.objectContaining({ direction: 'unknown', reason: 'DISCONNECTED' }));
  });

  it('uses the tag’s unit when neither the observation nor the binding gives one', () => {
    const t = resolveTelemetry(scene, [observe('TT', 300, 'GOOD'), observe('FT', 36, 'GOOD')], { now, resolveBindable: options.resolveBindable });
    expect(t.properties[1].status === 'ok' && t.properties[1].value).toBeCloseTo(26.85, 9);
    expect(t.flowReadings[0].rate).toBeCloseTo(0.01, 12);
  });
});

describe('projectAcquisition', () => {
  const r = validateScene(
    {
      schemaVersion: 4,
      documentType: 'industrial.scene',
      units: 'm',
      project: { id: 'plant-7', revision: '12' },
      components: [part('T', 'com.example.tank', 0)],
      connections: [],
      dataSources: [{ id: 'ds-plc', name: 'PLC', protocol: 'modbus-tcp', deviceId: 'T', endpointRef: 'host:plc', properties: { pollMs: 500 } }],
      runtimeVariables: [
        { id: 'LT', name: 'Level', componentId: 'T', dataType: 'float32', unit: '%', access: 'read', source: { dataSourceId: 'ds-plc', address: { area: 'holding', address: 40, unitId: 1 } }, scaling: { kind: 'linear', rawMin: 0, rawMax: 27648, min: 0, max: 100 } },
        { id: 'MANUAL', dataType: 'bool', access: 'read' },
        { id: 'RUN', dataType: 'bool', access: 'read', source: { dataSourceId: 'ds-plc', variable: 'Q0.0', address: { area: 'coil', address: 0, unitId: 1 } } },
      ],
    },
    options,
  );
  if (!r.ok) throw new Error(JSON.stringify(r.errors));
  const scene = r.scene;

  it('gives the gateway sources and sourced variables only, in scene order, with the revision', () => {
    expect(projectAcquisition(scene)).toEqual({
      sourceRevision: '12',
      dataSources: [{ id: 'ds-plc', name: 'PLC', protocol: 'modbus-tcp', deviceId: 'T', endpointRef: 'host:plc', properties: { pollMs: 500 } }],
      variables: [
        { tagId: 'LT', dataSourceId: 'ds-plc', dataType: 'float32', unit: '%', address: { address: 40, area: 'holding', unitId: 1 }, scaling: { kind: 'linear', rawMin: 0, rawMax: 27648, min: 0, max: 100 }, access: 'read' },
        { tagId: 'RUN', dataSourceId: 'ds-plc', dataType: 'bool', variable: 'Q0.0', address: { address: 0, area: 'coil', unitId: 1 }, access: 'read' },
      ],
    });
  });

  it('is deterministic and shares nothing with the scene', () => {
    const a = projectAcquisition(scene);
    expect(JSON.stringify(projectAcquisition(scene))).toBe(JSON.stringify(a));
    (a.variables[0].address as { address: number }).address = 99;
    a.dataSources[0].properties!.pollMs = 1;
    expect(serializeScene(scene)).toContain('"address": 40');
    expect(scene.dataSources![0].properties!.pollMs).toBe(500);
  });

  it('is empty for a scene without acquisition', () => {
    expect(projectAcquisition({ schemaVersion: 4, documentType: 'industrial.scene', units: 'm', components: [], connections: [] })).toEqual({ dataSources: [], variables: [] });
  });
});
