import { describe, expect, it } from 'vitest';
import { upgradeDimensions, type ComponentInstance, type ScadaScene } from '@sakibcoolz/core';
import { asme, catalogResolvers, sizeParameterFor, definitionFor, legacyCatalogResolvers, outerRadiusFor, pipeSizes, sizeOfPort, type PipeSize } from './index.js';

const sizes = Object.keys(pipeSizes) as PipeSize[];
const span = (type: 'valve', properties = {}) => {
  const [a, b] = definitionFor(type, properties).ports;
  return Math.hypot(...a.position.map((n, i) => n - b.position[i]));
};

// ASME B16.10 Class 150 short pattern, raised face (as published in common tables; to be verified).
describe('ASME B16.10 valve face-to-face', () => {
  it.each([['DN50', 178], ['DN80', 203], ['DN100', 229], ['DN150', 267], ['DN200', 292]] as const)('%s ball valve is %i mm face to face', (size, mm) => {
    expect(asme[size].valveFaceToFace).toBeCloseTo(mm / 1000, 12);
    expect(span('valve', { size })).toBeCloseTo(mm / 1000, 12);
  });

  it.each(sizes)('keeps the %s ball, stem and lever inside the body length and above the bore', (size) => {
    const d = definitionFor('valve', { size });
    const half = asme[size].valveFaceToFace / 2;
    const ball = d.parts.find((p) => p.role === 'valve-ball');
    const lever = d.parts.find((p) => p.role === 'valve-handle');
    if (ball?.shape !== 'sphere' || lever?.shape !== 'box') throw new Error('expected a ball and a lever');
    expect(ball.radius).toBeGreaterThan(outerRadiusFor(size));
    expect(ball.radius).toBeLessThan(half);
    expect(lever.size[0] / 2).toBeLessThanOrEqual(half + 1e-12);
    expect(lever.center[1] - lever.size[1] / 2).toBeGreaterThan(ball.radius);
    expect(d.bounds.min[0]).toBeCloseTo(-half, 12);
    expect(d.bounds.max[0]).toBeCloseTo(half, 12);
  });
});

describe('nozzle sizes', () => {
  it.each(['tank', 'conicalTank'] as const)('%s nozzles take nozzleSize, defaulting to DN150, without moving', (type) => {
    const base = definitionFor(type);
    expect(base.parameters?.nozzleSize).toMatchObject({ default: 'DN150', choices: sizes });
    for (const nozzleSize of sizes) {
      const d = definitionFor(type, { nozzleSize });
      expect(d.ports.map(sizeOfPort)).toEqual(d.ports.map(() => nozzleSize));
      expect(d.ports.map((p) => p.position)).toEqual(base.ports.map((p) => p.position));
    }
  });

  it('keeps the tank stand working alongside the nozzle size', () => {
    const d = definitionFor('tank', { standHeight: 0.8, nozzleSize: 'DN80' });
    expect(d.bounds.min[1]).toBeCloseTo(-1.535 - 0.8, 12);
    expect(d.ports.map(sizeOfPort)).toEqual(['DN80', 'DN80']);
  });

  it('gives the pump separate suction and discharge sizes, both DN150 by default', () => {
    expect(definitionFor('pump').ports.map(sizeOfPort)).toEqual(['DN150', 'DN150']);
    const d = definitionFor('pump', { suctionSize: 'DN100', dischargeSize: 'DN80' });
    expect(d.ports.map(sizeOfPort)).toEqual(['DN100', 'DN80']);
    expect(d.ports.map((p) => p.position)).toEqual(definitionFor('pump').ports.map((p) => p.position));
  });

  it('names the parameter that sizes each port', () => {
    expect(sizeParameterFor('pipe', 'in')).toBe('size');
    expect(sizeParameterFor('reducer', 'in')).toBe('size');
    expect(sizeParameterFor('reducer', 'out')).toBe('outletSize');
    expect(sizeParameterFor('tank', 'outlet')).toBe('nozzleSize');
    expect(sizeParameterFor('conicalTank', 'inlet')).toBe('nozzleSize');
    expect(sizeParameterFor('pump', 'suction')).toBe('suctionSize');
    expect(sizeParameterFor('pump', 'discharge')).toBe('dischargeSize');
    expect(sizeParameterFor('sensor', 'x')).toBeUndefined();
  });

  it('rejects a nozzle size that is not offered', () => {
    expect(catalogResolvers.validateProperties('tank', { nozzleSize: 'DN65' })).toEqual([{ property: 'nozzleSize', message: 'must be one of DN50, DN80, DN100, DN150, DN200' }]);
  });
});

const part = (id: string, type: ComponentInstance['type'], x: number, properties: ComponentInstance['properties'] = {}): ComponentInstance => ({ id, type, position: { x, y: 0, z: 0 }, rotation: { x: 0, y: 0, z: 0, w: 1 }, scale: { x: 1, y: 1, z: 1 }, properties });

describe('older files with 1.2 m valves', () => {
  // Saved after T-050: pipe [-1, 1] — old valve [1, 2.2] — pipe [2.2, 4.2] — ASME elbow at 4.2.
  const saved: ScadaScene = {
    schemaVersion: 3, units: 'm',
    components: [part('p1', 'pipe', 0), part('v', 'valve', 1.6), part('p2', 'pipe', 3.2), part('e', 'elbow', 4.2 + asme.DN150.elbowLR90)],
    connections: [
      { id: 'c1', from: { instanceId: 'p1', portId: 'out' }, to: { instanceId: 'v', portId: 'in' } },
      { id: 'c2', from: { instanceId: 'v', portId: 'out' }, to: { instanceId: 'p2', portId: 'in' } },
      { id: 'c3', from: { instanceId: 'p2', portId: 'out' }, to: { instanceId: 'e', portId: 'in' } },
    ],
  };

  it('closes up around the shorter valve and carries the ASME fittings after it along', () => {
    const r = upgradeDimensions(saved, { ...catalogResolvers, ...legacyCatalogResolvers });
    const x = Object.fromEntries(r.scene.components.map((c) => [c.id, c.position.x]));
    const f = asme.DN150.valveFaceToFace;
    expect(x.v).toBeCloseTo(1 + f / 2, 9);
    expect(x.p2).toBeCloseTo(2 + f, 9);
    expect(x.e).toBeCloseTo(3 + f + asme.DN150.elbowLR90, 9);
    expect(upgradeDimensions(r.scene, { ...catalogResolvers, ...legacyCatalogResolvers }).reseated).toBe(0);
  });
});
