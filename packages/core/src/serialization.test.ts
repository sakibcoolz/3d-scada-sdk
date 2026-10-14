import { describe, expect, it } from 'vitest';
import {
  parseScene,
  quaternionFromEuler,
  serializeScene,
  validateScene,
  type ComponentKind,
  type ConnectionPort,
  type ScadaScene,
  type SceneValidationOptions,
} from './index';

const fluid = (id: string): ConnectionPort => ({ id, kind: 'fluid', position: [0, 0, 0], direction: [1, 0, 0], nominalSize: 0.15 });
const ports: Partial<Record<ComponentKind, ConnectionPort[]>> = {
  tank: [fluid('inlet'), fluid('outlet')],
  valve: [fluid('in'), fluid('out')],
};
const options: SceneValidationOptions = { resolvePorts: (type) => ports[type] };

/** A connected, rotated scene with a scaled portless sensor and mixed property types. */
function linkedScene(): ScadaScene {
  return {
    schemaVersion: 2,
    units: 'm',
    components: [
      { id: 'tank', type: 'tank', position: [0, 1.535, 0], rotation: [0, 0, 0, 1], scale: [1, 1, 1], properties: { level: 60, label: 'T-101' } },
      {
        id: 'valve',
        type: 'valve',
        position: [1.8, 0.635, -0.25],
        rotation: quaternionFromEuler([0, Math.PI / 2, 0]),
        scale: [1, 1, 1],
        properties: { open: false },
      },
      { id: 'sensor', type: 'sensor', position: [-2, 0.3, 1], rotation: [0, 0, 0, 1], scale: [2, 1, 2], properties: {} },
    ],
    connections: [{ id: 'e1', from: { instanceId: 'tank', portId: 'outlet' }, to: { instanceId: 'valve', portId: 'in' } }],
  };
}

describe('serializeScene', () => {
  it('round-trips a linked rotated scene exactly', () => {
    const scene = linkedScene();
    const result = parseScene(serializeScene(scene), options);
    expect(result).toEqual({ ok: true, scene });
  });

  it('is byte-stable across save, load and save', () => {
    const first = serializeScene(linkedScene());
    const reloaded = parseScene(first, options);
    if (!reloaded.ok) throw new Error('expected valid scene');
    expect(serializeScene(reloaded.scene)).toBe(first);
  });

  it('writes keys in a fixed order regardless of object construction order', () => {
    const scene = linkedScene();
    const shuffled = JSON.parse(JSON.stringify(scene), (_, value) =>
      value && typeof value === 'object' && !Array.isArray(value) ? Object.fromEntries(Object.entries(value).reverse()) : value,
    ) as ScadaScene;
    expect(serializeScene(shuffled)).toBe(serializeScene(scene));
  });

  it('sorts property keys and starts with the schema header', () => {
    const scene = linkedScene();
    scene.components[0].properties = { zeta: 1, alpha: true };
    const text = serializeScene(scene);
    expect(text.startsWith('{\n  "schemaVersion": 2,\n  "units": "m",\n')).toBe(true);
    expect(text.indexOf('"alpha"')).toBeLessThan(text.indexOf('"zeta"'));
    expect(text.endsWith('}\n')).toBe(true);
  });

  it('never writes negative zero', () => {
    const scene = linkedScene();
    scene.components[0].position = [-0, 1, -0];
    expect(serializeScene(scene)).not.toContain('-0,');
  });

  it('writes only authored fields', () => {
    const scene = linkedScene() as ScadaScene & { selection?: string };
    scene.selection = 'tank';
    expect(serializeScene(scene)).not.toContain('selection');
  });
});

describe('parseScene', () => {
  it('rejects text that is not JSON', () => {
    expect(parseScene('{"schemaVersion": 2,', options)).toEqual({
      ok: false,
      errors: [expect.objectContaining({ code: 'INVALID_JSON', path: '' })],
    });
  });

  it('rejects oversized text before parsing it', () => {
    const text = serializeScene(linkedScene());
    expect(parseScene(text, { ...options, maxLength: text.length - 1 })).toEqual({
      ok: false,
      errors: [expect.objectContaining({ code: 'LIMIT_EXCEEDED', path: '' })],
    });
    expect(parseScene(text, { ...options, maxLength: text.length }).ok).toBe(true);
  });

  it('reports validation errors from the parsed document', () => {
    const broken = serializeScene(linkedScene()).replace('"portId": "outlet"', '"portId": "drain"');
    expect(parseScene(broken, options)).toEqual({ ok: false, errors: [expect.objectContaining({ code: 'UNKNOWN_PORT' })] });
  });

  it('loads a version 1 file, migrates it, and saves it as version 2', () => {
    const v1 = JSON.stringify({
      version: 1,
      components: [
        { id: 'tank', kind: 'tank', position: [0, 1.535, 0], rotation: [0, 0, 0], properties: { level: 60 } },
        { id: 'valve', kind: 'valve', position: [1.8, 0.635, 0], rotation: [0, Math.PI / 2, 0], properties: {} },
      ],
      connections: [{ id: 'e1', from: { instanceId: 'tank', portId: 'outlet' }, to: { instanceId: 'valve', portId: 'in' } }],
    });
    const result = parseScene(v1, options);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.migratedFrom).toBe(1);
    expect(result.scene.schemaVersion).toBe(2);
    expect(JSON.parse(serializeScene(result.scene)).schemaVersion).toBe(2);
    const resaved = parseScene(serializeScene(result.scene), options);
    expect(resaved).toEqual({ ok: true, scene: result.scene });
  });
});

describe('validateScene result for current documents', () => {
  it('does not report a migration for a version 2 document', () => {
    expect(validateScene(linkedScene(), options)).toEqual({ ok: true, scene: linkedScene() });
  });
});
