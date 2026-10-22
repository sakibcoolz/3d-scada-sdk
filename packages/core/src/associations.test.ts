import { describe, expect, it } from 'vitest';
import {
  addAssociation,
  copyComponents,
  createEmptyScene,
  parseScene,
  pasteComponents,
  removeAssociation,
  removeComponent,
  routeScene,
  serializeScene,
  validateScene,
  type ComponentType,
  type ConnectionPort,
  type ScadaScene,
  type SceneValidationOptions,
} from './index.js';

// Associations (ADR-0023, T-075): port-less, directed logical links between components.

const portsOf: Record<string, ConnectionPort[]> = {
  'com.example.plc': [{ id: 'eth', kind: 'network', position: [0, 1, 0], direction: [0, 1, 0] }],
  'com.example.vfd': [{ id: 'eth', kind: 'network', position: [0, 1, 0], direction: [0, 1, 0] }],
  'com.example.motor': [],
};
const options: SceneValidationOptions = { resolvePorts: (t: ComponentType) => portsOf[t], resolveType: (t) => t in portsOf };
const part = (id: string, type: string, x: number) => ({ id, type, position: { x, y: 0, z: 0 }, rotation: { x: 0, y: 0, z: 0, w: 1 }, scale: { x: 1, y: 1, z: 1 }, properties: {} });
const doc = (associations?: unknown[], connections: unknown[] = []) => ({
  schemaVersion: 4,
  documentType: 'industrial.scene',
  units: 'm',
  components: [part('PLC-01', 'com.example.plc', 0), part('VFD-101', 'com.example.vfd', 2), part('M-101', 'com.example.motor', 4)],
  connections,
  ...(associations ? { associations } : {}),
});
const controls = { id: 'a1', relationship: 'controls', from: 'PLC-01', to: 'VFD-101' };
const errors = (input: unknown) => {
  const r = validateScene(input, options);
  return r.ok ? [] : r.errors.map((e) => [e.code, e.path]);
};
const valid = (input: unknown): ScadaScene => {
  const r = validateScene(input, options);
  if (!r.ok) throw new Error(JSON.stringify(r.errors));
  return r.scene;
};

describe('reading and writing associations', () => {
  it('keeps them after connections, in canonical key order, and round-trips byte-stable', () => {
    const scene = valid(doc([{ properties: { since: '2026', note: 'speed reference' }, to: 'M-101', from: 'VFD-101', relationship: 'drives', id: 'a2' }, controls]));
    const text = serializeScene(scene);
    const written = JSON.parse(text);
    expect(Object.keys(written)).toEqual(['schemaVersion', 'documentType', 'units', 'components', 'connections', 'associations']);
    expect(Object.keys(written.associations[0])).toEqual(['id', 'relationship', 'from', 'to', 'properties']);
    expect(Object.keys(written.associations[0].properties)).toEqual(['note', 'since']);
    expect(written.associations[1]).toEqual(controls);
    const again = parseScene(text, options);
    expect(again.ok && serializeScene(again.scene)).toBe(text);
  });

  it('leaves the field out of scenes without associations', () => {
    expect(serializeScene(valid(doc()))).not.toContain('associations');
  });

  it('accepts a namespaced host relationship and the reverse direction as a separate fact', () => {
    expect(errors(doc([controls, { ...controls, id: 'a2', from: 'VFD-101', to: 'PLC-01' }, { ...controls, id: 'a3', relationship: 'com.example.supervises' }]))).toEqual([]);
  });

  it('rejects malformed associations', () => {
    expect(errors(doc([{ id: 'a1', from: 'PLC-01', to: 'VFD-101' }]))).toEqual([['INVALID_FIELD', 'associations[0].relationship']]);
    expect(errors(doc([{ ...controls, relationship: 'pushes' }]))).toEqual([['INVALID_FIELD', 'associations[0].relationship']]);
    expect(errors(doc([{ ...controls, from: 7 }]))).toEqual([['INVALID_FIELD', 'associations[0].from']]);
    expect(errors(doc([{ ...controls, portId: 'eth' }]))).toEqual([['UNKNOWN_FIELD', 'associations[0].portId']]);
    expect(errors(doc([{ ...controls, properties: { apiKey: 'x' } }]))).toEqual([['SECRET_FIELD', 'associations[0].properties.apiKey']]);
    expect(errors(doc({} as unknown[]))).toEqual([['INVALID_FIELD', 'associations']]);
  });

  it('checks references, self links, duplicates and the shared id namespace', () => {
    expect(errors(doc([{ ...controls, to: 'VFD-999' }]))).toEqual([['UNKNOWN_INSTANCE', 'associations[0].to']]);
    expect(errors(doc([{ ...controls, to: 'PLC-01' }]))).toEqual([['SELF_CONNECTION', 'associations[0]']]);
    expect(errors(doc([controls, { ...controls, id: 'a2' }]))).toEqual([['DUPLICATE_EDGE', 'associations[1]']]);
    expect(errors(doc([controls, { ...controls, to: 'M-101' }]))).toEqual([['DUPLICATE_CONNECTION_ID', 'associations[1].id']]);
    const wire = { id: 'a1', from: { instanceId: 'PLC-01', portId: 'eth' }, to: { instanceId: 'VFD-101', portId: 'eth' } };
    expect(errors(doc([controls], [wire]))).toEqual([['DUPLICATE_CONNECTION_ID', 'associations[0].id']]);
  });

  it('rejects associations in version 3 files', () => {
    const v3 = { schemaVersion: 3, units: 'm', components: [], connections: [], associations: [] };
    expect(errors(v3)).toEqual([['UNKNOWN_FIELD', 'associations']]);
  });

  it('enforces the association limit separately from connections', () => {
    const r = validateScene(doc([controls, { ...controls, id: 'a2', to: 'M-101' }]), { ...options, limits: { maxAssociations: 1 } });
    expect(r.ok ? [] : r.errors.map((e) => e.code)).toEqual(['LIMIT_EXCEEDED']);
  });
});

describe('association graph helpers', () => {
  const base = valid(doc());

  it('adds and removes, leaving the file as it was', () => {
    const added = addAssociation(base, controls, options);
    expect(added.ok && added.scene.associations).toEqual([controls]);
    if (!added.ok) return;
    const removed = removeAssociation(added.scene, 'a1');
    expect(removed.ok && serializeScene(removed.scene)).toBe(serializeScene(base));
    expect(removeAssociation(base, 'a1')).toEqual({ ok: false, error: { code: 'UNKNOWN_ASSOCIATION', message: 'No association "a1".' } });
  });

  it('reports the new association’s problem', () => {
    expect(addAssociation(base, { ...controls, to: 'nowhere' }, options)).toEqual({ ok: false, error: { code: 'UNKNOWN_INSTANCE', message: 'No component "nowhere".' } });
  });

  it('removing a component removes its associations, and the field when none are left', () => {
    const scene = valid(doc([controls, { id: 'a2', relationship: 'drives', from: 'VFD-101', to: 'M-101' }]));
    const noMotor = removeComponent(scene, 'M-101');
    expect(noMotor.ok && noMotor.scene.associations).toEqual([controls]);
    const noDrive = removeComponent(scene, 'VFD-101');
    expect(noDrive.ok && 'associations' in noDrive.scene).toBe(false);
  });

  it('copy and paste carry associations whose both ends are copied, with new ids', () => {
    const scene = valid(doc([controls, { id: 'a2', relationship: 'drives', from: 'VFD-101', to: 'M-101', properties: { note: 'x' } }]));
    const clip = copyComponents(scene, ['VFD-101', 'M-101']);
    expect(clip.associations).toEqual([{ id: 'a2', relationship: 'drives', from: 'VFD-101', to: 'M-101', properties: { note: 'x' } }]);
    let n = 0;
    const pasted = pasteComponents(scene, clip, { createId: () => `n${n++}`, offset: { x: 0, y: 0, z: 3 } });
    expect(pasted.scene.associations?.slice(2)).toEqual([{ id: 'n2', relationship: 'drives', from: 'n0', to: 'n1', properties: { note: 'x' } }]);
    expect(validateScene(pasted.scene, options).ok).toBe(true);
    // Nothing copied, nothing added: a scene without associations stays without the field.
    const empty = pasteComponents(createEmptyScene(), copyComponents(valid(doc()), ['PLC-01']), { createId: () => `m${n++}`, offset: { x: 0, y: 0, z: 0 } });
    expect('associations' in empty.scene).toBe(false);
  });

  it('are never routed', () => {
    expect(routeScene(valid(doc([controls])), options)).toEqual([]);
  });
});
