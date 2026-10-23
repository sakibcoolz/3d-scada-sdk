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

describe('hostile form input (T-096)', () => {
  it('never throws, and commits only what validation keeps', () => {
    const pieces = ['', ' ', '0', '1', '-1', '0x10', '1e3', '65536', 'NaN', '{}', '[]', '{"__proto__":{"polluted":true}}', '{"a":', '<script>', 'holding', 'coil', 'big', 'ns=2;s=X', 'user:pass@', 'password', '\u0000', 'é'.repeat(300)];
    const fields = ['id', 'name', 'unit', 'variable', 'area', 'address', 'unitId', 'byteOrder', 'wordOrder', 'bit', 'nodeId', 'namespaceUri', 'rawAddress', 'rawMin', 'rawMax', 'min', 'max', 'commandMin', 'commandMax', 'commandStep', 'commandConfirm'] as const;
    let seed = 7;
    const next = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
    const pick = <T,>(list: readonly T[]) => list[Math.floor(next() * list.length)];
    let committed = 0;
    for (let i = 0; i < 2000; i++) {
      const form = { ...emptyVariable(), id: `V${i}`, dataSourceId: pick(['', 'plc', 'ua']), dataType: pick(['bool', 'int16', 'float32', 'string'] as const), access: pick(['read', 'readWrite'] as const), scaling: next() < 0.3 };
      for (const f of fields) if (next() < 0.4) (form as Record<string, unknown>)[f] = pick(pieces);
      const protocol = form.dataSourceId === 'plc' ? 'modbus-tcp' : form.dataSourceId === 'ua' ? 'opcua' : undefined;
      let made: ReturnType<typeof toVariable> | undefined;
      expect(() => (made = toVariable(form, protocol)), `iteration ${i}`).not.toThrow();
      const made2 = made as ReturnType<typeof toVariable>;
      if (!('variable' in made2)) continue;
      const { variable } = made2;
      let result: ReturnType<typeof commitEntry> | undefined;
      expect(() => (result = commitEntry(scene, 'runtimeVariables', undefined, variable, options)), `iteration ${i}`).not.toThrow();
      if (!result!.ok) continue;
      committed++;
      const checked = validateScene(result!.scene, options);
      expect(checked.ok && checked.scene, `iteration ${i}`).toEqual(result!.scene);
    }
    expect(committed).toBeGreaterThan(50);
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });

  it('keeps hex and binary limits as text, so validation refuses them', () => {
    const made = toVariable({ ...emptyVariable(), id: 'SP', dataSourceId: 'plc', area: 'holding', address: '1', unitId: '1', dataType: 'float32', access: 'readWrite', commandMin: '0x0', commandMax: '0b11' }, 'modbus-tcp');
    if (!('variable' in made)) throw new Error('expected a variable');
    expect(made.variable.command).toEqual({ min: '0x0', max: '0b11' });
    const result = commitEntry(scene, 'runtimeVariables', undefined, made.variable, options);
    expect(result.ok ? {} : result.errors).toMatchObject({ commandMin: expect.any(String) });
  });
});
