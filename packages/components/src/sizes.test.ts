import { describe, expect, it } from 'vitest';
import { portToWorld, validateScene, type ComponentInstance, type ComponentKind, type ScadaScene } from '@scada3d/core';
import {
  catalogResolvers,
  componentCatalog,
  definitionFor,
  outerRadiusFor,
  pipeOuterRadius,
  pipeSizes,
  sizeOfPort,
  validateProperties,
  type GeometryPart,
} from './index.js';

const sized: ComponentKind[] = ['pipe', 'elbow', 'tee', 'valve', 'reducer', 'coupler'];

/** Radius of the shell part ending exactly at a port (cylinder, bend or cone end). */
function radiiAtPort(parts: readonly GeometryPart[], position: readonly number[], direction: readonly number[]): number[] {
  const axis = direction.findIndex((n) => n !== 0);
  const close = (a: readonly number[]) => a.every((n, i) => Math.abs(n - position[i]) < 1e-9);
  return parts.flatMap((part) => {
    if (part.role !== 'shell') return [];
    if ((part.shape === 'cylinder' || part.shape === 'cone') && 'xyz'.indexOf(part.axis) === axis) {
      return [-1, 1].flatMap((s) => {
        const end = part.center.map((n, i) => (i === axis ? n + (s * part.length) / 2 : n));
        if (!close(end)) return [];
        return [part.shape === 'cylinder' ? part.radius : s < 0 ? part.radiusStart : part.radiusEnd];
      });
    }
    if (part.shape === 'bend') {
      return [part.startAngle, part.startAngle + Math.PI / 2]
        .map((a) => [part.center[0] + part.bendRadius * Math.cos(a), part.center[1] + part.bendRadius * Math.sin(a), part.center[2]])
        .filter(close)
        .map(() => part.tubeRadius);
    }
    return [];
  });
}

describe('pipe sizes', () => {
  it('offers DN50 to DN200 with the steel-pipe outside diameters, DN150 unchanged', () => {
    expect(Object.keys(pipeSizes)).toEqual(['DN50', 'DN80', 'DN100', 'DN150', 'DN200']);
    expect(pipeSizes.DN50).toEqual({ bore: 0.05, outerDiameter: 0.0603 });
    expect(pipeSizes.DN100).toEqual({ bore: 0.1, outerDiameter: 0.1143 });
    expect(pipeSizes.DN200).toEqual({ bore: 0.2, outerDiameter: 0.2191 });
    expect(outerRadiusFor('DN150')).toBe(pipeOuterRadius);
  });

  it('names the size of a port from its nominal bore', () => {
    expect(sizeOfPort({ id: 'a', kind: 'fluid', position: [0, 0, 0], direction: [1, 0, 0], nominalSize: 0.08 })).toBe('DN80');
    expect(sizeOfPort({ id: 'a', kind: 'fluid', position: [0, 0, 0], direction: [1, 0, 0], nominalSize: 0.123 })).toBeUndefined();
  });

  it('gives each sized kind a size choice that defaults to DN150', () => {
    for (const type of sized) expect(componentCatalog[type].parameters?.size).toEqual({ label: 'Size', choices: Object.keys(pipeSizes), default: 'DN150' });
    for (const type of ['tank', 'pump', 'sensor', 'motor'] as ComponentKind[]) expect(componentCatalog[type].parameters?.size).toBeUndefined();
  });

  it('draws the default catalog exactly as before when no size is given', () => {
    for (const type of ['pipe', 'elbow', 'tee', 'valve'] as ComponentKind[]) {
      expect(definitionFor(type, {})).toBe(componentCatalog[type]);
      expect(definitionFor(type, { size: 'DN150' })).toBe(componentCatalog[type]);
    }
  });

  describe.each(sized.flatMap((type) => Object.keys(pipeSizes).map((size) => [type, size] as const)))('%s at %s', (type, size) => {
    const properties: Record<string, string> = type === 'reducer' ? { size, outletSize: size === 'DN50' ? 'DN80' : 'DN50' } : { size };
    const definition = definitionFor(type, properties);

    it('puts its ports at the size, with pipe-sized parts ending on each', () => {
      for (const port of definition.ports) {
        const portSize = type === 'reducer' && port.id === 'out' ? properties.outletSize! : size;
        expect(port.nominalSize).toBe(pipeSizes[portSize as keyof typeof pipeSizes].bore);
        const radii = radiiAtPort(definition.parts, port.position, port.direction);
        expect(radii.length).toBeGreaterThan(0);
        for (const r of radii) expect(r).toBeCloseTo(outerRadiusFor(portSize as keyof typeof pipeSizes), 12);
      }
    });

    // Pipes and couplers keep their ports at every size; ASME fittings and valves scale (asme.test.ts, valvesNozzles.test.ts).
    if (!['elbow', 'tee', 'reducer', 'valve'].includes(type)) it('keeps every port where the DN150 version has it', () => {
      const base = definitionFor(type, type === 'reducer' ? { outletSize: 'DN100' } : {});
      expect(definition.ports.map((p) => [p.id, p.position, p.direction])).toEqual(base.ports.map((p) => [p.id, p.position, p.direction]));
    });

    it('has bounds that hold every part', () => {
      for (const part of definition.parts) {
        if (part.shape === 'bend' || part.shape === 'lathe' || part.shape === 'ring') continue;
        // Half-extent of the part along each local axis.
        const half = [0, 1, 2].map((i) => {
          if (part.shape === 'sphere') return part.radius;
          if (part.shape === 'box') return part.size[i] / 2;
          const along = 'xyz'.indexOf(part.axis) === i;
          return along ? part.length / 2 : part.shape === 'cylinder' ? part.radius : Math.max(part.radiusStart, part.radiusEnd);
        });
        for (let i = 0; i < 3; i++) {
          expect(part.center[i] - half[i]).toBeGreaterThanOrEqual(definition.bounds.min[i] - 1e-9);
          expect(part.center[i] + half[i]).toBeLessThanOrEqual(definition.bounds.max[i] + 1e-9);
        }
      }
    });
  });

  it('returns the same definition object for the same properties', () => {
    expect(definitionFor('valve', { size: 'DN80' })).toBe(definitionFor('valve', { size: 'DN80', open: false }));
    expect(definitionFor('pipe', { size: 'DN80', length: 3 })).toBe(definitionFor('pipe', { length: 3, size: 'DN80' }));
  });
});

describe('size validation', () => {
  it('accepts the listed sizes and refuses anything else', () => {
    expect(validateProperties('pipe', { size: 'DN100' })).toEqual([]);
    expect(validateProperties('pipe', { size: 'DN125' })).toEqual([{ property: 'size', message: 'must be one of DN50, DN80, DN100, DN150, DN200' }]);
    expect(validateProperties('valve', { size: 150 })).toEqual([{ property: 'size', message: 'must be one of DN50, DN80, DN100, DN150, DN200' }]);
  });

  it('refuses a reducer whose two ends are the same size', () => {
    expect(validateProperties('reducer', { size: 'DN100', outletSize: 'DN100' })).toEqual([{ property: 'outletSize', message: 'must differ from size' }]);
    expect(validateProperties('reducer', { outletSize: 'DN150' })).toEqual([{ property: 'outletSize', message: 'must differ from size' }]);
    expect(validateProperties('reducer', {})).toEqual([]);
  });

  it('limits the coupler length to 0.05–0.2 m', () => {
    expect(validateProperties('coupler', { length: 0.1 })).toEqual([]);
    expect(validateProperties('coupler', { length: 0.3 })).toEqual([{ property: 'length', message: 'must be between 0.05 and 0.2 m' }]);
  });
});

const at = (id: string, type: ComponentKind, x: number, properties: ComponentInstance['properties'] = {}): ComponentInstance => ({
  id,
  type,
  position: { x, y: 0, z: 0 },
  rotation: { x: 0, y: 0, z: 0, w: 1 },
  scale: { x: 1, y: 1, z: 1 },
  properties,
});

describe('joining different sizes', () => {
  it('refuses a DN150 pipe joined straight to a DN100 pipe', () => {
    const scene: ScadaScene = { schemaVersion: 3, units: 'm', components: [at('a', 'pipe', 0, { length: 2 }), at('b', 'pipe', 2, { length: 2, size: 'DN100' })], connections: [{ id: 'j', from: { instanceId: 'a', portId: 'out' }, to: { instanceId: 'b', portId: 'in' } }] };
    const result = validateScene(scene, catalogResolvers);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors[0].code).toBe('INCOMPATIBLE_PORTS');
  });

  it('accepts DN150 pipe → reducer → DN100 pipe, with the reducer ports touching both', () => {
    const reducer = definitionFor('reducer', {});
    const [rin, rout] = reducer.ports;
    const scene: ScadaScene = {
      schemaVersion: 3,
      units: 'm',
      components: [at('a', 'pipe', 0, { length: 2 }), at('r', 'reducer', 1 - rin.position[0]), at('b', 'pipe', 1 - rin.position[0] + rout.position[0] + 1, { length: 2, size: 'DN100' })],
      connections: [
        { id: 'j1', from: { instanceId: 'a', portId: 'out' }, to: { instanceId: 'r', portId: 'in' } },
        { id: 'j2', from: { instanceId: 'r', portId: 'out' }, to: { instanceId: 'b', portId: 'in' } },
      ],
    };
    expect(validateScene(scene, catalogResolvers).ok).toBe(true);
    const world = (id: string, port: string) => {
      const c = scene.components.find((x) => x.id === id)!;
      return portToWorld(c, catalogResolvers.resolvePorts(c.type, c.properties)!.find((p) => p.id === port)!).position;
    };
    for (const [a, b] of [[world('a', 'out'), world('r', 'in')], [world('r', 'out'), world('b', 'in')]]) for (let i = 0; i < 3; i++) expect(a[i]).toBeCloseTo(b[i], 12);
  });

  it('accepts a coupler between two equal pipes', () => {
    const coupler = definitionFor('coupler', { size: 'DN80', length: 0.1 });
    expect(coupler.ports.map((p) => [p.id, p.position, p.nominalSize])).toEqual([
      ['in', [-0.05, 0, 0], 0.08],
      ['out', [0.05, 0, 0], 0.08],
    ]);
  });
});
