import { describe, expect, it } from 'vitest';
import {
  disconnect,
  parseScene,
  removeComponent,
  serializeScene,
  toCanonical,
  validateScene,
  type ComponentType,
  type ConnectionPort,
  type Quantity,
  type ScadaScene,
  type SceneValidationErrorCode,
  type SceneValidationOptions,
  type TagBinding,
} from './index.js';

const fluid = (id: string): ConnectionPort => ({ id, kind: 'fluid', position: [0, 0, 0], direction: [1, 0, 0], nominalSize: 0.15 });
const ports: Partial<Record<ComponentType, ConnectionPort[]>> = { tank: [fluid('inlet'), fluid('outlet')], valve: [fluid('in'), fluid('out')] };
const bindable: Partial<Record<ComponentType, Record<string, Quantity>>> = {
  tank: { level: 'percent', temperature: 'temperature' },
  valve: { open: 'boolean' },
};
const options: SceneValidationOptions = { resolvePorts: (t) => ports[t], resolveBindable: (t) => bindable[t] };

const bindings = (): TagBinding[] => [
  { id: 'b1', tagId: 'LT-101', kind: 'property', instanceId: 'tank', property: 'level' },
  { id: 'b2', tagId: 'TT-101', kind: 'property', instanceId: 'tank', property: 'temperature', unit: 'K' },
  { id: 'b3', tagId: 'XV-101', kind: 'property', instanceId: 'valve', property: 'open' },
  { id: 'b4', tagId: 'FT-101', kind: 'flow', connectionId: 'e1', unit: 'm³/h' },
];

/** `null` means no tagBindings field at all. */
function scene(tagBindings: unknown = bindings()): Record<string, unknown> {
  return {
    schemaVersion: 4,
    documentType: 'industrial.scene',
    units: 'm',
    components: [
      { id: 'tank', type: 'tank', position: { x: 0, y: 1.535, z: 0 }, rotation: { x: 0, y: 0, z: 0, w: 1 }, scale: { x: 1, y: 1, z: 1 }, properties: { level: 45 } },
      { id: 'valve', type: 'valve', position: { x: 1.8, y: 0.635, z: 0 }, rotation: { x: 0, y: 0, z: 0, w: 1 }, scale: { x: 1, y: 1, z: 1 }, properties: {} },
    ],
    connections: [{ id: 'e1', from: { instanceId: 'tank', portId: 'outlet' }, to: { instanceId: 'valve', portId: 'in' } }],
    ...(tagBindings === null ? {} : { tagBindings }),
  };
}

function codes(input: unknown): SceneValidationErrorCode[] {
  const result = validateScene(input, options);
  return result.ok ? [] : result.errors.map((e) => e.code);
}

describe('tagBindings validation', () => {
  it('accepts property and flow bindings and keeps them in the scene', () => {
    const result = validateScene(scene(), options);
    expect(result).toEqual({ ok: true, scene: scene() });
  });

  it('keeps tagBindings optional and absent when not given', () => {
    const result = validateScene(scene(null), options);
    expect(result.ok && 'tagBindings' in result.scene).toBe(false);
  });

  it('rejects bindings in a version 1 document', () => {
    expect(codes({ version: 1, components: [], connections: [], tagBindings: [] })).toEqual(['UNKNOWN_FIELD']);
  });

  it.each([
    ['a non-array', 'LT-101', 'INVALID_FIELD'],
    ['an unknown kind', [{ id: 'b', tagId: 'T', kind: 'alarm', instanceId: 'tank', property: 'level' }], 'INVALID_FIELD'],
    ['an empty tag id', [{ id: 'b', tagId: '', kind: 'property', instanceId: 'tank', property: 'level' }], 'INVALID_FIELD'],
    ['a flow field on a property binding', [{ id: 'b', tagId: 'T', kind: 'property', instanceId: 'tank', property: 'level', connectionId: 'e1' }], 'UNKNOWN_FIELD'],
    ['a non-string unit', [{ id: 'b', tagId: 'T', kind: 'flow', connectionId: 'e1', unit: 3 }], 'INVALID_FIELD'],
  ])('rejects %s', (_, tagBindings, code) => {
    expect(codes(scene(tagBindings))).toContain(code);
  });

  it.each([
    ['a missing component', { id: 'b', tagId: 'T', kind: 'property', instanceId: 'ghost', property: 'level' }, 'UNKNOWN_INSTANCE'],
    ['a property the type cannot bind', { id: 'b', tagId: 'T', kind: 'property', instanceId: 'valve', property: 'level' }, 'UNBINDABLE_PROPERTY'],
    ['a unit of the wrong quantity', { id: 'b', tagId: 'T', kind: 'property', instanceId: 'tank', property: 'level', unit: 'K' }, 'INVALID_UNIT'],
    ['a unit on a boolean', { id: 'b', tagId: 'T', kind: 'property', instanceId: 'valve', property: 'open', unit: '%' }, 'INVALID_UNIT'],
    ['a missing connection', { id: 'b', tagId: 'T', kind: 'flow', connectionId: 'e9' }, 'UNKNOWN_CONNECTION'],
    ['an unknown flow unit', { id: 'b', tagId: 'T', kind: 'flow', connectionId: 'e1', unit: 'gpm' }, 'INVALID_UNIT'],
  ])('rejects a binding to %s', (_, binding, code) => {
    expect(codes(scene([binding]))).toEqual([code]);
  });

  it('rejects duplicate binding ids and two tags driving the same target', () => {
    expect(codes(scene([...bindings(), { ...bindings()[0], tagId: 'LT-999' }]))).toEqual(['DUPLICATE_BINDING_ID']);
    expect(codes(scene([...bindings(), { ...bindings()[0], id: 'b9', tagId: 'LT-999' }]))).toEqual(['DUPLICATE_BINDING_TARGET']);
    expect(codes(scene([...bindings(), { ...bindings()[3], id: 'b9', tagId: 'FT-999' }]))).toEqual(['DUPLICATE_BINDING_TARGET']);
  });

  it('allows one tag to drive several targets', () => {
    expect(codes(scene([...bindings(), { id: 'b9', tagId: 'LT-101', kind: 'flow', connectionId: 'e1' }].filter((b) => b.id !== 'b4')))).toEqual([]);
  });

  it('enforces the binding count limit', () => {
    expect(validateScene(scene(), { ...options, limits: { maxBindings: 3 } })).toEqual({
      ok: false,
      errors: [expect.objectContaining({ code: 'LIMIT_EXCEEDED', path: 'tagBindings' })],
    });
  });

  it('accepts any property name when no bindable-property resolver is given', () => {
    const anyProperty = [{ id: 'b', tagId: 'T', kind: 'property', instanceId: 'valve', property: 'rpm' }];
    expect(validateScene(scene(anyProperty), { resolvePorts: options.resolvePorts }).ok).toBe(true);
  });
});

describe('tagBindings serialization', () => {
  it('round-trips byte-identically with canonical key order', () => {
    const shuffled = { ...scene(), tagBindings: bindings().map((b) => Object.fromEntries(Object.entries(b).reverse())) };
    const result = validateScene(shuffled, options);
    if (!result.ok) throw new Error('expected valid');
    const text = serializeScene(result.scene);
    expect(text).toContain('"id": "b2",\n      "tagId": "TT-101",\n      "kind": "property",\n      "instanceId": "tank",\n      "property": "temperature",\n      "unit": "K"');
    const reloaded = parseScene(text, options);
    expect(reloaded.ok && serializeScene(reloaded.scene)).toBe(text);
  });

  it('writes no tagBindings key for a scene without bindings', () => {
    const result = validateScene(scene(null), options);
    if (!result.ok) throw new Error('expected valid');
    expect(serializeScene(result.scene)).not.toContain('tagBindings');
  });
});

describe('tagBindings stay consistent with the graph', () => {
  const valid = (): ScadaScene => {
    const result = validateScene(scene(), options);
    if (!result.ok) throw new Error('expected valid');
    return result.scene;
  };

  it('drops property and flow bindings of a removed component', () => {
    const result = removeComponent(valid(), 'valve');
    if (!result.ok) throw new Error('expected ok');
    expect(result.scene.tagBindings!.map((b) => b.id)).toEqual(['b1', 'b2']);
    expect(validateScene(result.scene, options).ok).toBe(true);
  });

  it('drops flow bindings of a disconnected edge', () => {
    const result = disconnect(valid(), 'e1');
    if (!result.ok) throw new Error('expected ok');
    expect(result.scene.tagBindings!.map((b) => b.id)).toEqual(['b1', 'b2', 'b3']);
  });

  it('leaves a scene without bindings without the field', () => {
    const base = validateScene(scene(null), options);
    if (!base.ok) throw new Error('expected valid');
    const result = removeComponent(base.scene, 'valve');
    expect(result.ok && 'tagBindings' in result.scene).toBe(false);
  });
});

describe('toCanonical', () => {
  it.each([
    ['percent', 40, undefined, 40],
    ['percent', 40, '%', 40],
    ['temperature', 20, '°C', 20],
    ['temperature', 293.15, 'K', 20],
    ['temperature', 68, '°F', 20],
    ['flow', 2, 'm³/s', 2],
    ['flow', 3600, 'm3/h', 1],
    ['flow', 1000, 'L/s', 1],
    ['flow', 60000, 'L/min', 1],
  ] as const)('converts %s %p %s', (quantity, value, unit, expected) => {
    expect(toCanonical(quantity, value, unit)).toBeCloseTo(expected, 12);
  });

  it.each([
    ['percent', 'K'],
    ['temperature', '%'],
    ['flow', 'gpm'],
  ] as const)('refuses %s in %s', (quantity, unit) => {
    expect(toCanonical(quantity, 1, unit)).toBeUndefined();
  });
});
