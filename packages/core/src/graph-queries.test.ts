import { describe, expect, it } from 'vitest';
import {
  connectedGroups,
  connectionsOf,
  lockConnectedAsChildren,
  neighbours,
  pathBetween,
  reachableComponents,
  relatedComponents,
  validateScene,
  type ComponentType,
  type ConnectionPort,
  type ScadaScene,
  type SceneValidationOptions,
} from './index.js';

// Graph queries over explicit edges (ADR-0023, T-076), on the acceptance scenes:
// PLC → VFD → Motor, a PLC on an Ethernet network, and a 4–20 mA transmitter into a PLC AI.

const p = (id: string, kind: ConnectionPort['kind'], extra: Partial<ConnectionPort> = {}): ConnectionPort =>
  ({ id, kind, position: [0, 0, 0], direction: [1, 0, 0], ...extra });
const portsOf: Record<string, ConnectionPort[]> = {
  'com.example.plc': [p('do0', 'signal', { signal: { type: 'DO' } }), p('ai0', 'signal', { signal: { type: 'AI', range: [4, 20], unit: 'mA' } }), p('eth', 'network', { network: { medium: 'ethernet' } })],
  'com.example.switch': [p('p', 'network', { network: { medium: 'ethernet' }, maxConnections: 8 })],
  'com.example.hmi': [p('eth', 'network', { network: { medium: 'ethernet' } })],
  'com.example.vfd': [p('run', 'signal', { signal: { type: 'DI' } }), p('uvw', 'power', { flow: 'out', power: { kind: 'AC', voltage: 400, phases: 3 } }), p('eth', 'network', { network: { medium: 'ethernet' } })],
  'com.example.motor': [p('terminals', 'power', { flow: 'in', power: { kind: 'AC', voltage: 400, phases: 3 } }), p('shaft', 'mechanical', { nominalSize: 0.04 })],
  'com.example.pump': [p('shaft', 'mechanical', { nominalSize: 0.04 })],
  'com.example.transmitter': [p('out', 'signal', { signal: { type: 'AO', range: [4, 20], unit: 'mA' } })],
};
const options: SceneValidationOptions = { resolvePorts: (t: ComponentType) => portsOf[t], resolveType: (t) => t in portsOf };
const { resolvePorts } = options;
const part = (id: string, type: string) => ({ id, type, position: { x: 0, y: 0, z: 0 }, rotation: { x: 0, y: 0, z: 0, w: 1 }, scale: { x: 1, y: 1, z: 1 }, properties: {} });
const edge = (id: string, a: string, ap: string, b: string, bp: string, extra: object = {}) => ({ id, ...extra, from: { instanceId: a, portId: ap }, to: { instanceId: b, portId: bp } });

const plant: ScadaScene = (() => {
  const r = validateScene(
    {
      schemaVersion: 4,
      documentType: 'industrial.scene',
      units: 'm',
      components: [
        part('PLC-01', 'com.example.plc'), part('SW-1', 'com.example.switch'), part('HMI-1', 'com.example.hmi'),
        part('VFD-101', 'com.example.vfd'), part('M-101', 'com.example.motor'), part('P-101', 'com.example.pump'), part('TT-101', 'com.example.transmitter'),
      ],
      connections: [
        edge('run', 'PLC-01', 'do0', 'VFD-101', 'run', { relationship: 'controls' }),
        edge('power', 'VFD-101', 'uvw', 'M-101', 'terminals', { relationship: 'drives', properties: { cable: 'NYCWY 4x2.5' } }),
        edge('shaft', 'M-101', 'shaft', 'P-101', 'shaft'),
        edge('net-plc', 'PLC-01', 'eth', 'SW-1', 'p'),
        edge('net-hmi', 'HMI-1', 'eth', 'SW-1', 'p'),
        edge('net-vfd', 'VFD-101', 'eth', 'SW-1', 'p'),
        edge('pv', 'TT-101', 'out', 'PLC-01', 'ai0', { domain: 'signal', relationship: 'measures' }),
      ],
      associations: [
        { id: 'a-controls', relationship: 'controls', from: 'PLC-01', to: 'VFD-101' },
        { id: 'a-hmi', relationship: 'com.example.supervises', from: 'HMI-1', to: 'PLC-01' },
      ],
    },
    options,
  );
  if (!r.ok) throw new Error(JSON.stringify(r.errors));
  return r.scene;
})();

describe('PLC → VFD → Motor', () => {
  it('follows controls and drives outwards from the PLC to the drive and its motor', () => {
    expect(relatedComponents(plant, 'PLC-01', { relationships: ['controls', 'drives'], direction: 'out' })).toEqual(['VFD-101', 'M-101']);
    // Nothing controls the PLC through those relationships.
    expect(relatedComponents(plant, 'PLC-01', { relationships: ['controls', 'drives'], direction: 'in' })).toEqual([]);
  });

  it('finds the motor’s chain back to its controller, step by step', () => {
    expect(pathBetween(plant, 'M-101', 'PLC-01', { domains: ['power', 'signal'], resolvePorts })).toEqual([
      { edge: 'connection', id: 'power', from: 'M-101', to: 'VFD-101', forward: false, domain: 'power', relationship: 'drives' },
      { edge: 'connection', id: 'run', from: 'VFD-101', to: 'PLC-01', forward: false, domain: 'signal', relationship: 'controls' },
    ]);
  });

  it('reaches the pump only through the mechanical shaft', () => {
    expect(neighbours(plant, 'M-101', { domains: ['mechanical'], resolvePorts })).toEqual(['P-101']);
    expect(pathBetween(plant, 'PLC-01', 'P-101', { domains: ['signal', 'power'], resolvePorts })).toBeUndefined();
  });
});

describe('PLC on an Ethernet network', () => {
  it('lists the switch as the only network neighbour, and everything on the network beyond it', () => {
    expect(neighbours(plant, 'PLC-01', { domains: ['network'], resolvePorts })).toEqual(['SW-1']);
    expect(relatedComponents(plant, 'PLC-01', { domains: ['network'], resolvePorts })).toEqual(['SW-1', 'HMI-1', 'VFD-101']);
  });

  it('needs resolvePorts to place a connection without a domain field in a domain', () => {
    expect(neighbours(plant, 'PLC-01', { domains: ['network'] })).toEqual([]);
  });
});

describe('4–20 mA transmitter into a PLC AI', () => {
  it('connects the transmitter to the PLC through a measures signal', () => {
    expect(pathBetween(plant, 'TT-101', 'PLC-01', { relationships: ['measures'] })).toEqual([
      { edge: 'connection', id: 'pv', from: 'TT-101', to: 'PLC-01', forward: true, domain: 'signal', relationship: 'measures' },
    ]);
  });
});

describe('filters', () => {
  it('follows associations, including host relationships, unless turned off', () => {
    expect(neighbours(plant, 'HMI-1')).toEqual(['SW-1', 'PLC-01']);
    expect(neighbours(plant, 'HMI-1', { associations: false })).toEqual(['SW-1']);
    expect(neighbours(plant, 'HMI-1', { connections: false })).toEqual(['PLC-01']);
    expect(pathBetween(plant, 'HMI-1', 'PLC-01', { relationships: ['com.example.supervises'] })).toEqual([
      { edge: 'association', id: 'a-hmi', from: 'HMI-1', to: 'PLC-01', forward: true, relationship: 'com.example.supervises' },
    ]);
  });

  it('skips associations when filtering by domain, since they have none', () => {
    expect(neighbours(plant, 'PLC-01', { domains: ['signal'], resolvePorts })).toEqual(['VFD-101', 'TT-101']);
  });

  it('lists each neighbour once even when several edges lead there', () => {
    // PLC → VFD by the run signal and by the controls association.
    expect(neighbours(plant, 'PLC-01', { direction: 'out' })).toEqual(['VFD-101', 'SW-1']);
  });

  it('answers for unknown ids and the same id', () => {
    expect(neighbours(plant, 'nope')).toEqual([]);
    expect(relatedComponents(plant, 'nope')).toEqual([]);
    expect(pathBetween(plant, 'nope', 'PLC-01')).toBeUndefined();
    expect(pathBetween(plant, 'PLC-01', 'PLC-01')).toEqual([]);
  });
});

describe('older helpers', () => {
  it('keep their results, never follow associations, and take an optional domain filter', () => {
    expect(reachableComponents(plant, 'HMI-1')).toEqual(['HMI-1', 'SW-1', 'PLC-01', 'VFD-101', 'TT-101', 'M-101', 'P-101']);
    expect(connectedGroups(plant, { domains: ['network'], resolvePorts })).toEqual([['PLC-01', 'SW-1', 'HMI-1', 'VFD-101'], ['M-101'], ['P-101'], ['TT-101']]);
    expect(connectionsOf(plant, 'VFD-101', { domains: ['power'], resolvePorts }).map((c) => c.id)).toEqual(['power']);
    expect(connectionsOf(plant, 'VFD-101').map((c) => c.id)).toEqual(['run', 'power', 'net-vfd']);
  });

  it('lock only physically joined parts into an assembly when ports are known', () => {
    const locked = lockConnectedAsChildren(plant, 'M-101', { resolvePorts });
    expect(locked.ok && locked.scene.components.filter((c) => c.parentId === 'M-101').map((c) => c.id)).toEqual(['P-101']);
    // Without ports, every connection counts, as before.
    const all = lockConnectedAsChildren(plant, 'M-101');
    expect(all.ok && all.scene.components.filter((c) => c.parentId === 'M-101').length).toBe(6);
  });
});
