import { describe, expect, it } from 'vitest';
import {
  applyTagSuggestions,
  reviewTags,
  suggestVariables,
  validateScene,
  type ComponentType,
  type ConnectionPort,
  type Quantity,
  type ScadaScene,
  type SceneValidationOptions,
  type VariableTemplate,
} from './index.js';

// Tag suggestions and review (ADR-0024, T-079): proposals and findings only; nothing is applied
// without an explicit call, and nothing is guessed from names.

const bindable: Record<string, Record<string, Quantity>> = {
  'com.example.tank': { level: 'percent', temperature: 'temperature' },
  'com.example.vfd': {},
  'com.example.panel': {},
};
const templates: Record<string, VariableTemplate[]> = {
  'com.example.tank': [{ name: 'LEVEL', dataType: 'float32', unit: '%', property: 'level' }, { name: 'TEMP', dataType: 'float32', unit: '°C', property: 'temperature' }],
  'com.example.vfd': [{ name: 'ACTUAL_SPEED', dataType: 'float32', unit: 'rpm' }, { name: 'FAULT', dataType: 'bool' }],
};
const options: SceneValidationOptions = {
  resolvePorts: (_t: ComponentType): ConnectionPort[] => [],
  resolveType: (t) => t in bindable,
  resolveBindable: (t) => bindable[t],
};
const suggestOptions = { resolveBindable: options.resolveBindable, resolveVariables: (t: ComponentType) => templates[t] };
const part = (id: string, type: string) => ({ id, type, position: { x: 0, y: 0, z: 0 }, rotation: { x: 0, y: 0, z: 0, w: 1 }, scale: { x: 1, y: 1, z: 1 }, properties: {} });
const valid = (input: object): ScadaScene => {
  const r = validateScene({ schemaVersion: 4, documentType: 'industrial.scene', units: 'm', connections: [], ...input }, options);
  if (!r.ok) throw new Error(JSON.stringify(r.errors));
  return r.scene;
};

describe('suggestVariables', () => {
  const plant = valid({ components: [part('T-101', 'com.example.tank'), part('VFD-101', 'com.example.vfd'), part('P-1', 'com.example.panel')] });

  it('proposes read-only tags from templates, and bindings for templates that drive a property', () => {
    expect(suggestVariables(plant, suggestOptions)).toEqual({
      variables: [
        { id: 'T-101.LEVEL', componentId: 'T-101', dataType: 'float32', unit: '%', access: 'read' },
        { id: 'T-101.TEMP', componentId: 'T-101', dataType: 'float32', unit: '°C', access: 'read' },
        { id: 'VFD-101.ACTUAL_SPEED', componentId: 'VFD-101', dataType: 'float32', unit: 'rpm', access: 'read' },
        { id: 'VFD-101.FAULT', componentId: 'VFD-101', dataType: 'bool', access: 'read' },
      ],
      bindings: [
        { id: 'bind:T-101.LEVEL', tagId: 'T-101.LEVEL', kind: 'property', instanceId: 'T-101', property: 'level' },
        { id: 'bind:T-101.TEMP', tagId: 'T-101.TEMP', kind: 'property', instanceId: 'T-101', property: 'temperature' },
      ],
    });
  });

  it('changes nothing by itself, and applying everything gives a valid scene that suggests nothing more', () => {
    const before = JSON.stringify(plant);
    const proposals = suggestVariables(plant, suggestOptions);
    expect(JSON.stringify(plant)).toBe(before);
    const applied = applyTagSuggestions(plant, proposals, options);
    expect(applied.ok).toBe(true);
    if (!applied.ok) return;
    expect(applied.scene.runtimeVariables).toHaveLength(4);
    expect(suggestVariables(applied.scene, suggestOptions)).toEqual({ variables: [], bindings: [] });
  });

  it('applies only what the user picked', () => {
    const proposals = suggestVariables(plant, suggestOptions);
    const applied = applyTagSuggestions(plant, { variables: [proposals.variables[0]], bindings: [proposals.bindings[0]] }, options);
    expect(applied.ok && applied.scene.runtimeVariables?.map((v) => v.id)).toEqual(['T-101.LEVEL']);
    expect(applied.ok && applied.scene.tagBindings?.map((b) => b.id)).toEqual(['bind:T-101.LEVEL']);
  });

  it('refuses a pick that would make the document invalid, leaving the scene unchanged', () => {
    const proposals = suggestVariables(plant, suggestOptions);
    const applied = applyTagSuggestions(plant, { variables: [], bindings: [proposals.bindings[0]] }, options);
    // The binding alone is fine (an opaque tag); a bool tag driving a level is not.
    expect(applied.ok).toBe(true);
    const wrong = applyTagSuggestions(plant, { variables: [{ ...proposals.variables[0], dataType: 'bool' }], bindings: [proposals.bindings[0]] }, options);
    expect(wrong.ok ? [] : wrong.errors.map((e) => e.code)).toEqual(['TYPE_MISMATCH']);
    expect(plant.runtimeVariables).toBeUndefined();
  });

  it('leaves existing tags and already bound properties alone', () => {
    const scene = valid({
      components: [part('T-101', 'com.example.tank')],
      runtimeVariables: [{ id: 'T-101.LEVEL', dataType: 'float32', access: 'read' }],
      tagBindings: [{ id: 'b', tagId: 'HOST-TT', kind: 'property', instanceId: 'T-101', property: 'temperature' }],
    });
    expect(suggestVariables(scene, suggestOptions)).toEqual({
      variables: [{ id: 'T-101.TEMP', componentId: 'T-101', dataType: 'float32', unit: '°C', access: 'read' }],
      bindings: [],
    });
  });
});

describe('reviewTags', () => {
  const plc = { id: 'ds', protocol: 'modbus-tcp' };
  const modbus = (id: string, dataType: string, address: object) => ({ id, dataType, access: 'read', source: { dataSourceId: 'ds', address: { area: 'holding', unitId: 1, ...address } } });

  it('is empty for a fully tagged scene', () => {
    const scene = valid({
      components: [part('T-101', 'com.example.tank')],
      dataSources: [plc],
      runtimeVariables: [modbus('LT', 'float32', { address: 0 })],
      tagBindings: [{ id: 'b', tagId: 'LT', kind: 'property', instanceId: 'T-101', property: 'level' }],
    });
    expect(reviewTags(scene, options)).toEqual([]);
  });

  it('reports untagged components, unused tags and undescribed tags, in order', () => {
    const scene = valid({
      components: [part('T-101', 'com.example.tank'), part('T-102', 'com.example.tank'), part('VFD-101', 'com.example.vfd')],
      runtimeVariables: [{ id: 'SPARE', dataType: 'bool', access: 'read' }],
      tagBindings: [{ id: 'b', tagId: 'HOST-LT', kind: 'property', instanceId: 'T-101', property: 'level' }],
    });
    expect(reviewTags(scene, options)).toEqual([
      { code: 'UNBOUND_COMPONENT', path: 'components[1]', message: '"T-102" has bindable level, temperature but no tag drives it.' },
      { code: 'UNUSED_VARIABLE', path: 'runtimeVariables[0]', message: 'No binding uses tag "SPARE".' },
      { code: 'UNDESCRIBED_TAG', path: 'tagBindings[0].tagId', message: 'Tag "HOST-LT" has no runtime variable.' },
    ]);
    // Without resolveBindable the component check is skipped.
    expect(reviewTags(scene).map((f) => f.code)).toEqual(['UNUSED_VARIABLE', 'UNDESCRIBED_TAG']);
  });

  it('does not call opaque host tags undescribed when the scene defines no variables', () => {
    const scene = valid({ components: [part('T-101', 'com.example.tank')], tagBindings: [{ id: 'b', tagId: 'HOST', kind: 'property', instanceId: 'T-101', property: 'level' }] });
    expect(reviewTags(scene, options)).toEqual([]);
  });

  it('finds overlapping Modbus register spans, but not neighbours, other areas, units or bits', () => {
    const findings = (variables: object[]) =>
      reviewTags(valid({ components: [], dataSources: [plc, { id: 'ds2', protocol: 'modbus-tcp' }], runtimeVariables: variables })).filter((f) => f.code === 'OVERLAPPING_REGISTERS').map((f) => [f.path, f.message]);
    expect(findings([modbus('A', 'float32', { address: 10 }), modbus('B', 'int16', { address: 11 })])).toEqual([
      ['runtimeVariables[1].source.address', 'Tag "B" overlaps tag "A" on the same Modbus source, unit and area.'],
    ]);
    expect(findings([modbus('A', 'float64', { address: 10 }), modbus('B', 'int16', { address: 13 })])).toHaveLength(1);
    expect(findings([modbus('A', 'float32', { address: 10 }), modbus('B', 'int16', { address: 12 })])).toEqual([]);
    expect(findings([modbus('A', 'float32', { address: 10 }), modbus('B', 'int16', { address: 10, area: 'input' })])).toEqual([]);
    expect(findings([modbus('A', 'float32', { address: 10 }), modbus('B', 'int16', { address: 10, unitId: 2 })])).toEqual([]);
    expect(findings([modbus('A', 'float32', { address: 10 }), { ...modbus('B', 'int16', { address: 10 }), source: { dataSourceId: 'ds2', address: { area: 'holding', address: 10, unitId: 1 } } }])).toEqual([]);
    expect(findings([modbus('A', 'bool', { address: 5, bit: 0 }), modbus('B', 'bool', { address: 5, bit: 1 })])).toEqual([]);
    expect(findings([modbus('A', 'bool', { address: 5, bit: 3 }), modbus('B', 'bool', { address: 5, bit: 3 })])).toHaveLength(1);
    expect(findings([modbus('A', 'bool', { address: 5, bit: 3 }), modbus('B', 'int16', { address: 5 })])).toHaveLength(1);
  });
});
