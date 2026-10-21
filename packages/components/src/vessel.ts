import type { ComponentInstance, ComponentKind } from '@sakibcoolz/core';
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
    if (p.shape === 'lathe' && (p.axis ?? 'y') === 'y' && !p.holds) {
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

/** Horizontal slice area at local `y` of a part that `holds` liquid, m². */
function holdsAreaAt(p: GeometryPart, y: number): number {
  const dy = y - (p.shape === 'strut' ? 0 : p.center[1]);
  if (p.shape === 'sphere') return Math.PI * Math.max(0, p.radius * p.radius - dy * dy);
  if (p.shape === 'box') return Math.abs(dy) <= p.size[1] / 2 ? p.size[0] * p.size[2] : 0;
  if (p.shape === 'cylinder' && p.axis === 'y') return Math.abs(dy) <= p.length / 2 ? Math.PI * p.radius * p.radius : 0;
  if (p.shape === 'lathe' && (p.axis ?? 'y') === 'y') {
    const i = p.points.findIndex(([, a]) => a >= dy);
    if (i <= 0) return i === 0 && p.points[0][1] === dy ? Math.PI * p.points[0][0] ** 2 : 0;
    const [[r0, a0], [r1, a1]] = [p.points[i - 1], p.points[i]];
    const r = r0 + ((r1 - r0) * (dy - a0)) / (a1 - a0);
    return Math.PI * r * r;
  }
  if (p.shape === 'lathe') {
    // Lying along x or z: chord width 2√(r² − dy²) integrated along the axis, 16 steps a segment.
    let area = 0;
    for (let i = 1; i < p.points.length; i++) {
      const [[r0, a0], [r1, a1]] = [p.points[i - 1], p.points[i]];
      for (let k = 0; k < 16; k++) {
        const r = r0 + ((r1 - r0) * (k + 0.5)) / 16;
        area += (2 * Math.sqrt(Math.max(0, r * r - dy * dy)) * (a1 - a0)) / 16;
      }
    }
    return area;
  }
  return 0;
}

/** Vertical extent of a part that `holds` liquid, local y. */
function holdsRange(p: GeometryPart): [number, number] {
  if (p.shape === 'sphere') return [p.center[1] - p.radius, p.center[1] + p.radius];
  if (p.shape === 'box') return [p.center[1] - p.size[1] / 2, p.center[1] + p.size[1] / 2];
  if (p.shape === 'cylinder' && p.axis === 'y') return [p.center[1] - p.length / 2, p.center[1] + p.length / 2];
  if (p.shape === 'lathe' && (p.axis ?? 'y') === 'y') return [p.center[1] + p.points[0][1], p.center[1] + p.points[p.points.length - 1][1]];
  if (p.shape === 'lathe') {
    const r = Math.max(...p.points.map(([q]) => q));
    return [p.center[1] - r, p.center[1] + r];
  }
  return [0, 0];
}

/** How much a vessel holds below each height: walls from `vesselSegments` plus parts that `holds`. */
export interface VesselProfile {
  /** Local y of the lowest and highest liquid point. */
  bottom: number;
  top: number;
  /** m³ held below local `y`. */
  volumeAt(y: number): number;
  /** Volume is proportional to height (a plain cylinder or box). */
  linear: boolean;
}

/**
 * The vessel profile of a definition's parts, or undefined if nothing holds liquid. Straight and
 * conical walls are integrated exactly; horizontal shells, spheres and boxes over 1024 slices.
 */
export function vesselProfile(parts: readonly GeometryPart[]): VesselProfile | undefined {
  const segments = vesselSegments(parts);
  const holds = parts.filter((p) => p.holds);
  if (segments.length === 0 && holds.length === 0) return undefined;
  const ranges = [...segments.map((s): [number, number] => [s.y0, s.y1]), ...holds.map(holdsRange)];
  const bottom = Math.min(...ranges.map(([a]) => a));
  const top = Math.max(...ranges.map(([, b]) => b));
  const exact = (y: number) => segments.reduce((sum, s) => sum + (y <= s.y0 ? 0 : segmentVolume(s, Math.min(y, s.y1) - s.y0)), 0);
  const n = 1024;
  const step = (top - bottom) / n;
  const table = [0];
  for (let i = 0; i < n && holds.length; i++) {
    const y = bottom + (i + 0.5) * step;
    table.push(table[i] + holds.reduce((sum, p) => sum + holdsAreaAt(p, y), 0) * step);
  }
  const sliced = (y: number) => {
    if (!holds.length || y <= bottom) return 0;
    const t = Math.min(n, (y - bottom) / step);
    const i = Math.min(n - 1, Math.floor(t));
    return table[i] + (table[i + 1] - table[i]) * (t - i);
  };
  const plainCylinder = segments.length === 1 && segments[0].r0 === segments[0].r1 && holds.length === 0;
  const plainBox = segments.length === 0 && holds.length === 1 && holds[0].shape === 'box';
  return { bottom, top, volumeAt: (y) => exact(y) + sliced(y), linear: plainCylinder || plainBox };
}

/** Geometric capacity of a vessel (`vesselProfile`), m³. */
export function capacityOf(parts: readonly GeometryPart[]): number {
  const profile = vesselProfile(parts);
  return profile ? profile.volumeAt(profile.top) : 0;
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
