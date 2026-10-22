import { describe, expect, it } from 'vitest';
import { componentKinds, suggestVariables, validateScene, type ComponentInstance } from '@sakibcoolz/core';
import { builtInRegistry, catalogResolvers, controlLibrary, createComponentRegistry, isChoiceParameter, type ComponentTypeDefinition } from '../index.js';

// The control equipment library (ADR-0025, T-080): opt-in `sdk.*` definitions built from public
// mechanisms only.

const registry = createComponentRegistry(...controlLibrary);
const byType = (type: string) => controlLibrary.find((d) => d.type === type)!;

/** Every combination of a definition's choice parameters. */
function combinations(d: ComponentTypeDefinition): Record<string, string>[] {
  let out: Record<string, string>[] = [{}];
  for (const [name, spec] of Object.entries(d.parameters ?? {})) {
    if (!isChoiceParameter(spec)) throw new Error(`${d.type}.${name} is not a choice`);
    out = out.flatMap((values) => spec.choices.map((choice) => ({ ...values, [name]: choice })));
  }
  return out;
}

describe('controlLibrary', () => {
  it('lists the T-080 control and I/O types, versioned and categorised, all under sdk.', () => {
    expect(controlLibrary.map((d) => d.type)).toEqual(['sdk.plc.cpu', 'sdk.plc.di', 'sdk.plc.do', 'sdk.plc.ai', 'sdk.plc.ao', 'sdk.dcs.controller', 'sdk.network.switch', 'sdk.psu']);
    for (const d of controlLibrary) {
      expect(d.version).toBe('1');
      expect(['control', 'network', 'electrical']).toContain(d.category);
    }
    expect(Object.isFrozen(controlLibrary)).toBe(true);
  });

  it('changes nothing for hosts that do not opt in', () => {
    expect(builtInRegistry.list()).toHaveLength(componentKinds.length);
    expect(catalogResolvers.resolveType('sdk.plc.cpu')).toBe(false);
    expect(registry.list()).toHaveLength(componentKinds.length + controlLibrary.length);
  });

  it.each(controlLibrary.flatMap((d) => combinations(d).map((values) => [d.type, values] as const)))('%s %j registers cleanly, with terminals inside its housing', (type, values) => {
    const built = registry.definitionFor(type, values);
    // Re-registering the built shape under a host id runs every registration rule on it.
    expect(() => createComponentRegistry({ ...built, type: 'com.test.copy', variables: built.variables ? [...built.variables] : undefined })).not.toThrow();
    for (const p of built.ports) {
      for (let i = 0; i < 3; i++) {
        expect(p.position[i]).toBeGreaterThanOrEqual(built.bounds.min[i] - 1e-9);
        expect(p.position[i]).toBeLessThanOrEqual(built.bounds.max[i] + 1e-9);
      }
    }
    expect(registry.validateProperties(type, values)).toEqual([]);
  });

  it('gives I/O modules one terminal and one tag per channel, as chosen', () => {
    const ids = (type: string, values: Record<string, string>) => registry.definitionFor(type, values).ports.map((p) => p.id);
    expect(ids('sdk.plc.di', { channels: '8' })).toEqual(['DI0', 'DI1', 'DI2', 'DI3', 'DI4', 'DI5', 'DI6', 'DI7']);
    expect(ids('sdk.plc.do', {})).toHaveLength(16);
    expect(ids('sdk.plc.ao', { channels: '2' })).toEqual(['AO0', 'AO1']);
    const ai = registry.definitionFor('sdk.plc.ai', { channels: '4', signal: '0-10 V' });
    expect(ai.ports.map((p) => p.signal)).toEqual(Array(4).fill({ type: 'AI', range: [0, 10], unit: 'V' }));
    expect(registry.resolvers.resolveVariables('sdk.plc.ai', { channels: '4', signal: '0-10 V' })).toEqual(['AI0', 'AI1', 'AI2', 'AI3'].map((name) => ({ name, dataType: 'float32', unit: 'V' })));
    expect(registry.definitionFor('sdk.network.switch', { ports: '16' }).ports.filter((p) => p.kind === 'network')).toHaveLength(16);
  });
});

describe('the reserved sdk. prefix', () => {
  it('refuses copies and inventions, and accepts host types elsewhere', () => {
    const cpu = byType('sdk.plc.cpu');
    expect(() => createComponentRegistry({ ...cpu })).toThrow('"sdk.plc.cpu" uses the reserved "sdk." prefix');
    expect(() => createComponentRegistry({ ...cpu, type: 'sdk.custom.thing' })).toThrow('reserved "sdk." prefix');
    expect(() => createComponentRegistry({ ...cpu, type: 'com.acme.cpu' })).not.toThrow();
    expect(() => createComponentRegistry(cpu, cpu)).toThrow('"sdk.plc.cpu" is registered twice');
  });
});

describe('wiring control equipment', () => {
  const at = (id: string, type: string, x: number, properties: ComponentInstance['properties'] = {}): ComponentInstance =>
    ({ id, type, position: { x, y: 0, z: 0 }, rotation: { x: 0, y: 0, z: 0, w: 1 }, scale: { x: 1, y: 1, z: 1 }, properties });
  const edge = (id: string, a: string, ap: string, b: string, bp: string) => ({ id, from: { instanceId: a, portId: ap }, to: { instanceId: b, portId: bp } });
  const panel = [
    at('PSU', 'sdk.psu', 0),
    at('CPU', 'sdk.plc.cpu', 0.1),
    at('DI', 'sdk.plc.di', 0.2, { channels: '8' }),
    at('DO', 'sdk.plc.do', 0.3, { channels: '8' }),
    at('AI', 'sdk.plc.ai', 0.4),
    at('AO', 'sdk.plc.ao', 0.5, { signal: '0-10 V' }),
    at('SW', 'sdk.network.switch', 0.6),
    at('DCS', 'sdk.dcs.controller', 0.8),
  ];
  const errors = (connections: unknown[]) => {
    const r = validateScene({ schemaVersion: 4, documentType: 'industrial.scene', units: 'm', components: panel, connections }, registry.resolvers);
    return r.ok ? [] : r.errors.map((e) => [e.code, e.message]);
  };

  it('accepts a supplied, networked PLC with output-to-input wiring', () => {
    expect(errors([
      edge('p1', 'PSU', '24V', 'CPU', '24V'),
      edge('p2', 'PSU', '24V', 'SW', '24V'),
      edge('p3', 'PSU', '24V', 'DCS', '24V'),
      edge('n1', 'CPU', 'eth1', 'SW', 'P1'),
      edge('n2', 'DCS', 'netA', 'SW', 'P2'),
      edge('s1', 'DO', 'DO0', 'DI', 'DI0'),
    ])).toEqual([]);
  });

  it('refuses mismatched wiring by the ADR-0023 rules', () => {
    expect(errors([edge('x', 'AO', 'AO0', 'AI', 'AI0')])).toEqual([['INCOMPATIBLE_PORTS', 'Incompatible ports: 0–10 V cannot connect to 4–20 mA.']]);
    expect(errors([edge('x', 'PSU', 'L1', 'CPU', '24V')])).toEqual([['INCOMPATIBLE_PORTS', 'Incompatible ports: AC cannot connect to DC.']]);
    expect(errors([edge('x', 'PSU', 'PE', 'CPU', '24V')])).toEqual([['INCOMPATIBLE_PORTS', 'Incompatible ports: protective earth connects only to protective earth.']]);
    expect(errors([edge('x', 'DI', 'DI0', 'DI', 'DI1')])[0][0]).toBe('SELF_CONNECTION');
  });

  it('suggests one tag per channel and controller status tags', () => {
    const scene = validateScene({ schemaVersion: 4, documentType: 'industrial.scene', units: 'm', components: [panel[1], panel[2]], connections: [] }, registry.resolvers);
    if (!scene.ok) throw new Error('scene');
    expect(suggestVariables(scene.scene, registry.resolvers).variables.map((v) => v.id)).toEqual(['CPU.RUN', 'CPU.FAULT', ...Array.from({ length: 8 }, (_, i) => `DI.DI${i}`)]);
  });
});
