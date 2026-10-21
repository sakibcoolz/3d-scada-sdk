import type { ComponentInstance, ComponentKind } from '@scada3d/core';
import type { GeometryPart } from './geometry.js';

/** A slice of a vessel's inner wall along +Y: radius r0 at y0 to r1 at y1 (a frustum). */
export interface VesselSegment {
  y0: number;
  y1: number;
  r0: number;
  r1: number;
}

/**
 * The liquid-holding walls of a vertical vessel: open cylinder and cone shells along Y, and lathe
 * shells (dished heads) as frustums between their profile points, sorted bottom to top.
 */
export function vesselSegments(parts: readonly GeometryPart[]): VesselSegment[] {
  return parts.flatMap((p): VesselSegment[] => {
    if (p.role !== 'shell') return [];
    if (p.shape === 'cylinder' && p.axis === 'y' && p.openEnded) return [{ y0: p.center[1] - p.length / 2, y1: p.center[1] + p.length / 2, r0: p.radius, r1: p.radius }];
    if (p.shape === 'cone' && p.axis === 'y' && p.openEnded) return [{ y0: p.center[1] - p.length / 2, y1: p.center[1] + p.length / 2, r0: p.radiusStart, r1: p.radiusEnd }];
    if (p.shape === 'lathe') {
      return p.points.slice(1).flatMap(([r1, y1], i): VesselSegment[] => {
        const [r0, y0] = p.points[i];
        return y1 > y0 ? [{ y0: p.center[1] + y0, y1: p.center[1] + y1, r0, r1 }] : [];
      });
    }
    return [];
  }).sort((a, b) => a.y0 - b.y0);
}

/** Volume of the first `t` metres of a segment, m³. */
export function segmentVolume(s: VesselSegment, t: number): number {
  const rt = s.r0 + ((s.r1 - s.r0) * t) / (s.y1 - s.y0);
  return (Math.PI / 3) * t * (s.r0 * s.r0 + s.r0 * rt + rt * rt);
}

/** Geometric capacity of a vessel's walls (`vesselSegments`), m³. */
export function capacityOf(parts: readonly GeometryPart[]): number {
  return vesselSegments(parts).reduce((sum, s) => sum + segmentVolume(s, s.y1 - s.y0), 0);
}

/** Units the name plate can show a capacity in. */
export const CAPACITY_UNITS = ['m³', 'L', 'US gal'] as const;
export type CapacityUnit = (typeof CAPACITY_UNITS)[number];

const perCubicMetre: Record<CapacityUnit, number> = { 'm³': 1, L: 1000, 'US gal': 264.172052 };
const threeFigures = new Intl.NumberFormat('en-US', { maximumSignificantDigits: 3 });

/** A capacity to three significant figures, e.g. "9.42 m³", "9,420 L", "2,490 US gal". */
export function formatCapacity(cubicMetres: number, unit: CapacityUnit): string {
  return `${threeFigures.format(cubicMetres * perCubicMetre[unit])} ${unit}`;
}

/** A palette entry: a kind with starting properties, e.g. a large dished vertical tank. */
export interface ComponentPreset {
  id: string;
  type: ComponentKind;
  label: string;
  properties: ComponentInstance['properties'];
}

/** Size and head variants of the vertical tank (owner's tank family, ADR-0017). */
export const componentPresets: readonly ComponentPreset[] = [
  { id: 'tank-dished', type: 'tank', label: 'Vertical Tank (Dished)', properties: { head: 'dished' } },
  { id: 'tank-large', type: 'tank', label: 'Vertical Tank (Large)', properties: { diameter: 3, height: 4.5, head: 'dished' } },
  { id: 'tank-short', type: 'tank', label: 'Vertical Tank (Short)', properties: { diameter: 2.6, height: 1.6, head: 'dished' } },
  { id: 'cylinder-large', type: 'tank', label: 'Cylindrical Tank (Large)', properties: { diameter: 3, height: 4.5 } },
  { id: 'cylinder-small', type: 'tank', label: 'Cylindrical Tank (Small)', properties: { diameter: 1.2, height: 1.6 } },
];
