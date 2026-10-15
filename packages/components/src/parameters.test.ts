import { describe, expect, it } from 'vitest';
import { routeScene, snapComponent, validateScene, type ComponentInstance, type ScadaScene } from '@scada3d/core';
import { catalogResolvers, componentCatalog, definitionFor, pipeOuterRadius, validateProperties } from './index.js';

const pipe = (id: string, x: number, length?: number): ComponentInstance => ({
  id,
  type: 'pipe',
  position: { x, y: 0.5, z: 0 },
  rotation: { x: 0, y: 0, z: 0, w: 1 },
  scale: { x: 1, y: 1, z: 1 },
  properties: length === undefined ? {} : { length },
});

describe('pipe length parameter', () => {
  it('declares length in metres with a default and a range', () => {
    expect(componentCatalog.pipe.parameters?.length).toEqual({ label: 'Length', unit: 'm', default: 2, min: 0.2, max: 20, step: 0.1 });
  });

  it('builds ports, bounds and geometry from the length', () => {
    const def = definitionFor('pipe', { length: 5 });
    expect(def.ports.map((p) => [p.id, p.position])).toEqual([
      ['in', [-2.5, 0, 0]],
      ['out', [2.5, 0, 0]],
    ]);
    expect(def.bounds).toEqual({ min: [-2.5, -pipeOuterRadius, -pipeOuterRadius], max: [2.5, pipeOuterRadius, pipeOuterRadius] });
    expect(def.defaultSize[0]).toBe(5);
    expect(def.parts).toEqual([expect.objectContaining({ shape: 'cylinder', axis: 'x', length: 5 })]);
  });

  it('uses the default length when none is set, so older scenes look the same', () => {
    expect(definitionFor('pipe', {})).toBe(componentCatalog.pipe);
    expect(definitionFor('pipe')).toBe(componentCatalog.pipe);
  });

  it('returns the same definition object for the same length', () => {
    expect(definitionFor('pipe', { length: 3.5 })).toBe(definitionFor('pipe', { length: 3.5 }));
  });

  it('falls back to the default shape for an invalid length (validation reports it)', () => {
    expect(definitionFor('pipe', { length: -1 })).toBe(componentCatalog.pipe);
    expect(definitionFor('pipe', { length: 'long' })).toBe(componentCatalog.pipe);
  });

  it('returns other types unchanged whatever their properties', () => {
    expect(definitionFor('tank', { length: 5 })).toBe(componentCatalog.tank);
  });
});

describe('validateProperties', () => {
  it.each([
    [{ length: 0.2 }, []],
    [{ length: 20 }, []],
    [{}, []],
    [{ length: 0.1 }, ['length: must be between 0.2 and 20 m']],
    [{ length: 25 }, ['length: must be between 0.2 and 20 m']],
    [{ length: '3' }, ['length: must be a number of m']],
  ])('pipe %o → %o', (properties, messages) => {
    expect(validateProperties('pipe', properties).map((p) => `${p.property}: ${p.message}`)).toEqual(messages);
  });

  it('ignores types without parameters', () => {
    expect(validateProperties('tank', { length: -5 })).toEqual([]);
  });
});

describe('catalogResolvers with core', () => {
  const scene = (...components: ComponentInstance[]): ScadaScene => ({ schemaVersion: 3, units: 'm', components, connections: [] });

  it('rejects an out-of-range length in a scene file with a clear error', () => {
    const result = validateScene(scene(pipe('p', 0, 50)), catalogResolvers);
    expect(result).toEqual({
      ok: false,
      errors: [expect.objectContaining({ code: 'INVALID_PROPERTY', path: 'components[0].properties.length', message: 'must be between 0.2 and 20 m' })],
    });
  });

  it('routes from the port of a long pipe', () => {
    const s: ScadaScene = {
      ...scene(pipe('a', 0, 6), pipe('b', 5.5, 2)),
      connections: [{ id: 'e', from: { instanceId: 'a', portId: 'out' }, to: { instanceId: 'b', portId: 'in' } }],
    };
    const [route] = routeScene(s, catalogResolvers);
    expect(route).toEqual(expect.objectContaining({ status: 'ok', kind: 'straight', from: [3, 0.5, 0], to: [4.5, 0.5, 0] }));
  });

  it('snaps onto the outlet of a long pipe', () => {
    const result = snapComponent(scene(pipe('a', 0, 6)), pipe('b', 4.2, 2), catalogResolvers);
    expect(result).toEqual(expect.objectContaining({ ok: true, position: { x: 4, y: 0.5, z: 0 } }));
  });
});
