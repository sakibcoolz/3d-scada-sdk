import { describe, expect, it } from 'vitest';
import { asmeFlange, flangeParts, flangePairParts, jointStyle, outerRadiusFor, weldParts, type GeometryPart } from './index.js';

// ASME B16.5 Class 150 weld-neck flanges, as published in common tables (to be verified).
describe('ASME B16.5 Class 150 flange table', () => {
  it.each([
    ['DN50', 152.4, 19.1, 120.7, 4, 15.9, 92.1],
    ['DN80', 190.5, 23.9, 152.4, 4, 15.9, 127],
    ['DN100', 228.6, 23.9, 190.5, 8, 15.9, 157.2],
    ['DN150', 279.4, 25.4, 241.3, 8, 19.1, 215.9],
    ['DN200', 342.9, 28.6, 298.5, 8, 19.1, 269.9],
  ] as const)('%s: OD %p, thickness %p, bolt circle %p, %p bolts of %p mm, raised face %p mm', (size, od, t, bc, n, bolt, rf) => {
    const f = asmeFlange[size];
    [f.outsideDiameter, f.thickness, f.boltCircle, f.boltDiameter, f.raisedFace].forEach((v, i) => expect(v).toBeCloseTo([od, t, bc, bolt, rf][i] / 1000, 12));
    expect(f.bolts).toBe(n);
  });
});

describe('jointStyle', () => {
  it.each([
    ['valve', 'pipe', 'flanged'],
    ['tank', 'valve', 'flanged'],
    ['pump', 'elbow', 'flanged'],
    ['conicalTank', 'pipe', 'flanged'],
    ['pipe', 'elbow', 'welded'],
    ['tee', 'reducer', 'welded'],
    ['pipe', 'pipe', 'welded'],
    ['coupler', 'pipe', 'welded'],
  ] as const)('%s ↔ %s is %s', (a, b, style) => {
    expect(jointStyle(a, b)).toBe(style);
    expect(jointStyle(b, a)).toBe(style);
  });
});

const cylinders = (parts: GeometryPart[], role: string) => parts.filter((p): p is Extract<GeometryPart, { shape: 'cylinder' }> => p.shape === 'cylinder' && p.role === role);

describe('flange pair at a joint (joint frame: +X along the first port, faces meet at x = 0)', () => {
  const f = asmeFlange.DN150;
  const parts = flangePairParts('DN150');

  it('has two flange rings of the right size, one each side of the joint', () => {
    const rings = cylinders(parts, 'flange').filter((p) => p.radius === f.outsideDiameter / 2);
    expect(rings).toHaveLength(2);
    expect(rings.map((p) => p.center[0]).sort((a, b) => a - b)).toEqual([-(f.raisedFaceHeight + f.thickness / 2), f.raisedFaceHeight + f.thickness / 2]);
    for (const ring of rings) expect(ring).toMatchObject({ axis: 'x', length: f.thickness });
  });

  it('meets on raised faces at the joint plane', () => {
    const faces = cylinders(parts, 'flange').filter((p) => p.radius === f.raisedFace / 2);
    expect(faces.map((p) => [p.center[0] - p.length / 2, p.center[0] + p.length / 2].map((n) => Math.round(n * 1e9) / 1e9))).toEqual([[-f.raisedFaceHeight, 0], [0, f.raisedFaceHeight]]);
  });

  it('is held by the standard number of bolts on the bolt circle, through both flanges', () => {
    const bolts = cylinders(parts, 'bolt');
    expect(bolts).toHaveLength(f.bolts);
    for (const b of bolts) {
      expect(Math.hypot(b.center[1], b.center[2])).toBeCloseTo(f.boltCircle / 2, 9);
      expect(b.radius).toBeCloseTo(f.boltDiameter / 2, 12);
      expect(b.length).toBeGreaterThan(2 * (f.thickness + f.raisedFaceHeight));
    }
    // Bolts straddle the vertical centre line, as drawn on standard flanges.
    expect(bolts.some((b) => Math.abs(b.center[2]) < 1e-9 && b.center[1] > 0)).toBe(false);
  });

  it('tapers each weld-neck hub down to the pipe', () => {
    const hubs = parts.filter((p) => p.shape === 'cone' && p.role === 'flange');
    expect(hubs).toHaveLength(2);
    for (const h of hubs) if (h.shape === 'cone') expect([h.radiusStart, h.radiusEnd].sort()).toEqual([outerRadiusFor('DN150'), f.hubDiameter / 2].sort());
  });

  it('a single flange (free port) is the first half of the pair', () => {
    const single = flangeParts('DN150');
    expect(single.every((p) => (p.shape === 'cylinder' || p.shape === 'cone') && p.center[0] <= 0)).toBe(true);
    expect(cylinders(single, 'bolt')).toHaveLength(0);
  });
});

describe('weld bead', () => {
  it('is a ring at the pipe surface on the joint plane', () => {
    const [bead] = weldParts('DN100');
    expect(bead).toMatchObject({ shape: 'ring', role: 'weld', center: [0, 0, 0], radius: outerRadiusFor('DN100') });
  });
});
