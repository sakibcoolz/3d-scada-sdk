import { describe, expect, it } from 'vitest';
import { componentKinds, pathBetween, suggestVariables, validateScene, type ComponentInstance } from '@sakibcoolz/core';
import { builtInRegistry, catalogResolvers, controlLibrary, createComponentRegistry, isChoiceParameter, type ComponentTypeDefinition } from '../index.js';

// The control equipment library (ADR-0025, T-080..T-081): opt-in `sdk.*` definitions built from
// public mechanisms only.

const registry = createComponentRegistry(...controlLibrary);
const byType = (type: string) => controlLibrary.find((d) => d.type === type)!;

/** Every combination of a definition's choices, with numbers at their minimum, default and maximum. */
function combinations(d: ComponentTypeDefinition): Record<string, string | number>[] {
  let out: Record<string, string | number>[] = [{}];
  for (const [name, spec] of Object.entries(d.parameters ?? {})) {
    const samples: (string | number)[] = isChoiceParameter(spec) ? [...spec.choices] : [spec.min, spec.default, spec.max];
    out = out.flatMap((values) => samples.map((sample) => ({ ...values, [name]: sample })));
  }
  return out;
}

describe('controlLibrary', () => {
  it('lists the control, I/O, drive, instrument and enclosure types, versioned and categorised, all under sdk.', () => {
    expect(controlLibrary.map((d) => d.type)).toEqual([
      'sdk.plc.cpu', 'sdk.plc.di', 'sdk.plc.do', 'sdk.plc.ai', 'sdk.plc.ao', 'sdk.dcs.controller', 'sdk.network.switch', 'sdk.psu',
      'sdk.vfd', 'sdk.motor', 'sdk.transmitter', 'sdk.switch', 'sdk.panel',
    ]);
    for (const d of controlLibrary) {
      expect(d.version).toBe('1');
      expect(['control', 'network', 'electrical', 'instrument', 'enclosure']).toContain(d.category);
    }
    expect(Object.isFrozen(controlLibrary)).toBe(true);
  });

  it('changes nothing for hosts that do not opt in', () => {
    expect(builtInRegistry.list()).toHaveLength(componentKinds.length);
    expect(catalogResolvers.resolveType('sdk.plc.cpu')).toBe(false);
    expect(registry.list()).toHaveLength(componentKinds.length + controlLibrary.length);
  });

  it.each(controlLibrary.flatMap((d) => combinations(d).map((values) => [d.type, values] as const)))('%s %j registers cleanly, with terminals inside its bounds', (type, values) => {
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

describe('drives, motors, instruments and the panel (T-081)', () => {
  const at = (id: string, type: string, x: number, properties: ComponentInstance['properties'] = {}): ComponentInstance =>
    ({ id, type, position: { x, y: 0, z: 0 }, rotation: { x: 0, y: 0, z: 0, w: 1 }, scale: { x: 1, y: 1, z: 1 }, properties });
  const edge = (id: string, a: string, ap: string, b: string, bp: string) => ({ id, from: { instanceId: a, portId: ap }, to: { instanceId: b, portId: bp } });
  const line = [
    at('PNL', 'sdk.panel', -2),
    at('PSU', 'sdk.psu', 0),
    at('CPU', 'sdk.plc.cpu', 0.1),
    at('DI', 'sdk.plc.di', 0.2, { channels: '8' }),
    at('DO', 'sdk.plc.do', 0.3, { channels: '8' }),
    at('AI', 'sdk.plc.ai', 0.4),
    at('AI10V', 'sdk.plc.ai', 0.45, { signal: '0-10 V' }),
    at('AO', 'sdk.plc.ao', 0.5),
    at('SW', 'sdk.network.switch', 0.6),
    at('VFD', 'sdk.vfd', 1),
    at('M', 'sdk.motor', 2),
    at('M230', 'sdk.motor', 3, { voltage: '230' }),
    at('M2', 'sdk.motor', 3.5),
    at('P', 'pump', 4),
    at('LT', 'sdk.transmitter', 5, { measures: 'level' }),
    at('LS', 'sdk.switch', 6),
  ];
  const validate = (connections: unknown[], associations: unknown[] = []) =>
    validateScene({ schemaVersion: 4, documentType: 'industrial.scene', units: 'm', components: line, connections, associations }, registry.resolvers);
  const errors = (connections: unknown[]) => {
    const r = validate(connections);
    return r.ok ? [] : r.errors.map((e) => [e.code, e.message]);
  };
  const controlLine = [
    edge('w1', 'VFD', 'U-V-W', 'M', 'terminals'),
    edge('w2', 'DO', 'DO0', 'VFD', 'run'),
    edge('w3', 'DO', 'DO1', 'VFD', 'reset'),
    edge('w4', 'AO', 'AO0', 'VFD', 'speedRef'),
    edge('w5', 'VFD', 'speed', 'AI', 'AI0'),
    edge('w6', 'VFD', 'fault', 'DI', 'DI0'),
    edge('w7', 'VFD', 'eth', 'SW', 'P1'),
    edge('w8', 'CPU', 'eth1', 'SW', 'P2'),
    edge('w9', 'LT', 'out', 'AI', 'AI1'),
    edge('w10', 'LS', 'out', 'DI', 'DI1'),
    edge('w11', 'PSU', '24V', 'LT', '24V'),
    edge('w12', 'PSU', '24V', 'LS', '24V'),
    edge('e1', 'VFD', 'PE', 'PNL', 'PE'),
    edge('e2', 'M', 'PE', 'PNL', 'PE'),
    edge('e3', 'PSU', 'PE', 'PNL', 'PE'),
  ];

  it('accepts a PLC → VFD → motor line with a transmitter and a level switch, and a motor driving a pump', () => {
    expect(errors(controlLine)).toEqual([]);
    const r = validate(controlLine, [{ id: 'a1', relationship: 'drives', from: 'M', to: 'P' }]);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    // The chain from the controller to the pump: network, power, then the drives association.
    expect(pathBetween(r.scene, 'CPU', 'P', { resolvePorts: registry.resolvers.resolvePorts })?.map((s) => s.to)).toEqual(['SW', 'VFD', 'M', 'P']);
  });

  it('refuses a motor rated for another voltage, and a transmitter on a 0–10 V input', () => {
    expect(errors([edge('x', 'VFD', 'U-V-W', 'M230', 'terminals')])).toEqual([['INCOMPATIBLE_PORTS', 'Incompatible ports: 400 V cannot connect to 230 V.']]);
    expect(errors([edge('x', 'LT', 'out', 'AI10V', 'AI0')])).toEqual([['INCOMPATIBLE_PORTS', 'Incompatible ports: 4–20 mA cannot connect to 0–10 V.']]);
  });

  it('refuses other miswiring by the ADR-0023 rules', () => {
    expect(errors([edge('x', 'PSU', '24V', 'M', 'terminals')])[0]).toEqual(['INCOMPATIBLE_PORTS', 'Incompatible ports: DC cannot connect to AC.']);
    expect(errors([edge('x', 'LS', 'out', 'AI', 'AI0')])[0]).toEqual(['INCOMPATIBLE_PORTS', 'Incompatible ports: a digital signal cannot connect to an analog one.']);
    expect(errors([edge('x', 'VFD', 'speed', 'LT', 'out')])[0]).toEqual(['INCOMPATIBLE_PORTS', 'Incompatible ports: an output cannot connect to an output.']);
    // One drive output feeds one motor.
    expect(errors([edge('x', 'VFD', 'U-V-W', 'M', 'terminals'), edge('y', 'VFD', 'U-V-W', 'M2', 'terminals')]).map((e) => e[0])).toEqual(['PORT_OCCUPIED']);
    expect(errors([edge('x', 'M', 'shaft', 'VFD', 'eth')])[0][1]).toBe('Incompatible ports: a mechanical port cannot connect to a network port.');
  });

  it('follows its parameters: frame size with rated power, ratings with voltage, unit with the measured quantity', () => {
    const height = (type: string, kw: number) => registry.definitionFor(type, { ratedPowerKw: kw }).bounds.max[1];
    expect(height('sdk.vfd', 90)).toBeGreaterThan(height('sdk.vfd', 0.75));
    expect(height('sdk.motor', 90)).toBeGreaterThan(height('sdk.motor', 0.75));
    const port = (type: string, values: Record<string, string>, id: string) => registry.definitionFor(type, values).ports.find((p) => p.id === id);
    expect(port('sdk.vfd', { supply: '480' }, 'U-V-W')?.power).toEqual({ kind: 'AC', voltage: 480, phases: 3 });
    expect(port('sdk.motor', { voltage: '230' }, 'terminals')?.power).toEqual({ kind: 'AC', voltage: 230, phases: 3 });
    expect(registry.resolvers.resolveVariables('sdk.transmitter', { measures: 'flow' })).toEqual([{ name: 'PV', dataType: 'float32', unit: 'm³/h' }]);
    const panel = registry.definitionFor('sdk.panel', { width: 1.2, height: 2, depth: 0.6 });
    expect(panel.bounds).toEqual({ min: [-0.6, 0, -0.3], max: [0.6, 2, 0.3] });
    expect(panel.ports.find((p) => p.id === 'PE')?.maxConnections).toBe(32);
    expect(registry.validateProperties('sdk.vfd', { ratedPowerKw: 120 })).toEqual([{ property: 'ratedPowerKw', message: 'must be between 0.75 and 90 kW' }]);
  });

  it('suggests drive, instrument and sensor tags; the motor and panel have none', () => {
    const r = validate([]);
    if (!r.ok) throw new Error('scene');
    const ids = suggestVariables(r.scene, registry.resolvers).variables.map((v) => v.id);
    expect(ids.filter((id) => /^(VFD|M|M2|M230|PNL|LT|LS)\./.test(id))).toEqual([
      'VFD.ACTUAL_SPEED', 'VFD.OUTPUT_FREQUENCY', 'VFD.OUTPUT_CURRENT', 'VFD.RUNNING', 'VFD.FAULT', 'LT.PV', 'LS.STATE',
    ]);
  });
});

describe('views on definitions (ADR-0026)', () => {
  it('puts instruments in both 2D views and checks the names hosts give', () => {
    expect(byType('sdk.transmitter').views).toEqual(['process', 'electrical']);
    expect(byType('sdk.switch').views).toEqual(['process', 'electrical']);
    expect(byType('sdk.vfd').views).toBeUndefined();
    const base = { ...byType('sdk.plc.cpu'), type: 'com.test.box' };
    expect(() => createComponentRegistry({ ...base, views: ['electrical'] })).not.toThrow();
    for (const views of [[], ['pid'], ['process', 'process']]) {
      expect(() => createComponentRegistry({ ...base, views: views as never })).toThrow('needs views as distinct names from process, electrical');
    }
  });
});
