import type { ComponentKind } from '@sakibcoolz/core';
import { asme } from './asme.js';
import type { GeometryPart } from './geometry.js';
import { outerRadiusFor, type PipeSize } from './sizes.js';

// Joints (ADR-0015): bolted flange pairs where a valve, pump or tank is on either side, butt-weld
// beads between pipe and fittings. Drawn per joint by the viewer; ports never move.

export interface AsmeFlange {
  outsideDiameter: number;
  /** Flange ring thickness. */
  thickness: number;
  /** Raised face diameter and height (1.6 mm for Class 150). */
  raisedFace: number;
  raisedFaceHeight: number;
  boltCircle: number;
  bolts: number;
  boltDiameter: number;
  /** Weld-neck hub diameter at the flange and its length beyond the ring. */
  hubDiameter: number;
  hubLength: number;
}

const flange = (od: number, t: number, rf: number, bc: number, n: number, bolt: number, hubX: number, y: number): AsmeFlange => ({
  outsideDiameter: od / 1000, thickness: t / 1000, raisedFace: rf / 1000, raisedFaceHeight: 0.0016, boltCircle: bc / 1000, bolts: n, boltDiameter: bolt / 1000, hubDiameter: hubX / 1000, hubLength: (y - t) / 1000,
});

/**
 * ASME B16.5 Class 150 weld-neck flanges, mm in, metres out. Values as published in common tables
 * (OD, thickness, raised face, bolt circle, bolts × size, hub X, length through hub Y); they must be
 * verified against the standard. Not a certified design tool.
 */
export const asmeFlange: Record<PipeSize, AsmeFlange> = {
  DN50: flange(152.4, 19.1, 92.1, 120.7, 4, 15.9, 77.7, 63.5),
  DN80: flange(190.5, 23.9, 127, 152.4, 4, 15.9, 108, 69.9),
  DN100: flange(228.6, 23.9, 157.2, 190.5, 8, 15.9, 134.9, 76.2),
  DN150: flange(279.4, 25.4, 215.9, 241.3, 8, 19.1, 192, 88.9),
  DN200: flange(342.9, 28.6, 269.9, 298.5, 8, 19.1, 246.1, 101.6),
};

const FLANGED: ReadonlySet<ComponentKind> = new Set<ComponentKind>(['tank', 'conicalTank', 'horizontalTank', 'sphericalTank', 'pool', 'valve', 'pump']);

/** How two parts are joined: flanged if either is a valve, pump or tank; welded otherwise. */
export function jointStyle(a: ComponentKind, b: ComponentKind): 'flanged' | 'welded' {
  return FLANGED.has(a) || FLANGED.has(b) ? 'flanged' : 'welded';
}

/** Whether a free port of this kind ends in a flange (a blind or open flange is drawn). */
export const hasFlangedEnds = (kind: ComponentKind) => FLANGED.has(kind);

/** One weld-neck flange on the −X side of the joint plane (raised face at x = 0). */
function side(size: PipeSize, s: -1 | 1): GeometryPart[] {
  const f = asmeFlange[size];
  const r = outerRadiusFor(size);
  const near = f.raisedFaceHeight + f.thickness;
  return [
    { shape: 'cylinder', role: 'flange', center: [(s * f.raisedFaceHeight) / 2, 0, 0], axis: 'x', radius: f.raisedFace / 2, length: f.raisedFaceHeight },
    { shape: 'cylinder', role: 'flange', center: [s * (f.raisedFaceHeight + f.thickness / 2), 0, 0], axis: 'x', radius: f.outsideDiameter / 2, length: f.thickness },
    s > 0
      ? { shape: 'cone', role: 'flange', center: [near + f.hubLength / 2, 0, 0], axis: 'x', radiusStart: f.hubDiameter / 2, radiusEnd: r, length: f.hubLength }
      : { shape: 'cone', role: 'flange', center: [-(near + f.hubLength / 2), 0, 0], axis: 'x', radiusStart: r, radiusEnd: f.hubDiameter / 2, length: f.hubLength },
  ];
}

/** A bolted flange pair in the joint frame: +X along the first port, raised faces meeting at x = 0. */
export function flangePairParts(size: PipeSize): GeometryPart[] {
  const f = asmeFlange[size];
  const length = 2 * (f.raisedFaceHeight + f.thickness) + 2 * f.boltDiameter;
  const bolts: GeometryPart[] = Array.from({ length: f.bolts }, (_, k) => {
    // Bolt holes straddle the centre lines, as on standard flanges.
    const a = Math.PI / f.bolts + (2 * Math.PI * k) / f.bolts;
    return { shape: 'cylinder', role: 'bolt', center: [0, (f.boltCircle / 2) * Math.cos(a), (f.boltCircle / 2) * Math.sin(a)], axis: 'x', radius: f.boltDiameter / 2, length };
  });
  return [...side(size, -1), ...side(size, 1), ...bolts];
}

/** A single flange for a free flanged port, on the −X side (the port points along −X out of the part). */
export function flangeParts(size: PipeSize): GeometryPart[] {
  return side(size, -1);
}

/** A butt-weld bead on the joint plane at the pipe surface. */
export function weldParts(size: PipeSize): GeometryPart[] {
  return [{ shape: 'ring', role: 'weld', center: [0, 0, 0], axis: 'x', radius: outerRadiusFor(size), tube: Math.max(0.003, 0.6 * asme[size].wallSch40) }];
}
