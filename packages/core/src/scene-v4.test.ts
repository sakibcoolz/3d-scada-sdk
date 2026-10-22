import { describe, expect, it } from 'vitest';
import { createEmptyScene, parseScene, serializeScene, validateScene, type ConnectionPort, type Quantity, type SceneValidationErrorCode, type SceneValidationOptions } from './index.js';
import { isSecretKey } from './validation.js';

// Scene version 4, the industrial scene document (ADR-0021).

const fluid = (id: string): ConnectionPort => ({ id, kind: 'fluid', position: [0, 0, 0], direction: [1, 0, 0], nominalSize: 0.15 });
const options: SceneValidationOptions = {
  resolvePorts: (t) => (t === 'tank' ? [fluid('inlet'), fluid('outlet')] : t === 'valve' ? [fluid('in'), fluid('out')] : []),
  resolveBindable: (t): Record<string, Quantity> | undefined => (t === 'tank' ? { level: 'percent' } : t === 'valve' ? { open: 'boolean' } : undefined),
};
const I = { x: 0, y: 0, z: 0, w: 1 };
const S = { x: 1, y: 1, z: 1 };
const part = (id: string, type: string, extra: Record<string, unknown> = {}) => ({ id, type, position: { x: 0, y: 0, z: 0 }, rotation: I, scale: S, properties: {}, ...extra });
const v4 = (extra: Record<string, unknown> = {}, components: unknown[] = [part('tank', 'tank')]) => ({
  schemaVersion: 4,
  documentType: 'industrial.scene',
  units: 'm',
  components,
  connections: [],
  ...extra,
});
function codes(input: unknown): [SceneValidationErrorCode, string][] {
  const result = validateScene(input, options);
  return result.ok ? [] : result.errors.map((e) => [e.code, e.path]);
}

describe('scene version 4', () => {
  it('is what an empty scene and the exported constants describe', () => {
    expect(createEmptyScene()).toEqual({ schemaVersion: 4, documentType: 'industrial.scene', units: 'm', components: [], connections: [] });
  });

  it('migrates a version 3 document losslessly and reports it', () => {
    const v3 = {
      schemaVersion: 3,
      units: 'm',
      components: [part('tank', 'tank', { properties: { level: 40 } }), part('valve', 'valve', { parentId: 'tank', position: { x: 1.8, y: 0.6, z: 0 } })],
      connections: [{ id: 'c1', from: { instanceId: 'tank', portId: 'outlet' }, to: { instanceId: 'valve', portId: 'in' } }],
      tagBindings: [{ id: 'b1', tagId: 'LT-1', kind: 'property', instanceId: 'tank', property: 'level', unit: '%' }],
      underlay: { svg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1 1"/>', position: { x: 0, z: 0 }, width: 10, rotation: 0, opacity: 0.5 },
    };
    const result = validateScene(v3, options);
    expect(result).toEqual({ ok: true, migratedFrom: 3, scene: { ...v3, schemaVersion: 4, documentType: 'industrial.scene' } });
    if (!result.ok) return;
    expect(parseScene(serializeScene(result.scene), options)).toEqual({ ok: true, scene: result.scene });
  });

  it('keeps project, identity, labels and extensions, written in canonical order with sorted keys', () => {
    const doc = v4(
      {
        extensions: { 'com.example.app': { zeta: [3, { b: 1, a: -0 }], alpha: null } },
        project: { revision: '12', name: 'Milk line 2', id: 'plant-7', description: 'Hall B' },
      },
      [part('M-101', 'motor', { model: 'IE3-7.5', manufacturer: 'ACME', typeVersion: '1', name: 'Feed pump motor', labels: { area: 'Hall B', assetNumber: 'A-00412' }, extensions: { 'org.plant.maintenance': { interval: 90 } } })],
    );
    const result = validateScene(doc, options);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const text = serializeScene(result.scene);
    // Fixed root and component key order; nested extension keys sorted; -0 written as 0.
    expect(Object.keys(JSON.parse(text))).toEqual(['schemaVersion', 'documentType', 'units', 'project', 'components', 'connections', 'extensions']);
    expect(Object.keys(JSON.parse(text).project)).toEqual(['id', 'name', 'revision', 'description']);
    expect(Object.keys(JSON.parse(text).components[0])).toEqual(['id', 'name', 'type', 'typeVersion', 'manufacturer', 'model', 'position', 'rotation', 'scale', 'properties', 'labels', 'extensions']);
    expect(Object.keys(JSON.parse(text).components[0].labels)).toEqual(['area', 'assetNumber']);
    expect(JSON.stringify(JSON.parse(text).extensions)).toBe('{"com.example.app":{"alpha":null,"zeta":[3,{"a":0,"b":1}]}}');
    // Byte-stable round trip.
    const again = parseScene(text, options);
    expect(again).toEqual({ ok: true, scene: result.scene });
    if (again.ok) expect(serializeScene(again.scene)).toBe(text);
  });

  it('requires the document type on version 4 and rejects version 4 fields in a version 3 file', () => {
    expect(codes({ ...v4(), documentType: undefined })).toEqual([['INVALID_FIELD', 'documentType']]);
    expect(codes({ ...v4(), documentType: 'other.scene' })).toEqual([['INVALID_FIELD', 'documentType']]);
    expect(codes({ schemaVersion: 3, units: 'm', components: [], connections: [], project: { name: 'x' } })).toEqual([['UNKNOWN_FIELD', 'project']]);
    expect(codes({ schemaVersion: 3, units: 'm', components: [part('t', 'tank', { name: 'T' })], connections: [] })).toEqual([['UNKNOWN_FIELD', 'components[0].name']]);
  });

  it('validates project and identity fields', () => {
    expect(codes(v4({ project: { name: '', owner: 'x' } }))).toEqual([
      ['UNKNOWN_FIELD', 'project.owner'],
      ['INVALID_FIELD', 'project.name'],
    ]);
    expect(codes(v4({ project: [] }))).toEqual([['INVALID_FIELD', 'project']]);
    expect(codes(v4({}, [part('t', 'tank', { name: 7, model: 'x'.repeat(1025) })]))).toEqual([
      ['INVALID_FIELD', 'components[0].name'],
      ['LIMIT_EXCEEDED', 'components[0].model'],
    ]);
  });

  it('validates labels and rejects credentials in them', () => {
    expect(codes(v4({}, [part('t', 'tank', { labels: { area: 3, '': 'x', db_password: 'hunter2' } })]))).toEqual([
      ['INVALID_FIELD', 'components[0].labels.area'],
      ['INVALID_FIELD', 'components[0].labels.'],
      ['SECRET_FIELD', 'components[0].labels.db_password'],
    ]);
    const many = Object.fromEntries(Array.from({ length: 65 }, (_, i) => [`k${i}`, 'v']));
    expect(codes(v4({}, [part('t', 'tank', { labels: many })]))).toEqual([['LIMIT_EXCEEDED', 'components[0].labels']]);
  });

  it('validates extensions: namespaces, plain JSON, depth, size, prototype keys and credentials', () => {
    expect(codes(v4({ extensions: { notANamespace: 1 } }))).toEqual([['INVALID_FIELD', 'extensions.notANamespace']]);
    expect(codes(v4({ extensions: { 'com.x': { gateway: { apiKey: 'k' } } } }))).toEqual([['SECRET_FIELD', 'extensions.com.x.gateway.apiKey']]);
    expect(codes(v4({ extensions: { 'com.x': { link: { accessToken: 't' } } } }))).toEqual([['SECRET_FIELD', 'extensions.com.x.link.accessToken']]);
    expect(codes(v4({ extensions: { 'com.x': { n: Number.NaN } } }))).toEqual([['INVALID_FIELD', 'extensions.com.x.n']]);
    expect(codes(v4({ extensions: { 'com.x': { f: () => 1 } } }))).toEqual([['INVALID_FIELD', 'extensions.com.x.f']]);
    const proto = parseScene(JSON.stringify(v4()).replace('"connections":[]', '"connections":[],"extensions":{"com.x":{"__proto__":{"polluted":true}}}'), options);
    expect(proto.ok ? [] : proto.errors.map((e) => [e.code, e.path])).toEqual([['INVALID_FIELD', 'extensions.com.x.__proto__']]);
    expect(Object.prototype).not.toHaveProperty('polluted');
    let deep: unknown = 1;
    for (let i = 0; i < 17; i++) deep = [deep];
    expect(codes(v4({ extensions: { 'com.x': deep } })).map(([c]) => c)).toEqual(['LIMIT_EXCEEDED']);
    expect(codes(v4({ extensions: { 'com.x': Array.from({ length: 10_001 }, () => 0) } })).map(([c]) => c)).toEqual(['LIMIT_EXCEEDED']);
  });

  it('shares one extension value budget between the document and its components', () => {
    const half = Array.from({ length: 5_000 }, () => 0);
    expect(codes(v4({ extensions: { 'com.x': half } }, [part('t', 'tank', { extensions: { 'com.y': half } })])).map(([c]) => c)).toEqual(['LIMIT_EXCEEDED']);
  });
});

describe('isSecretKey', () => {
  it.each(['password', 'Password', 'db_password', 'passwd', 'pwd', 'clientSecret', 'apiKey', 'API-KEY', 'api_key', 'privateKey', 'private-key', 'token', 'accessToken', 'refresh_token', 'credentials'])(
    'flags %s',
    (key) => expect(isSecretKey(key)).toBe(true),
  );
  it.each(['author', 'tokenizer', 'keyboard', 'description', 'assetNumber', 'area', 'endpointRef', 'tokens'])('allows %s', (key) =>
    expect(isSecretKey(key)).toBe(false),
  );
});
