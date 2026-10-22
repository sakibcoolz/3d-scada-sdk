import { describe, expect, it } from 'vitest';
import {
  attachComponents,
  checkPorts,
  findSnapCandidates,
  findTouchingPorts,
  portsCompatible,
  validateScene,
  type ComponentType,
  type ConnectionPort,
  type SceneValidationOptions,
} from './index.js';

// Port domains (ADR-0023): one rule table per domain, missing metadata never fails, and
// `maxConnections` (default 1) caps a port's connections.

const port = (id: string, kind: ConnectionPort['kind'], extra: Partial<ConnectionPort> = {}): ConnectionPort =>
  ({ id, kind, position: [0, 0, 0], direction: [1, 0, 0], ...extra });
const reason = (a: ConnectionPort, b: ConnectionPort) => {
  const r = checkPorts(a, b);
  return r.ok ? 'ok' : r.reason;
};
/** Both orders give the same answer. */
const both = (a: ConnectionPort, b: ConnectionPort) => {
  expect(checkPorts(a, b).ok).toBe(checkPorts(b, a).ok);
  return reason(a, b);
};

const DI = port('di', 'signal', { signal: { type: 'DI' } });
const DO = port('do', 'signal', { signal: { type: 'DO' } });
const AI = (range: [number, number] = [4, 20], unit = 'mA') => port('ai', 'signal', { signal: { type: 'AI', range, unit } });
const AO = (range: [number, number] = [4, 20], unit = 'mA') => port('ao', 'signal', { signal: { type: 'AO', range, unit } });

describe('checkPorts: domains', () => {
  const kinds = ['fluid', 'mechanical', 'power', 'signal', 'network', 'electrical'] as const;
  it.each(kinds.flatMap((a) => kinds.map((b) => [a, b] as const)))('%s ↔ %s connect only within one domain', (a, b) => {
    expect(portsCompatible(port('a', a), port('b', b))).toBe(a === b);
  });
  it('names the domains when they differ', () => {
    expect(reason(port('a', 'power'), port('b', 'signal'))).toBe('a power port cannot connect to a signal port');
  });
});

describe('checkPorts: fluid and mechanical (unchanged)', () => {
  it('compares nominal sizes within 0.1 mm, and ignores a missing size', () => {
    expect(both(port('a', 'fluid', { nominalSize: 0.15 }), port('b', 'fluid', { nominalSize: 0.15005 }))).toBe('ok');
    expect(both(port('a', 'fluid', { nominalSize: 0.15 }), port('b', 'fluid', { nominalSize: 0.08 }))).toBe('the nominal sizes differ');
    expect(both(port('a', 'fluid', { nominalSize: 0.15 }), port('b', 'fluid'))).toBe('ok');
    expect(both(port('a', 'mechanical', { nominalSize: 0.04 }), port('b', 'mechanical', { nominalSize: 0.05 }))).toBe('the nominal sizes differ');
  });
});

describe('checkPorts: signal', () => {
  it('joins an output to an input of the same class', () => {
    expect(both(DO, DI)).toBe('ok');
    expect(both(AO(), AI())).toBe('ok');
  });
  it('refuses two outputs, two inputs and digital to analog', () => {
    expect(both(DO, { ...DO, id: 'do2' })).toBe('an output cannot connect to an output');
    expect(both(DI, { ...DI, id: 'di2' })).toBe('an input cannot connect to an input');
    expect(both(DO, AI())).toBe('a digital signal cannot connect to an analog one');
  });
  it('compares analog ranges and units when both sides give them', () => {
    expect(both(AO([0, 10], 'V'), AI([4, 20], 'mA'))).toBe('0–10 V cannot connect to 4–20 mA');
    expect(both(AO([4, 20], 'mA'), AI([0, 20], 'mA'))).toBe('4–20 mA cannot connect to 0–20 mA');
    expect(both(port('ao', 'signal', { signal: { type: 'AO' } }), AI())).toBe('ok');
  });
  it('uses an explicit flow, and lets bidirectional ports and bare ports connect', () => {
    expect(both(port('a', 'signal', { flow: 'out' }), port('b', 'signal', { flow: 'out' }))).toBe('an output cannot connect to an output');
    expect(both(port('a', 'signal', { flow: 'bidirectional' }), DO)).toBe('ok');
    expect(both(port('a', 'signal'), port('b', 'signal'))).toBe('ok');
  });
});

describe('checkPorts: power', () => {
  const ac = (voltage?: number, phases?: 1 | 3, flow?: ConnectionPort['flow']) => port('p', 'power', { power: { kind: 'AC', voltage, phases }, flow });
  it('matches kind, voltage and phases', () => {
    expect(both(ac(400, 3, 'out'), ac(400, 3, 'in'))).toBe('ok');
    expect(both(ac(400), ac(230))).toBe('400 V cannot connect to 230 V');
    expect(both(ac(400, 3), ac(400, 1))).toBe('3-phase cannot connect to 1-phase');
    expect(both(ac(), port('d', 'power', { power: { kind: 'DC' } }))).toBe('AC cannot connect to DC');
    expect(both(ac(400), ac())).toBe('ok');
  });
  it('connects protective earth only to protective earth', () => {
    const pe = port('pe', 'power', { power: { kind: 'PE' } });
    expect(both(pe, { ...pe, id: 'pe2' })).toBe('ok');
    expect(both(pe, ac())).toBe('protective earth connects only to protective earth');
  });
  it('refuses two sources', () => {
    expect(both(ac(400, 3, 'out'), ac(400, 3, 'out'))).toBe('two power sources cannot connect to each other');
  });
});

describe('checkPorts: network', () => {
  const net = (medium: string, protocols?: string[]) => port('n', 'network', { network: { medium, protocols } });
  it('needs the same medium and a shared protocol when both list them', () => {
    expect(both(net('ethernet', ['modbus-tcp', 'opc-ua']), net('ethernet', ['opc-ua']))).toBe('ok');
    expect(both(net('ethernet'), net('rs485'))).toBe('ethernet cannot connect to rs485');
    expect(both(net('ethernet', ['modbus-tcp']), net('ethernet', ['profinet']))).toBe('the ports share no protocol');
    expect(both(net('ethernet', ['modbus-tcp']), net('ethernet'))).toBe('ok');
  });
});

describe('validateScene with port domains', () => {
  const portsOf: Record<string, ConnectionPort[]> = {
    'com.example.plc': [
      port('do0', 'signal', { signal: { type: 'DO' } }),
      port('ai0', 'signal', { signal: { type: 'AI', range: [4, 20], unit: 'mA' } }),
      port('eth', 'network', { network: { medium: 'ethernet' } }),
    ],
    'com.example.switch': [port('p', 'network', { network: { medium: 'ethernet' }, maxConnections: 2 })],
    'com.example.relay': [port('coil', 'signal', { signal: { type: 'DI' } })],
    'com.example.meter': [port('out', 'signal', { signal: { type: 'AO', range: [0, 10], unit: 'V' } })],
  };
  const options: SceneValidationOptions = { resolvePorts: (t: ComponentType) => portsOf[t], resolveType: (t) => t in portsOf };
  const part = (id: string, type: string) => ({ id, type, position: { x: 0, y: 0, z: 0 }, rotation: { x: 0, y: 0, z: 0, w: 1 }, scale: { x: 1, y: 1, z: 1 }, properties: {} });
  const edge = (id: string, a: string, ap: string, b: string, bp: string) => ({ id, from: { instanceId: a, portId: ap }, to: { instanceId: b, portId: bp } });
  const doc = (connections: unknown[]) => ({
    schemaVersion: 4,
    documentType: 'industrial.scene',
    units: 'm',
    components: [part('PLC-1', 'com.example.plc'), part('PLC-2', 'com.example.plc'), part('PLC-3', 'com.example.plc'), part('SW', 'com.example.switch'), part('K1', 'com.example.relay'), part('TT', 'com.example.meter')],
    connections,
  });
  const errors = (connections: unknown[]) => {
    const r = validateScene(doc(connections), options);
    return r.ok ? [] : r.errors.map((e) => [e.code, e.path, e.message]);
  };

  it('accepts DO→DI and lets a port take up to maxConnections', () => {
    expect(errors([edge('c1', 'PLC-1', 'do0', 'K1', 'coil'), edge('c2', 'PLC-1', 'eth', 'SW', 'p'), edge('c3', 'PLC-2', 'eth', 'SW', 'p')])).toEqual([]);
  });
  it('refuses a connection beyond maxConnections, and a second one on a default port', () => {
    expect(errors([edge('c1', 'PLC-1', 'eth', 'SW', 'p'), edge('c2', 'PLC-2', 'eth', 'SW', 'p'), edge('c3', 'PLC-3', 'eth', 'SW', 'p')])).toEqual([
      ['PORT_OCCUPIED', 'connections[2].to', 'Port already has 2 connections, its maximum.'],
    ]);
    expect(errors([edge('c1', 'PLC-1', 'do0', 'K1', 'coil'), edge('c2', 'PLC-2', 'do0', 'K1', 'coil')])).toEqual([
      ['PORT_OCCUPIED', 'connections[1].to', 'Port already has a connection.'],
    ]);
  });
  it('reports the failed rule in the message', () => {
    expect(errors([edge('c1', 'TT', 'out', 'PLC-1', 'ai0')])).toEqual([['INCOMPATIBLE_PORTS', 'connections[0]', 'Incompatible ports: 0–10 V cannot connect to 4–20 mA.']]);
  });
});

describe('physical mating is for fluid and mechanical ports only', () => {
  // Two boxes whose terminals sit exactly face to face: a fluid pair and a signal pair.
  const portsOf: Record<string, ConnectionPort[]> = {
    'com.example.a': [port('f', 'fluid', { position: [0.5, 0, 0], direction: [1, 0, 0] }), port('s', 'signal', { position: [0.5, 1, 0], direction: [1, 0, 0], signal: { type: 'DO' } })],
    'com.example.b': [port('f', 'fluid', { position: [-0.5, 0, 0], direction: [-1, 0, 0] }), port('s', 'signal', { position: [-0.5, 1, 0], direction: [-1, 0, 0], signal: { type: 'DI' } })],
  };
  const resolvePorts = (t: ComponentType) => portsOf[t];
  const resolveType = (t: ComponentType) => t in portsOf;
  const at = (id: string, type: string, x: number) => ({ id, type, position: { x, y: 0, z: 0 }, rotation: { x: 0, y: 0, z: 0, w: 1 }, scale: { x: 1, y: 1, z: 1 }, properties: {} });
  const scene = { schemaVersion: 4 as const, documentType: 'industrial.scene' as const, units: 'm' as const, components: [at('A', 'com.example.a', 0), at('B', 'com.example.b', 1)], connections: [] };

  it('touching, snapping and attach see only the fluid pair', () => {
    expect(findTouchingPorts(scene, { resolvePorts }).matches).toEqual([{ from: { instanceId: 'A', portId: 'f' }, to: { instanceId: 'B', portId: 'f' } }]);
    expect(findSnapCandidates(scene, scene.components[1], { resolvePorts }).map((c) => c.movingPortId)).toEqual(['f']);
    const attached = attachComponents(scene, 'A', 'B', { resolvePorts, resolveType, createId: () => 'c1' });
    expect(attached.ok && attached.connection).toEqual({ id: 'c1', from: { instanceId: 'B', portId: 'f' }, to: { instanceId: 'A', portId: 'f' } });
  });
});
