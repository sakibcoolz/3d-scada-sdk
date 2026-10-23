import { describe, expect, it } from 'vitest';
import { validateScene, type ComponentInstance, type ScadaScene } from '@sakibcoolz/core';
import { builtInRegistry } from '@sakibcoolz/components';
import { addressKind, commitEntry, emptyDataSource, emptyVariable, errorField, removeEntry, toDataSource, toVariable, variableForm } from './tagForms.js';

// The tag editor's form models (ADR-0027, T-089): text fields to typed, read-only variables, errors
// back to their field, and core deciding what may be committed.

const options = builtInRegistry.resolvers;
const tank: ComponentInstance = { id: 'TK', type: 'tank', position: { x: 0, y: 1.535, z: 0 }, rotation: { x: 0, y: 0, z: 0, w: 1 }, scale: { x: 1, y: 1, z: 1 }, properties: {} };
const r = validateScene({ schemaVersion: 4, documentType: 'industrial.scene', units: 'm', components: [tank], connections: [], dataSources: [{ id: 'plc', protocol: 'modbus-tcp' }, { id: 'ua', protocol: 'opcua' }] }, options);
if (!r.ok) throw new Error(JSON.stringify(r.errors));
const scene: ScadaScene = r.scene;

describe('variable forms', () => {
  it('builds a Modbus variable with typed numbers and only the fields given', () => {
    const built = toVariable({ ...emptyVariable(), id: 'LT-101', componentId: 'TK', unit: '%', dataSourceId: 'plc', address: '40', unitId: '1', wordOrder: 'low-first' }, 'modbus-tcp');
    expect(built).toEqual({ variable: { id: 'LT-101', componentId: 'TK', dataType: 'float32', unit: '%', access: 'read', source: { dataSourceId: 'plc', address: { area: 'holding', address: 40, unitId: 1, wordOrder: 'low-first' } } } });
  });

  it('builds OPC UA, host and namespaced addresses, and reports bad JSON on its field', () => {
    expect(toVariable({ ...emptyVariable(), id: 'A', dataSourceId: 'ua', nodeId: 'ns=2;s=L' }, 'opcua')).toMatchObject({ variable: { source: { address: { nodeId: 'ns=2;s=L' } } } });
    expect(toVariable({ ...emptyVariable(), id: 'A', dataSourceId: 'h' }, 'host')).toEqual({ variable: { id: 'A', dataType: 'float32', access: 'read', source: { dataSourceId: 'h' } } });
    expect(toVariable({ ...emptyVariable(), id: 'A', dataSourceId: 'x', rawAddress: '{"register": 4}' }, 'com.example.bus')).toMatchObject({ variable: { source: { address: { register: 4 } } } });
    expect(toVariable({ ...emptyVariable(), id: 'A', dataSourceId: 'x', rawAddress: '{nope' }, 'com.example.bus')).toEqual({ field: 'rawAddress', message: 'Expected an address as JSON, e.g. {"register": 4}.' });
    expect(['modbus-rtu', 'opcua', 'host', undefined, 'com.example.bus'].map(addressKind)).toEqual(['modbus', 'opcua', 'none', 'none', 'json']);
  });

  it('round-trips through the form, scaling included', () => {
    const v = { id: 'FT', dataType: 'float32' as const, unit: 'm³/h', access: 'read' as const, source: { dataSourceId: 'plc', variable: 'F1', address: { area: 'input' as const, address: 7, unitId: 2, bit: 3 } }, scaling: { kind: 'linear' as const, rawMin: 0, rawMax: 27648, min: 0, max: 100 } };
    expect(toVariable(variableForm(v), 'modbus-tcp')).toEqual({ variable: v });
  });
});

describe('committing', () => {
  it('commits a valid variable and refuses an invalid one, naming the field', () => {
    const ok = toVariable({ ...emptyVariable(), id: 'LT', dataSourceId: 'plc', address: '0' }, 'modbus-tcp');
    if (!('variable' in ok)) throw new Error('form');
    const committed = commitEntry(scene, 'runtimeVariables', undefined, ok.variable, options);
    expect(committed.ok && committed.scene.runtimeVariables?.map((v) => v.id)).toEqual(['LT']);

    const bad = toVariable({ ...emptyVariable(), id: 'LT2', dataSourceId: 'plc', address: '70000', unitId: 'x' }, 'modbus-tcp');
    if (!('variable' in bad)) throw new Error('form');
    const refused = commitEntry(scene, 'runtimeVariables', undefined, bad.variable, options);
    expect(refused.ok).toBe(false);
    if (!refused.ok) expect(Object.keys(refused.errors)).toEqual(expect.arrayContaining(['address', 'unitId']));
  });

  it('refuses an endpoint with credentials on its own field, and a duplicate id on the id', () => {
    const secret = commitEntry(scene, 'dataSources', undefined, toDataSource({ ...emptyDataSource(), id: 'gw', endpointRef: 'modbus://admin:pw@10.0.0.5' }), options);
    expect(secret.ok ? {} : secret.errors).toHaveProperty('endpointRef');
    const duplicate = commitEntry(scene, 'dataSources', undefined, toDataSource({ ...emptyDataSource(), id: 'plc' }), options);
    expect(duplicate.ok ? {} : duplicate.errors).toHaveProperty('id');
  });

  it('maps error paths to fields and removes entries, dropping an emptied list', () => {
    const at = (path: string) => errorField({ code: 'INVALID_FIELD', path, message: '' }, 'runtimeVariables[2]');
    expect([at('runtimeVariables[2].source.address.unitId'), at('runtimeVariables[2].source.address'), at('runtimeVariables[2].unit'), at('runtimeVariables[2]'), at('runtimeVariables[3].id')])
      .toEqual(['unitId', 'address', 'unit', 'id', undefined]);
    // Command limits have their own fields, apart from the scaling's min and max (ADR-0029).
    expect([at('runtimeVariables[2].command.min'), at('runtimeVariables[2].command.step'), at('runtimeVariables[2].command'), at('runtimeVariables[2].scaling.min')]).toEqual(['commandMin', 'commandStep', 'access', 'min']);
    const writable = { ...emptyVariable(), id: 'SP', access: 'readWrite' as const, commandMin: '0', commandMax: '100', commandStep: '', commandConfirm: ' Ramps. ' };
    const built = toVariable(writable, undefined);
    expect('variable' in built && built.variable).toMatchObject({ access: 'readWrite', command: { min: 0, max: 100, confirm: 'Ramps.' } });
    expect('variable' in built && variableForm(built.variable)).toMatchObject({ access: 'readWrite', commandMin: '0', commandMax: '100', commandStep: '', commandConfirm: 'Ramps.' });
    const one = removeEntry(scene, 'dataSources', 0);
    expect(one.dataSources?.map((s) => s.id)).toEqual(['ua']);
    expect('dataSources' in removeEntry(one, 'dataSources', 0)).toBe(false);
  });
});
