import { describe, expect, it } from 'vitest';
import { createEmptyScene, componentStatus, type AlarmState, type PropertyState, type ScadaScene } from './index.js';

// Status per component (ADR-0028 §3–4): host alarms resolved through tags, quality, and ordering.

const at = { x: 0, y: 0, z: 0 };
const component = (id: string) => ({ id, type: 'tank' as const, position: at, rotation: { x: 0, y: 0, z: 0, w: 1 }, scale: { x: 1, y: 1, z: 1 }, properties: {} });
const scene: ScadaScene = {
  ...createEmptyScene(),
  components: ['TK-1', 'P-1', 'LT-1', 'V-1'].map(component),
  connections: [{ id: 'c1', from: { instanceId: 'TK-1', portId: 'out' }, to: { instanceId: 'P-1', portId: 'in' } }] as ScadaScene['connections'],
  runtimeVariables: [{ id: 'LT-1.PV', componentId: 'LT-1', dataType: 'float32', access: 'read' }],
  tagBindings: [
    { id: 'b1', tagId: 'LT-1.PV', kind: 'property', instanceId: 'TK-1', property: 'level' },
    { id: 'b2', tagId: 'TT-1', kind: 'property', instanceId: 'TK-1', property: 'temperature' },
    { id: 'b3', tagId: 'FT-1', kind: 'flow', connectionId: 'c1' },
  ],
};
const ok = (instanceId: string, property: string, extra: Partial<PropertyState> = {}): PropertyState => ({ bindingId: `${instanceId}.${property}`, instanceId, property, status: 'ok', value: 1, quality: 'GOOD', source: 'MEASURED', sourceTimestamp: '2026-01-01T00:00:00Z', uncertain: false, ...extra }) as PropertyState;
const unknown = (instanceId: string, property: string, reason: 'DISCONNECTED' | 'STALE' = 'DISCONNECTED'): PropertyState => ({ bindingId: `${instanceId}.${property}`, instanceId, property, status: 'unknown', reason });
const alarm = (id: string, severity: AlarmState['severity'], target: Partial<AlarmState>, extra: Partial<AlarmState> = {}): AlarmState => ({ id, severity, message: id, active: true, ...target, ...extra });

describe('componentStatus', () => {
  it('ranks alarm, unknown, uncertain, ok and unbound', () => {
    const result = componentStatus({ ...scene, components: [...scene.components, component('X-1')] }, {
      properties: [ok('TK-1', 'level'), unknown('TK-1', 'temperature'), ok('P-1', 'speed', { uncertain: true, quality: 'UNCERTAIN' }), ok('LT-1', 'level')],
    }, [alarm('A1', 'low', { componentId: 'LT-1' })]);
    expect([...result.byComponent.values()].map((s) => [s.componentId, s.status])).toEqual([['TK-1', 'unknown'], ['P-1', 'uncertain'], ['LT-1', 'alarm'], ['V-1', 'unbound'], ['X-1', 'unbound']]);
    expect(result.byComponent.get('TK-1')!.unknown).toEqual([{ property: 'temperature', reason: 'DISCONNECTED' }]);
    expect(result.byComponent.get('P-1')!.uncertain).toEqual(['speed']);
    expect(componentStatus(scene, { properties: [ok('P-1', 'speed')] }).byComponent.get('P-1')!.status).toBe('ok');
  });

  it('resolves a tag through property bindings, flow bindings and variables; an explicit component wins', () => {
    const r = componentStatus(scene, undefined, [alarm('level', 'high', { tagId: 'LT-1.PV' }), alarm('flow', 'medium', { tagId: 'FT-1' }), alarm('mine', 'low', { componentId: 'V-1', tagId: 'LT-1.PV' })]);
    expect(r.byComponent.get('TK-1')!.alarms.map((a) => a.id)).toEqual(['level', 'flow']);
    expect(r.byComponent.get('LT-1')!.alarms.map((a) => a.id)).toEqual(['level']);
    expect(r.byComponent.get('P-1')!.alarms.map((a) => a.id)).toEqual(['flow']);
    expect(r.byComponent.get('V-1')!.alarms.map((a) => a.id)).toEqual(['mine']);
    expect(r.unlinked).toEqual([]);
  });

  it('lists active alarms that do not resolve as unlinked, and ignores inactive ones', () => {
    const r = componentStatus(scene, undefined, [alarm('gone', 'high', { componentId: 'XV-9' }), alarm('tag', 'low', { tagId: 'NOPE' }), alarm('none', 'low', {}), alarm('off', 'critical', { componentId: 'TK-1' }, { active: false })]);
    expect(r.unlinked.map((a) => a.id)).toEqual(['gone', 'tag', 'none']);
    expect(r.byComponent.get('TK-1')!.status).toBe('unbound');
    expect(r.counts).toMatchObject({ critical: 0, unlinked: 3 });
  });

  it('takes the highest severity, keeps acknowledged alarms while active, and flags unacknowledged ones', () => {
    const r = componentStatus(scene, undefined, [alarm('a', 'low', { componentId: 'TK-1' }), alarm('b', 'high', { componentId: 'TK-1' }, { acknowledged: true }), alarm('c', 'high', { componentId: 'TK-1' }), alarm('d', 'medium', { componentId: 'P-1' }, { acknowledged: true })]);
    const tank = r.byComponent.get('TK-1')!;
    expect(tank).toMatchObject({ status: 'alarm', severity: 'high', unacknowledged: true });
    expect(tank.alarms.map((a) => a.id)).toEqual(['c', 'b', 'a']);
    expect(r.byComponent.get('P-1')).toMatchObject({ status: 'alarm', severity: 'medium', unacknowledged: false });
    expect(r.counts).toMatchObject({ high: 1, medium: 1, unacknowledged: 1 });
  });

  it('orders attention by severity, unacknowledged first, then unknown values, in scene order', () => {
    const r = componentStatus(scene, { properties: [unknown('V-1', 'position'), unknown('LT-1', 'level', 'STALE')] }, [
      alarm('p', 'medium', { componentId: 'P-1' }, { acknowledged: true }),
      alarm('t', 'medium', { componentId: 'TK-1' }, { acknowledged: true }),
      alarm('v', 'medium', { componentId: 'V-1' }),
      alarm('l', 'critical', { componentId: 'LT-1' }, { acknowledged: true }),
    ]);
    expect(r.attention.map((s) => s.componentId)).toEqual(['LT-1', 'V-1', 'TK-1', 'P-1']);
    const unknownOnly = componentStatus(scene, { properties: [unknown('V-1', 'position'), unknown('LT-1', 'level', 'STALE')] });
    expect(unknownOnly.attention.map((s) => s.componentId)).toEqual(['LT-1', 'V-1']);
    expect(unknownOnly.counts.unknown).toBe(2);
  });

  it('never lets a simulated value clear an unknown one, and marks simulated values', () => {
    const r = componentStatus(scene, { properties: [unknown('TK-1', 'level'), ok('TK-1', 'level', { source: 'SIMULATED' }), ok('P-1', 'speed', { source: 'SIMULATED' })] });
    expect(r.byComponent.get('TK-1')).toMatchObject({ status: 'unknown', simulated: true });
    expect(r.byComponent.get('P-1')).toMatchObject({ status: 'ok', simulated: true });
  });

  it('treats host data as untrusted: unknown severities show as critical, odd entries are skipped', () => {
    const r = componentStatus(scene, undefined, [null, 'x', { id: 'q', componentId: 'TK-1', severity: 'urgent', message: 7, active: true }, { id: 'r', componentId: 'P-1', severity: 'low', message: 'm', active: 'yes' }] as unknown as AlarmState[]);
    expect(r.byComponent.get('TK-1')).toMatchObject({ status: 'alarm', severity: 'critical' });
    expect(r.byComponent.get('TK-1')!.alarms[0].message).toBe('7');
    expect(r.byComponent.get('P-1')!.status).toBe('unbound');
  });
});
