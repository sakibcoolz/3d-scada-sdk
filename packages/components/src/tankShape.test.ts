import { describe, expect, it } from 'vitest';
import { componentKinds } from '@scada3d/core';
import { capacityOf, catalogResolvers, componentCatalog, componentPresets, definitionFor, formatCapacity, vesselSegments, type GeometryPart } from './index.js';

const plate = (parts: readonly GeometryPart[]) => parts.find((p): p is Extract<GeometryPart, { shape: 'box' }> => p.role === 'plate' && p.shape === 'box');

describe('vertical tank dimensions', () => {
  it('draws the default tank exactly as before: 2 m across, 3 m shell, flat top', () => {
    const d = definitionFor('tank', { diameter: 2, height: 3, head: 'flat' });
    expect(d).toBe(componentCatalog.tank);
    expect(d.ports.map((p) => [p.id, p.position])).toEqual([['inlet', [-1.2, 0.8, 0]], ['outlet', [1.2, -0.9, 0]]]);
    expect(d.bounds).toEqual({ min: [-1.2, -1.535, -1], max: [1.2, 1.535, 1.145] });
  });

  it.each([[1.2, 1.6], [3, 4.5], [6, 10]])('scales the shell, nozzles, gauge and bounds to %s m across and %s m tall', (diameter, height) => {
    const d = definitionFor('tank', { diameter, height });
    const r = diameter / 2;
    const [inlet, outlet] = d.ports;
    expect(inlet.position).toEqual([-(r + 0.2), height / 2 - Math.min(0.7, 0.25 * height), 0]);
    expect(outlet.position).toEqual([r + 0.2, -height / 2 + Math.min(0.6, 0.2 * height), 0]);
    expect(d.bounds.min).toEqual([-(r + 0.2), -height / 2 - 0.035, -r]);
    expect(d.bounds.max[1]).toBeCloseTo(height / 2 + 0.035, 12);
    expect(d.bounds.max[2]).toBeCloseTo(r + 0.145, 12);
    const shell = d.parts.find((p) => p.role === 'shell' && p.shape === 'cylinder' && p.openEnded);
    expect(shell).toMatchObject({ radius: r, length: height });
    const gauge = d.parts.find((p) => p.role === 'gauge');
    if (gauge?.shape !== 'cylinder') throw new Error('expected a gauge tube');
    [0, 0, r + 0.08].forEach((n, i) => expect(gauge.center[i]).toBeCloseTo(n, 12));
    expect(gauge.length).toBeCloseTo(height - 0.2, 12);
  });

  it('puts a 2:1 semi-ellipsoidal head on a dished tank, with the liquid following it', () => {
    const d = definitionFor('tank', { head: 'dished' });
    const head = d.parts.find((p): p is Extract<GeometryPart, { shape: 'lathe' }> => p.role === 'shell' && p.shape === 'lathe');
    if (!head) throw new Error('expected a lathe head');
    expect(head.points[0]).toEqual([1, 1.5]);
    expect(head.points[head.points.length - 1][0]).toBeCloseTo(0, 12);
    expect(head.points[head.points.length - 1][1]).toBeCloseTo(2, 12); // depth D/4
    expect(d.bounds.max[1]).toBeCloseTo(2, 12);
    // No flat top plate on a dished tank; the bottom stays flat.
    expect(d.parts.flatMap((p) => (p.role === 'shell' && p.shape === 'cylinder' && p.axis === 'y' && !p.openEnded && p.radius === 1 ? [p.center[1]] : []))).toEqual([-1.5]);
    const liquid = d.parts.find((p) => p.role === 'liquid' && p.shape === 'lathe');
    expect(liquid?.shape === 'lathe' && liquid.points[liquid.points.length - 1][1]).toBeGreaterThan(1.5);
  });

  it('keeps the stand and nozzle size working with new dimensions', () => {
    const d = definitionFor('tank', { diameter: 3, height: 4, standHeight: 1, nozzleSize: 'DN100' });
    expect(d.bounds.min[1]).toBeCloseTo(-2 - 0.035 - 1, 12);
    expect(d.ports.map((p) => p.nominalSize)).toEqual([0.1, 0.1]);
  });

  it('rejects dimensions out of range and unknown heads', () => {
    expect(catalogResolvers.validateProperties('tank', { diameter: 0.2, height: 50, head: 'cone' }).map((p) => p.property)).toEqual(['diameter', 'height', 'head']);
  });
});

describe('tank capacity', () => {
  it('integrates the shell profile: a cylinder, plus a 2:1 head of (2/3)πR²(D/4)', () => {
    expect(capacityOf(componentCatalog.tank.parts)).toBeCloseTo(Math.PI * 3, 9);
    const dished = capacityOf(definitionFor('tank', { head: 'dished' }).parts);
    expect(dished / (Math.PI * 3 + (2 / 3) * Math.PI * 0.5)).toBeCloseTo(1, 2);
    expect(vesselSegments(componentCatalog.tank.parts)).toEqual([{ y0: -1.5, y1: 1.5, r0: 1, r1: 1 }]);
  });

  it.each([
    [Math.PI * 3, 'm³', '9.42 m³'],
    [Math.PI * 3, 'L', '9,420 L'],
    [Math.PI * 3, 'US gal', '2,490 US gal'],
    [0.0123, 'm³', '0.0123 m³'],
    [1234.5, 'm³', '1,230 m³'],
  ] as const)('formats %d m³ in %s as "%s"', (m3, unit, text) => {
    expect(formatCapacity(m3, unit)).toBe(text);
  });

  it('shows the capacity on the name plate in the chosen unit', () => {
    expect(plate(componentCatalog.tank.parts)?.text).toBe('9.42 m³');
    expect(plate(definitionFor('tank', { capacityUnit: 'US gal' }).parts)?.text).toBe('2,490 US gal');
    expect(plate(definitionFor('tank', { diameter: 3, height: 4.5 }).parts)?.text).toBe('31.8 m³');
  });
});

describe('component presets', () => {
  it('offers Large, Small, Short and dished variants as valid starting properties', () => {
    expect(componentPresets.map((p) => p.label)).toEqual(['Vertical Tank (Dished)', 'Vertical Tank (Large)', 'Vertical Tank (Short)', 'Cylindrical Tank (Large)', 'Cylindrical Tank (Small)']);
    for (const p of componentPresets) {
      expect(componentKinds).toContain(p.type);
      expect(catalogResolvers.validateProperties(p.type, p.properties)).toEqual([]);
      expect(new Set(componentPresets.map((q) => q.id)).size).toBe(componentPresets.length);
    }
  });
});
