import { describe, expect, it } from 'vitest';
import {
  connect,
  copyComponents,
  parseScene,
  pasteComponents,
  routeScene,
  serializeScene,
  validateScene,
  type ComponentType,
  type ConnectionPort,
  type SceneValidationOptions,
} from './index.js';

// Connection domain, relationship and properties (ADR-0023, T-074).

const port = (id: string, kind: ConnectionPort['kind'], x: number, dx: number, extra: Partial<ConnectionPort> = {}): ConnectionPort =>
  ({ id, kind, position: [x, 0, 0], direction: [dx, 0, 0], ...extra });
const portsOf: Record<string, ConnectionPort[]> = {
  'com.example.vessel': [port('out', 'fluid', 0.5, 1, { nominalSize: 0.1 })],
  'com.example.valve': [port('in', 'fluid', -0.5, -1, { nominalSize: 0.1 })],
  'com.example.plc': [port('do0', 'signal', 0.5, 1, { signal: { type: 'DO' } })],
  'com.example.vfd': [port('run', 'signal', -0.5, -1, { signal: { type: 'DI' } })],
};
const options: SceneValidationOptions = { resolvePorts: (t: ComponentType) => portsOf[t], resolveType: (t) => t in portsOf };
const part = (id: string, type: string, x: number) => ({ id, type, position: { x, y: 0, z: 0 }, rotation: { x: 0, y: 0, z: 0, w: 1 }, scale: { x: 1, y: 1, z: 1 }, properties: {} });
const parts = [part('T', 'com.example.vessel', 0), part('V', 'com.example.valve', 3), part('PLC', 'com.example.plc', 0), part('VFD', 'com.example.vfd', 3)];
const doc = (connections: unknown[], schemaVersion = 4) => ({
  schemaVersion,
  ...(schemaVersion === 4 ? { documentType: 'industrial.scene' } : {}),
  units: 'm',
  components: parts,
  connections,
});
const pipe = { id: 'c1', from: { instanceId: 'T', portId: 'out' }, to: { instanceId: 'V', portId: 'in' } };
const wire = { id: 'c2', from: { instanceId: 'PLC', portId: 'do0' }, to: { instanceId: 'VFD', portId: 'run' } };
const errors = (input: unknown) => {
  const r = validateScene(input, options);
  return r.ok ? [] : r.errors.map((e) => [e.code, e.path]);
};

describe('reading and writing the new connection fields', () => {
  it('keeps domain, relationship and properties, writes them in canonical order, and round-trips byte-stable', () => {
    const edge = { properties: { lengthM: 12, cable: 'LiYCY 2x0.75' }, to: wire.to, from: wire.from, relationship: 'controls', domain: 'signal', id: 'c2' };
    const r = validateScene(doc([pipe, edge]), options);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.scene.connections[1]).toEqual({ id: 'c2', domain: 'signal', relationship: 'controls', from: wire.from, to: wire.to, properties: { cable: 'LiYCY 2x0.75', lengthM: 12 } });
    const text = serializeScene(r.scene);
    const written = JSON.parse(text).connections;
    expect(Object.keys(written[1])).toEqual(['id', 'domain', 'relationship', 'from', 'to', 'properties']);
    expect(Object.keys(written[1].properties)).toEqual(['cable', 'lengthM']);
    // An edge without the fields is written exactly as before: nothing is derived into the file.
    expect(Object.keys(written[0])).toEqual(['id', 'from', 'to']);
    const again = parseScene(text, options);
    expect(again.ok && serializeScene(again.scene)).toBe(text);
  });

  it('accepts a namespaced host relationship', () => {
    expect(errors(doc([{ ...wire, relationship: 'com.example.supervises' }]))).toEqual([]);
  });

  it('rejects unknown domains and relationships, and bad or credential-like properties', () => {
    expect(errors(doc([{ ...wire, domain: 'logical' }]))).toEqual([['INVALID_FIELD', 'connections[0].domain']]);
    expect(errors(doc([{ ...wire, relationship: 'pushes' }]))).toEqual([['INVALID_FIELD', 'connections[0].relationship']]);
    expect(errors(doc([{ ...wire, properties: { nested: { a: 1 } } }]))).toEqual([['INVALID_FIELD', 'connections[0].properties.nested']]);
    expect(errors(doc([{ ...wire, properties: { accessToken: 'x' } }]))).toEqual([['SECRET_FIELD', 'connections[0].properties.accessToken']]);
  });

  it('refuses a domain that does not match the ports', () => {
    const r = validateScene(doc([{ ...pipe, domain: 'signal' }]), options);
    expect(r.ok ? [] : r.errors.map((e) => [e.code, e.path, e.message])).toEqual([
      ['INCOMPATIBLE_PORTS', 'connections[0].domain', 'The connection is marked signal, but its ports are fluid ports.'],
    ]);
  });

  it('rejects the fields in version 3 files, where they did not exist', () => {
    expect(errors(doc([{ ...pipe, domain: 'fluid' }], 3))).toEqual([['UNKNOWN_FIELD', 'connections[0].domain']]);
  });
});

describe('graph helpers keep the fields', () => {
  const plain = validateScene(doc([]), options);
  if (!plain.ok) throw new Error('fixture');

  it('connect stores them', () => {
    const r = connect(plain.scene, { ...wire, relationship: 'controls', properties: { lengthM: 5 } }, options);
    expect(r.ok && r.scene.connections).toEqual([{ ...wire, relationship: 'controls', properties: { lengthM: 5 } }]);
  });

  it('copy and paste carry them to the pasted edge, as independent copies', () => {
    const joined = connect(plain.scene, { ...wire, domain: 'signal', relationship: 'controls', properties: { lengthM: 5 } }, options);
    if (!joined.ok) throw new Error(joined.error.message);
    const clip = copyComponents(joined.scene, ['PLC', 'VFD']);
    let n = 0;
    const pasted = pasteComponents(joined.scene, clip, { createId: () => `n${n++}`, offset: { x: 0, y: 0, z: 5 } });
    const copy = pasted.scene.connections[1];
    expect(copy).toEqual({ id: 'n2', domain: 'signal', relationship: 'controls', from: { instanceId: 'n0', portId: 'do0' }, to: { instanceId: 'n1', portId: 'run' }, properties: { lengthM: 5 } });
    expect(copy.properties).not.toBe(joined.scene.connections[0].properties);
  });
});

describe('routing', () => {
  it('routes pipes, gives wired connections no route, and still reports unresolved endpoints', () => {
    const r = validateScene(doc([pipe, wire]), options);
    if (!r.ok) throw new Error('fixture');
    const broken = { id: 'c3', from: { instanceId: 'gone', portId: 'x' }, to: { instanceId: 'V', portId: 'in' } };
    const routes = routeScene({ ...r.scene, connections: [...r.scene.connections, broken] }, options);
    expect(routes.map((x) => [x.connectionId, x.status])).toEqual([['c1', 'ok'], ['c3', 'invalid']]);
  });
});
