import { describe, expect, it } from 'vitest';
import { serializeScene, type ScadaScene, type SceneValidationError } from '@scada3d/core';
import { asme } from '@scada3d/components';
import { formatSceneErrors, importSceneText, MAX_SCENE_FILE_BYTES } from './sceneFile.js';

const linked: ScadaScene = {
  schemaVersion: 3,
  units: 'm',
  components: [
    { id: 'tank', type: 'tank', position: { x: 0, y: 1.535, z: 0 }, rotation: { x: 0, y: 0, z: 0, w: 1 }, scale: { x: 1, y: 1, z: 1 }, properties: { level: 60 } },
    { id: 'valve', type: 'valve', position: { x: 1.2 + asme.DN150.valveFaceToFace / 2, y: 0.635, z: 0 }, rotation: { x: 0, y: 0, z: 0, w: 1 }, scale: { x: 1, y: 1, z: 1 }, properties: { open: true } },
  ],
  connections: [{ id: 'e1', from: { instanceId: 'valve', portId: 'in' }, to: { instanceId: 'tank', portId: 'outlet' } }],
};

describe('importSceneText', () => {
  it('loads a canonical version 3 file against the catalog ports', () => {
    expect(importSceneText(serializeScene(linked))).toEqual({ ok: true, scene: linked, message: 'Loaded 2 components and 1 connection.' });
  });

  it('closes up an older file written with the 1.2 m valve and says so', () => {
    const older = { ...linked, components: linked.components.map((c) => (c.id === 'valve' ? { ...c, position: { ...c.position, x: 1.8 } } : c)) };
    const result = importSceneText(serializeScene(older));
    expect(result).toEqual(expect.objectContaining({ ok: true, message: 'Loaded 2 components and 1 connection. Updated 1 part to ASME dimensions.' }));
    if (!result.ok) return;
    const valve = result.scene.components.find((c) => c.id === 'valve')!;
    expect(valve.position.x).toBeCloseTo(1.2 + asme.DN150.valveFaceToFace / 2, 9);
    expect(valve.position.y).toBeCloseTo(0.635, 9);
  });

  it('migrates a version 1 file and says so', () => {
    const v1 = JSON.stringify({
      version: 1,
      components: [{ id: 'tank', kind: 'tank', position: [0, 1.535, 0], rotation: [0, 0, 0], properties: {} }],
      connections: [],
    });
    const result = importSceneText(v1);
    expect(result).toEqual(
      expect.objectContaining({ ok: true, message: 'Loaded 1 component and 0 connections (migrated from version 1).' }),
    );
  });

  it('reports invalid JSON', () => {
    const result = importSceneText('{ "schemaVersion": 2');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors[0]).toMatch(/^Not valid JSON/);
  });

  it('reports catalog-level problems such as an undeclared port', () => {
    const text = serializeScene(linked).replace('"portId": "outlet"', '"portId": "drain"');
    expect(importSceneText(text)).toEqual({ ok: false, errors: ['connections[0].to.portId: A tank has no port "drain".'] });
  });

  it('rejects text longer than the file limit before parsing', () => {
    const result = importSceneText(' '.repeat(MAX_SCENE_FILE_BYTES + 1));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors[0]).toMatch(/longer than/);
  });
});

describe('formatSceneErrors', () => {
  const error = (i: number): SceneValidationError => ({ code: 'INVALID_FIELD', path: `components[${i}].position`, message: 'Expected three finite numbers.' });

  it('prefixes each message with its path, or nothing for the document root', () => {
    expect(formatSceneErrors([error(0), { code: 'INVALID_JSON', path: '', message: 'Not valid JSON: x' }])).toEqual([
      'components[0].position: Expected three finite numbers.',
      'Not valid JSON: x',
    ]);
  });

  it('caps a long list and says how many were left out', () => {
    const lines = formatSceneErrors(Array.from({ length: 25 }, (_, i) => error(i)));
    expect(lines).toHaveLength(21);
    expect(lines[20]).toBe('…and 5 more errors.');
  });
});

describe('importSceneText with tag bindings', () => {
  it('rejects a binding to a property the catalog does not allow', () => {
    const text = serializeScene({ ...linked, tagBindings: [{ id: 'b', tagId: 'T', kind: 'property', instanceId: 'valve', property: 'level' }] });
    expect(importSceneText(text)).toEqual({ ok: false, errors: ['tagBindings[0].property: A valve has no bindable property "level".'] });
  });
});

describe('importSceneText with an underlay (ADR-0012)', () => {
  const scene = (svg: string) => JSON.stringify({ schemaVersion: 3, units: 'm', components: [], connections: [], underlay: { svg, position: { x: 0, z: 0 }, width: 20, rotation: 0, opacity: 0.6 } });

  it('accepts a sanitized underlay', () => {
    const r = importSceneText(scene('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><path d="M0 0L5 5"/></svg>'));
    expect(r.ok && r.scene.underlay?.width).toBe(20);
  });

  it('refuses an underlay with a script, saying why', () => {
    const r = importSceneText(scene('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><script>alert(1)</script></svg>'));
    expect(r).toEqual({ ok: false, errors: ['underlay.svg: Unsafe or unreadable SVG: <script> is not allowed.'] });
  });
});
