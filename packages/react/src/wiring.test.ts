import { describe, expect, it } from 'vitest';
import { connect, validateScene, type ComponentInstance, type ScadaScene } from '@sakibcoolz/core';
import { controlLibrary, createComponentRegistry } from '@sakibcoolz/components';
import { parsePropertyValue, wiringCandidates } from './wiring.js';

// The wiring picker's model (ADR-0027, T-088): same-kind ports on other components, choosable or not,
// with core's own reason. Whatever it offers, `connect` accepts.

const registry = createComponentRegistry(...controlLibrary);
const at = (id: string, type: string, properties: ComponentInstance['properties'] = {}): ComponentInstance =>
  ({ id, type, position: { x: 0, y: 0, z: 0 }, rotation: { x: 0, y: 0, z: 0, w: 1 }, scale: { x: 1, y: 1, z: 1 }, properties });
const r = validateScene({
  schemaVersion: 4,
  documentType: 'industrial.scene',
  units: 'm',
  components: [at('VFD', 'sdk.vfd'), at('M400', 'sdk.motor'), at('M230', 'sdk.motor', { voltage: '230' }), at('DO', 'sdk.plc.do', { channels: '8' }), at('TK', 'tank')],
  connections: [{ id: 'reset', from: { instanceId: 'DO', portId: 'DO1' }, to: { instanceId: 'VFD', portId: 'reset' } }],
}, registry.resolvers);
if (!r.ok) throw new Error(JSON.stringify(r.errors));
const scene: ScadaScene = r.scene;
const summary = (componentId: string, portId: string) => wiringCandidates(scene, componentId, portId, registry)?.map((c) => [`${c.componentId}.${c.portId}`, c.reason ?? 'ok']);

describe('wiringCandidates', () => {
  it('offers matching motors first and explains the rest with core’s reason', () => {
    expect(summary('VFD', 'U-V-W')).toEqual([
      ['M400.terminals', 'ok'],
      ['M400.PE', 'protective earth connects only to protective earth'],
      ['M230.terminals', '400 V cannot connect to 230 V'],
      ['M230.PE', 'protective earth connects only to protective earth'],
    ]);
  });

  it('refuses mismatched signals, output to output, full ports and an existing wire', () => {
    expect(Object.fromEntries(summary('VFD', 'run')!)['DO.DO0']).toBe('ok');
    expect(Object.fromEntries(summary('DO', 'DO2')!)).toMatchObject({
      'VFD.run': 'ok',
      'VFD.reset': 'already has 1 connection, its maximum',
      'VFD.speedRef': 'a digital signal cannot connect to an analog one',
      'VFD.fault': 'an output cannot connect to an output',
    });
    expect(Object.fromEntries(summary('DO', 'DO1')!)['VFD.reset']).toBe('already wired to this port');
  });

  it('only covers wired ports, and every choosable candidate is accepted by connect', () => {
    expect(wiringCandidates(scene, 'TK', 'outlet', registry)).toBeUndefined();
    expect(wiringCandidates(scene, 'VFD', 'nope', registry)).toBeUndefined();
    for (const c of wiringCandidates(scene, 'DO', 'DO3', registry)!.filter((c) => c.ok)) {
      expect(connect(scene, { id: 'x', from: { instanceId: 'DO', portId: 'DO3' }, to: { instanceId: c.componentId, portId: c.portId } }, registry.resolvers).ok).toBe(true);
    }
  });
});

describe('parsePropertyValue', () => {
  it('reads numbers and booleans, and keeps other text as typed', () => {
    expect(parsePropertyValue('4.5')).toBe(4.5);
    expect(parsePropertyValue('true')).toBe(true);
    expect(parsePropertyValue('NYY 4x2.5')).toBe('NYY 4x2.5');
    expect(parsePropertyValue('')).toBe('');
  });
});
