import { describe, expect, it } from 'vitest';
import { validateScene, type ComponentInstance, type ScadaScene } from '@sakibcoolz/core';
import { controlLibrary, createComponentRegistry } from '@sakibcoolz/components';
import { describePorts, describeRating } from './ports.js';
import { describeRelations } from './relations.js';

// The port inspector and relationship explorer models (ADR-0027, T-087), on a PLC → VFD → motor → pump line.

const registry = createComponentRegistry(...controlLibrary);
const at = (id: string, type: string, properties: ComponentInstance['properties'] = {}, name?: string): ComponentInstance =>
  ({ id, type, position: { x: 0, y: 0, z: 0 }, rotation: { x: 0, y: 0, z: 0, w: 1 }, scale: { x: 1, y: 1, z: 1 }, properties, ...(name ? { name } : {}) });
const edge = (id: string, a: string, ap: string, b: string, bp: string) => ({ id, from: { instanceId: a, portId: ap }, to: { instanceId: b, portId: bp } });
const r = validateScene({
  schemaVersion: 4,
  documentType: 'industrial.scene',
  units: 'm',
  components: [
    at('TK', 'tank'), at('P', 'pump'), at('M', 'sdk.motor', {}, 'Main pump motor'), at('VFD', 'sdk.vfd'), at('PLC', 'sdk.plc.cpu'),
    at('DO', 'sdk.plc.do', { channels: '8' }), at('AI', 'sdk.plc.ai', { channels: '4' }), at('PSU', 'sdk.psu'), at('LT', 'sdk.transmitter', { measures: 'level' }), at('PNL', 'sdk.panel'),
  ],
  connections: [
    edge('pipe', 'TK', 'outlet', 'P', 'suction'),
    edge('motor', 'VFD', 'U-V-W', 'M', 'terminals'),
    edge('run', 'DO', 'DO0', 'VFD', 'run'),
    edge('speed', 'VFD', 'speed', 'AI', 'AI0'),
    edge('level', 'LT', 'out', 'AI', 'AI1'),
    edge('24v-plc', 'PSU', '24V', 'PLC', '24V'),
    edge('24v-lt', 'PSU', '24V', 'LT', '24V'),
    edge('pe-vfd', 'VFD', 'PE', 'PNL', 'PE'),
    edge('pe-m', 'M', 'PE', 'PNL', 'PE'),
  ],
  associations: [
    { id: 'drv', relationship: 'drives', from: 'M', to: 'P' },
    { id: 'ctl', relationship: 'controls', from: 'PLC', to: 'VFD' },
    { id: 'meas', relationship: 'measures', from: 'LT', to: 'TK' },
  ],
}, registry.resolvers);
if (!r.ok) throw new Error(JSON.stringify(r.errors));
const scene: ScadaScene = r.scene;

describe('describePorts', () => {
  it('lists every port with its terminal, ratings, usage and what it joins', () => {
    const rows = describePorts(scene, 'VFD', registry);
    expect(rows.map((p) => p.id)).toEqual(['L1-L3', 'U-V-W', 'PE', 'run', 'reset', 'speedRef', 'speed', 'fault', 'eth']);
    const byId = Object.fromEntries(rows.map((p) => [p.id, p]));
    expect(byId['U-V-W']).toMatchObject({ terminal: 'U V W', kind: 'power', rating: 'AC 400 V 3-phase out', used: 1, capacity: 1 });
    expect(byId['U-V-W'].joins).toEqual([{ connectionId: 'motor', componentId: 'M', componentLabel: 'Main pump motor', portId: 'terminals', terminal: 'U V W' }]);
    expect(byId.run).toMatchObject({ rating: 'DI', used: 1, joins: [{ componentId: 'DO', portId: 'DO0', terminal: 'DO0' }] });
    expect(byId.speed.rating).toBe('AO 4–20 mA');
    expect(byId.eth).toMatchObject({ rating: 'ethernet · modbus-tcp, opcua', used: 0, joins: [] });
    expect(describePorts(scene, 'PNL', registry).find((p) => p.id === 'PE')).toMatchObject({ used: 2, capacity: 32 });
  });

  it('describes pipe bores and earth, and is empty for an unknown component', () => {
    expect(describePorts(scene, 'TK', registry)[0].rating).toMatch(/^bore \d+ mm$/);
    expect(describeRating({ id: 'PE', kind: 'power', position: [0, 0, 0], direction: [0, 0, 1], power: { kind: 'PE' } })).toBe('PE');
    expect(describePorts(scene, 'nope', registry)).toEqual([]);
  });
});

describe('describeRelations', () => {
  const groups = (id: string) => Object.fromEntries(describeRelations(scene, id, registry).groups.map((g) => [g.label, g.components.map((c) => c.id)]));

  it('groups a drive’s neighbours by power direction, signal direction, earth and association', () => {
    expect(groups('VFD')).toEqual({
      Supplies: ['M'],
      'Earthed with': ['PNL'],
      'Receives signal from': ['DO'],
      'Sends signal to': ['AI'],
      'Controlled by': ['PLC'],
    });
  });

  it('groups pipes, both association directions, and supply', () => {
    expect(groups('TK')).toEqual({ 'Piped or coupled to': ['P'], 'Measured by': ['LT'] });
    expect(groups('LT')).toEqual({ 'Sends signal to': ['AI'], 'Supplied from': ['PSU'], Measures: ['TK'] });
    expect(groups('M')['Drives']).toEqual(['P']);
  });

  it('walks the pump’s control chain upstream, nearest first, and stops at what nothing acts on', () => {
    expect(describeRelations(scene, 'P', registry).chain.map((c) => c.label)).toEqual(['Main pump motor', 'VFD', 'DO', 'PLC', 'PSU']);
    // Measuring is not acting on: the tank's chain is empty.
    expect(describeRelations(scene, 'TK', registry).chain).toEqual([]);
  });

  it('is empty for an unknown component', () => {
    expect(describeRelations(scene, 'nope', registry)).toEqual({ groups: [], chain: [] });
  });
});
