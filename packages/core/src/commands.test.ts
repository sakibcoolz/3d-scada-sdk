import { describe, expect, it } from 'vitest';
import { parseScene, projectAcquisition, serializeScene, validateScene, type ComponentType, type ConnectionPort, type SceneValidationOptions } from './index.js';

// Writable variables (ADR-0029 §2, T-093): limits are mandatory, strings cannot be commanded, and the
// projection carries the limits to the gateway, which must enforce them itself.

const options: SceneValidationOptions = { resolvePorts: (_t: ComponentType): ConnectionPort[] => [] };
const plc = { id: 'ds-plc', protocol: 'modbus-tcp', endpointRef: 'host:gw/plc' };
const source = (address = 60) => ({ dataSourceId: 'ds-plc', address: { area: 'holding', address, unitId: 1 } });
const doc = (variable: object) => ({ schemaVersion: 4, documentType: 'industrial.scene', units: 'm', components: [], connections: [], dataSources: [plc], runtimeVariables: [variable] });
const errors = (variable: object) => {
  const r = validateScene(doc(variable), options);
  return r.ok ? [] : r.errors.map((e) => [e.code, e.path]);
};
const sp = { id: 'SP', dataType: 'float32', unit: '%', access: 'readWrite', source: source() };
const run = { id: 'RUN', dataType: 'bool', access: 'readWrite', source: { dataSourceId: 'ds-plc', address: { area: 'coil', address: 1, unitId: 1 } } };

describe('writable variables', () => {
  it('accepts bounded numeric and on/off variables, and keeps their limits in canonical order', () => {
    expect(errors({ ...sp, command: { step: 0.5, max: 90, min: 10, confirm: 'Changes the level.' } })).toEqual([]);
    expect(errors({ ...run, command: {} })).toEqual([]);
    expect(errors({ ...run, command: { confirm: 'Starts the pump.' } })).toEqual([]);
    const r = parseScene(JSON.stringify(doc({ ...sp, command: { step: 0.5, max: 90, min: 10 } })), options);
    expect(r.ok && serializeScene(r.scene)).toContain('"command": {\n        "min": 10,\n        "max": 90,\n        "step": 0.5\n      }');
  });

  it('needs limits, a source, and a commandable type', () => {
    expect(errors(sp)).toEqual([['INVALID_FIELD', 'runtimeVariables[0].command']]);
    expect(errors({ ...sp, command: { min: 0 } })).toEqual([['INVALID_FIELD', 'runtimeVariables[0].command.max']]);
    expect(errors({ ...sp, command: { max: 1 } })).toEqual([['INVALID_FIELD', 'runtimeVariables[0].command.min']]);
    expect(errors({ id: 'SP', dataType: 'float32', access: 'readWrite', command: { min: 0, max: 1 } })).toEqual([['INVALID_FIELD', 'runtimeVariables[0].source']]);
    expect(errors({ id: 'S', dataType: 'string', access: 'readWrite', source: { dataSourceId: 'ds-plc' }, command: {} })).toEqual([['INVALID_FIELD', 'runtimeVariables[0].access']]);
  });

  it('refuses limits out of order, outside the data type, a non-positive step, and min/max on on/off', () => {
    expect(errors({ ...sp, command: { min: 5, max: 5 } })).toEqual([['INVALID_FIELD', 'runtimeVariables[0].command.max']]);
    expect(errors({ ...sp, dataType: 'int16', command: { min: -1, max: 40000 } })).toEqual([['INVALID_FIELD', 'runtimeVariables[0].command.max']]);
    expect(errors({ ...sp, dataType: 'uint16', command: { min: -1, max: 10 } })).toEqual([['INVALID_FIELD', 'runtimeVariables[0].command.min']]);
    expect(errors({ ...sp, dataType: 'int16', command: { min: 0.5, max: 10 } })).toEqual([['INVALID_FIELD', 'runtimeVariables[0].command.min']]);
    // A scaled variable is commanded in engineering units.
    expect(errors({ ...sp, dataType: 'int16', scaling: { kind: 'linear', rawMin: 0, rawMax: 27648, min: 0, max: 100 }, command: { min: 0.5, max: 99.5 } })).toEqual([]);
    expect(errors({ ...sp, command: { min: 0, max: 1, step: 0 } })).toEqual([['INVALID_FIELD', 'runtimeVariables[0].command.step']]);
    expect(errors({ ...run, command: { min: 0, max: 1 } })).toEqual([['INVALID_FIELD', 'runtimeVariables[0].command.min'], ['INVALID_FIELD', 'runtimeVariables[0].command.max']]);
  });

  it('rejects limits on a read-only variable, unknown keys, odd values and credential-like text', () => {
    expect(errors({ ...sp, access: 'read', command: { min: 0, max: 1 } })).toEqual([['INVALID_FIELD', 'runtimeVariables[0].command']]);
    expect(errors({ ...sp, command: { min: 0, max: 1, writeNow: true } })).toEqual([['UNKNOWN_FIELD', 'runtimeVariables[0].command.writeNow']]);
    expect(errors({ ...sp, command: { min: '0', max: 1 } })).toEqual([['INVALID_FIELD', 'runtimeVariables[0].command.min']]);
    expect(errors({ ...sp, command: [] })).toEqual([['INVALID_FIELD', 'runtimeVariables[0].command']]);
    expect(errors({ ...sp, command: { min: 0, max: 1, confirm: '' } })).toEqual([['INVALID_FIELD', 'runtimeVariables[0].command.confirm']]);
  });

  it('projects access and limits for the gateway', () => {
    const r = validateScene(doc({ ...sp, command: { min: 10, max: 90 } }), options);
    expect(r.ok && projectAcquisition(r.scene).variables).toEqual([{ tagId: 'SP', dataSourceId: 'ds-plc', dataType: 'float32', unit: '%', address: { area: 'holding', address: 60, unitId: 1 }, access: 'readWrite', command: { min: 10, max: 90 } }]);
  });
});
