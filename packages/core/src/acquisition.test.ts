import { describe, expect, it } from 'vitest';
import { parseScene, removeComponent, serializeScene, validateScene, type ComponentType, type ConnectionPort, type ScadaScene, type SceneValidationOptions } from './index.js';

// Data sources and runtime variables (ADR-0024, T-077).

const options: SceneValidationOptions = { resolvePorts: (_t: ComponentType): ConnectionPort[] => [], resolveType: (t) => t.startsWith('com.example.') };
const part = (id: string) => ({ id, type: 'com.example.box', position: { x: 0, y: 0, z: 0 }, rotation: { x: 0, y: 0, z: 0, w: 1 }, scale: { x: 1, y: 1, z: 1 }, properties: {} });
const plc = { id: 'ds-plc', protocol: 'modbus-tcp', deviceId: 'PLC-01', endpointRef: 'host:gateway-3/plc-01' };
const ua = { id: 'ds-ua', protocol: 'opcua' };
const host = { id: 'ds-host', protocol: 'host' };
const modbus = (address: object, dataType = 'float32') => ({ id: 'V', dataType, access: 'read', source: { dataSourceId: 'ds-plc', address: { area: 'holding', address: 40, unitId: 1, ...address } } });
const doc = (dataSources: unknown[] | undefined, runtimeVariables: unknown[] | undefined, extra: object = {}) => ({
  schemaVersion: 4,
  documentType: 'industrial.scene',
  units: 'm',
  components: [part('PLC-01'), part('T-101')],
  connections: [],
  ...(dataSources ? { dataSources } : {}),
  ...(runtimeVariables ? { runtimeVariables } : {}),
  ...extra,
});
const errors = (input: unknown, opts: SceneValidationOptions = options) => {
  const r = validateScene(input, opts);
  return r.ok ? [] : r.errors.map((e) => [e.code, e.path]);
};

describe('reading and writing', () => {
  const level = {
    scaling: { max: 100, min: 0, rawMax: 27648, rawMin: 0, kind: 'linear' },
    source: { address: { wordOrder: 'high-first', unitId: 1, area: 'holding', address: 40, byteOrder: 'big' }, variable: 'DB1.Level', dataSourceId: 'ds-plc' },
    access: 'read',
    unit: '%',
    dataType: 'float32',
    componentId: 'T-101',
    name: 'Tank level',
    id: 'LT-101',
  };

  it('keeps every field, in canonical order, and round-trips byte-stable', () => {
    const r = validateScene(doc([{ properties: { pollMs: 500 }, endpointRef: 'host:plc', deviceId: 'PLC-01', protocol: 'modbus-tcp', name: 'PLC', id: 'ds-plc' }], [level]), options);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const text = serializeScene(r.scene);
    const written = JSON.parse(text);
    expect(Object.keys(written)).toEqual(['schemaVersion', 'documentType', 'units', 'components', 'connections', 'dataSources', 'runtimeVariables']);
    expect(Object.keys(written.dataSources[0])).toEqual(['id', 'name', 'protocol', 'deviceId', 'endpointRef', 'properties']);
    expect(Object.keys(written.runtimeVariables[0])).toEqual(['id', 'name', 'componentId', 'dataType', 'unit', 'access', 'source', 'scaling']);
    expect(Object.keys(written.runtimeVariables[0].source)).toEqual(['dataSourceId', 'variable', 'address']);
    expect(Object.keys(written.runtimeVariables[0].source.address)).toEqual(['address', 'area', 'byteOrder', 'unitId', 'wordOrder']);
    expect(Object.keys(written.runtimeVariables[0].scaling)).toEqual(['kind', 'rawMin', 'rawMax', 'min', 'max']);
    const again = parseScene(text, options);
    expect(again.ok && serializeScene(again.scene)).toBe(text);
  });

  it('accepts a variable with no source, an OPC UA node, a host source and a host protocol', () => {
    expect(errors(doc([ua, host, { id: 'ds-x', protocol: 'com.vendor.bus' }], [
      { id: 'A', dataType: 'string', access: 'read' },
      { id: 'B', dataType: 'bool', access: 'read', source: { dataSourceId: 'ds-ua', address: { nodeId: 'ns=2;s=XV101.Open', namespaceUri: 'urn:line2' } } },
      { id: 'C', dataType: 'float64', access: 'read', source: { dataSourceId: 'ds-host', variable: 'line2/speed' } },
      { id: 'D', dataType: 'int32', access: 'read', source: { dataSourceId: 'ds-x', address: { slot: 3, word: [1, 2] } } },
    ]))).toEqual([]);
  });

  it('rejects the sections in version 3 files', () => {
    expect(errors({ schemaVersion: 3, units: 'm', components: [], connections: [], dataSources: [] })).toEqual([['UNKNOWN_FIELD', 'dataSources']]);
  });
});

describe('data sources', () => {
  it('rejects unknown protocols, duplicates and unknown devices', () => {
    expect(errors(doc([{ ...plc, protocol: 'profibus' }], []))).toEqual([['INVALID_FIELD', 'dataSources[0].protocol']]);
    expect(errors(doc([plc, plc], []))).toEqual([['DUPLICATE_DATA_SOURCE_ID', 'dataSources[1].id']]);
    expect(errors(doc([{ ...plc, deviceId: 'PLC-99' }], []))).toEqual([['UNKNOWN_INSTANCE', 'dataSources[0].deviceId']]);
  });

  it('never holds credentials', () => {
    expect(errors(doc([{ ...plc, endpointRef: 'opc.tcp://operator:hunter2@10.0.0.5:4840' }], []))).toEqual([['SECRET_FIELD', 'dataSources[0].endpointRef']]);
    expect(errors(doc([{ ...plc, endpointRef: 'modbus://user@plc' }], []))).toEqual([['SECRET_FIELD', 'dataSources[0].endpointRef']]);
    expect(errors(doc([{ ...plc, endpointRef: 'opc.tcp://10.0.0.5:4840/ua?x=a@b' }], []))).toEqual([]);
    expect(errors(doc([{ ...plc, properties: { password: 'x' } }], []))).toEqual([['SECRET_FIELD', 'dataSources[0].properties.password']]);
  });
});

describe('runtime variables', () => {
  it('rejects malformed variables', () => {
    expect(errors(doc([], [{ id: 'V', dataType: 'double', access: 'read' }]))).toEqual([['INVALID_FIELD', 'runtimeVariables[0].dataType']]);
    expect(errors(doc([], [{ id: 'V', dataType: 'bool', access: 'write' }]))).toEqual([['INVALID_FIELD', 'runtimeVariables[0].access']]);
    expect(errors(doc([], [{ id: 'V', dataType: 'bool' }]))).toEqual([['INVALID_FIELD', 'runtimeVariables[0].access']]);
    expect(errors(doc([], [{ id: 'V', dataType: 'bool', access: 'read', unit: 'x'.repeat(33) }]))).toEqual([['INVALID_FIELD', 'runtimeVariables[0].unit']]);
    expect(errors(doc([], [{ id: 'V', dataType: 'bool', access: 'read', alarm: {} }]))).toEqual([['UNKNOWN_FIELD', 'runtimeVariables[0].alarm']]);
  });

  it('checks scaling', () => {
    const scaled = (scaling: object) => doc([], [{ id: 'V', dataType: 'int16', access: 'read', scaling }]);
    expect(errors(scaled({ kind: 'linear', rawMin: 0, rawMax: 0, min: 0, max: 1 }))).toEqual([['INVALID_FIELD', 'runtimeVariables[0].scaling.rawMax']]);
    expect(errors(scaled({ kind: 'log', rawMin: 0, rawMax: 1, min: 0, max: 1 }))).toEqual([['INVALID_FIELD', 'runtimeVariables[0].scaling.kind']]);
    expect(errors(scaled({ kind: 'linear', rawMin: 0, rawMax: 1, min: 0 }))).toEqual([['INVALID_FIELD', 'runtimeVariables[0].scaling.max']]);
  });

  it('checks references and uniqueness', () => {
    expect(errors(doc([plc], [modbus({}), modbus({})]))).toEqual([['DUPLICATE_VARIABLE_ID', 'runtimeVariables[1].id']]);
    expect(errors(doc([plc], [{ ...modbus({}), componentId: 'nope' }]))).toEqual([['UNKNOWN_INSTANCE', 'runtimeVariables[0].componentId']]);
    expect(errors(doc([], [modbus({})]))).toEqual([['UNKNOWN_DATA_SOURCE', 'runtimeVariables[0].source.dataSourceId']]);
  });
});

describe('addresses', () => {
  const addressErrors = (address: object, dataType?: string) => errors(doc([plc], [modbus(address, dataType)]));

  it('accepts every Modbus area with a fitting data type', () => {
    expect(addressErrors({ area: 'coil' }, 'bool')).toEqual([]);
    expect(addressErrors({ area: 'discrete' }, 'bool')).toEqual([]);
    expect(addressErrors({ area: 'input', bit: 15 }, 'bool')).toEqual([]);
    expect(addressErrors({ address: 65532 }, 'float64')).toEqual([]);
    expect(addressErrors({ unitId: 0, byteOrder: 'little', wordOrder: 'low-first' }, 'uint32')).toEqual([]);
  });

  it('refuses every Modbus rule violation', () => {
    const at = (field: string) => [['INVALID_ADDRESS', `runtimeVariables[0].source.address${field}`]];
    expect(addressErrors({ area: 'coil' }, 'float32')).toEqual(at('.area'));
    expect(addressErrors({ area: 'register' })).toEqual(at('.area'));
    expect(addressErrors({ address: 65535 }, 'float32')).toEqual(at('.address'));
    expect(addressErrors({ address: -1 })).toEqual(at('.address'));
    expect(addressErrors({ address: 1.5 })).toEqual(at('.address'));
    expect(addressErrors({ unitId: 256 })).toEqual(at('.unitId'));
    expect(addressErrors({ bit: 3 }, 'int16')).toEqual(at('.bit'));
    expect(addressErrors({ area: 'coil', bit: 3 }, 'bool')).toEqual(at('.bit'));
    expect(addressErrors({ bit: 16 }, 'bool')).toEqual(at('.bit'));
    expect(addressErrors({ byteOrder: 'middle' })).toEqual(at('.byteOrder'));
    expect(addressErrors({}, 'string')).toEqual(at(''));
    expect(addressErrors({ register: 4 })).toEqual(at('.register'));
    expect(errors(doc([plc], [{ id: 'V', dataType: 'int16', access: 'read', source: { dataSourceId: 'ds-plc' } }]))).toEqual(at(''));
  });

  it('checks OPC UA and host addresses', () => {
    const on = (dataSourceId: string, address?: object) => doc([ua, host], [{ id: 'V', dataType: 'int16', access: 'read', source: { dataSourceId, ...(address ? { address } : {}) } }]);
    expect(errors(on('ds-ua', { nodeId: '' }))).toEqual([['INVALID_ADDRESS', 'runtimeVariables[0].source.address.nodeId']]);
    expect(errors(on('ds-ua', { nodeId: 'ns=2;i=7', area: 'holding' }))).toEqual([['INVALID_ADDRESS', 'runtimeVariables[0].source.address.area']]);
    expect(errors(on('ds-ua'))).toEqual([['INVALID_ADDRESS', 'runtimeVariables[0].source.address']]);
    expect(errors(on('ds-host', { nodeId: 'x' }))).toEqual([['INVALID_ADDRESS', 'runtimeVariables[0].source.address']]);
    expect(errors(doc([ua], [{ id: 'V', dataType: 'int16', access: 'read', source: { dataSourceId: 'ds-ua', address: 'ns=2;i=7' } }]))).toEqual([['INVALID_ADDRESS', 'runtimeVariables[0].source.address']]);
  });

  it('passes a host protocol’s address to validateAddress, and still refuses credentials in it', () => {
    const custom = (address: object) => doc([{ id: 'ds-x', protocol: 'com.vendor.bus' }], [{ id: 'V', dataType: 'int16', access: 'read', source: { dataSourceId: 'ds-x', address } }]);
    const seen: unknown[] = [];
    const strict: SceneValidationOptions = { ...options, validateAddress: (protocol, address) => (seen.push([protocol, address]), (address as { slot?: number }).slot === 3 ? [] : ['slot must be 3']) };
    expect(errors(custom({ slot: 3 }), strict)).toEqual([]);
    expect(seen).toEqual([['com.vendor.bus', { slot: 3 }]]);
    const r = validateScene(custom({ slot: 4 }), strict);
    expect(r.ok ? [] : r.errors.map((e) => [e.code, e.message])).toEqual([['INVALID_ADDRESS', 'slot must be 3']]);
    expect(errors(custom({ slot: 3, auth: { apiKey: 'x' } }))).toEqual([['SECRET_FIELD', 'runtimeVariables[0].source.address.auth.apiKey']]);
  });
});

describe('limits and removal', () => {
  it('enforce maxDataSources and maxVariables', () => {
    expect(errors(doc([plc, { ...plc, id: 'b' }], []), { ...options, limits: { maxDataSources: 1 } })).toEqual([['LIMIT_EXCEEDED', 'dataSources']]);
    expect(errors(doc([], [{ id: 'a', dataType: 'bool', access: 'read' }, { id: 'b', dataType: 'bool', access: 'read' }]), { ...options, limits: { maxVariables: 1 } })).toEqual([['LIMIT_EXCEEDED', 'runtimeVariables']]);
  });

  it('give each address its own value budget, apart from extensions (T-095)', () => {
    // Addresses once shared the document's extension budget, so about 2,500 Modbus variables were refused.
    const many = Array.from({ length: 5_000 }, (_, i) => ({ ...modbus({ address: i }), id: `V${i}` }));
    expect(errors(doc([plc], many))).toEqual([]);
    const host = { id: 'ds-host', protocol: 'com.example.bus' };
    const big = { id: 'B', dataType: 'float32', access: 'read', source: { dataSourceId: 'ds-host', address: { path: Array.from({ length: 64 }, (_, i) => i) } } };
    expect(validateScene(doc([host], [big]), options)).toEqual({ ok: false, errors: [{ code: 'LIMIT_EXCEEDED', path: 'runtimeVariables[0].source.address.path[62]', message: 'An address holds more than 64 values.' }] });
  });

  it('removing a component keeps sources and variables but drops their link to it', () => {
    const r = validateScene(doc([plc], [{ ...modbus({}), componentId: 'PLC-01' }, { id: 'W', componentId: 'T-101', dataType: 'bool', access: 'read' }]), options);
    if (!r.ok) throw new Error(JSON.stringify(r.errors));
    const removed = removeComponent(r.scene, 'PLC-01');
    if (!removed.ok) throw new Error('remove');
    const scene: ScadaScene = removed.scene;
    expect(scene.dataSources).toEqual([{ id: 'ds-plc', protocol: 'modbus-tcp', endpointRef: 'host:gateway-3/plc-01' }]);
    expect(scene.runtimeVariables?.map((v) => [v.id, v.componentId])).toEqual([['V', undefined], ['W', 'T-101']]);
    expect(validateScene(scene, options).ok).toBe(true);
  });
});
